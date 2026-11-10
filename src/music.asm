; music.asm - the WebSidTracker music player (MIT licence, see ../LICENSE)
; websidtracker format 1, release 0.1.0
;
; Three voices, patterns and order lists, instruments that change the SID every frame
; (pulse sweep, late vibrato, arpeggio, drums). The byte formats and the timing rules are
; described in docs/design-player-format-and-timing.md, how to use the player in docs/player.md.
;
; HOW TO USE (two calls, plus one more to stop):
;       lda #<my_song : ldx #>my_song : jsr music_init     ; start a song
;       jsr music_play                                       ; once per frame, from the raster IRQ
;       jsr music_stop                                       ; silence everything
; The player also needs the instrument tables of instruments.asm (labels inst_wave ... inst_release).
;
; HOW THE FILE IS BUILT, top to bottom:
;   [1] names and constants     [2] the three entry points      [3] reading the song (events)
;   [4] one voice, one frame    [5] the sound features          [6] small helpers
;   [7] the frequency table     [8] the state block (the player's variables)
;
; Registers: X is the voice number (0, 1 or 2) almost everywhere. Y is used for indexing: the instrument
; number, the pitch, or an offset into the song data. Every routine says what it changes.

music_start

; ============================================================================================================
; [1] NAMES AND CONSTANTS
; ============================================================================================================

; Version of this player (see docs/design-versioning-and-releases.md). They produce no bytes; the tracker
; and the tests read them from the symbol list. Keep them equal to FORMAT and RELEASE in web/version.js.
format_version  = 1
release_major   = 0
release_minor   = 1
release_patch   = 0

; The SID chip. Voice 1 starts at $D400, voice 2 at $D407, voice 3 at $D40E: seven registers each.
SID_BASE        = $D400
SID_VOLUME      = SID_BASE + 24         ; master volume in the low nibble
; Offsets of the seven registers of one voice (add the voice's first register in X):
SID_FREQ_LO     = 0                     ; frequency, low byte
SID_FREQ_HI     = 1                     ; frequency, high byte
SID_PW_LO       = 2                     ; pulse width, low byte
SID_PW_HI       = 3                     ; pulse width, high nibble (bits 0-3)
SID_CTRL        = 4                     ; waveform, gate and a few switches
SID_AD          = 5                     ; attack (high nibble), decay (low nibble)
SID_SR          = 6                     ; sustain (high nibble), release (low nibble)

; Bits of the control register:
CTRL_GATE       = %00000001             ; 1 = the note sounds (envelope attack), 0 = it fades (release)
CTRL_TEST       = %00001000             ; 1 = the oscillator is held at zero (we use it for a clean start)
CTRL_NOISE      = %10000000             ; the noise waveform

; Pattern events (the first byte of an event):
EV_REST         = $60                   ; $60 length: a rest. Below $60 is a note: pitch, then length
EV_INSTRUMENT   = $61                   ; $61 n: switch to instrument n
EV_LEGATO       = $62                   ; $62: the next note glides on without restarting the envelope
EV_END          = $FF                   ; end of the pattern
; Order list entries: pattern number and transpose, or one of these two:
ORDER_STOP      = $FE                   ; $FE: this voice stops
ORDER_LOOP      = $FF                   ; $FF n: go on at entry n

; A song header is 9 bytes: the speed, three order list addresses, the pattern table address.
HEADER_ORDER    = 1                     ; offset of the order list address of voice 1 (voice 2 at +2, voice 3 at +4)
HEADER_PATTERNS = 7                     ; offset of the address of the pattern table

; The clean end of a note (see check_release) takes at most RELEASE_MAX frames, and at least 1; at least
; RELEASE_MIN when the instrument's decay is above 0: the SID needs up to 33 ms (just under two frames)
; before a gate-off with AD = SR = 0 has really started, see check_release.
RELEASE_MIN     = 2
RELEASE_MAX     = 32

; A broken song (for example a loop that jumps to a loop) must not hang the player.
; A voice may pass this many order entries in a row without finding a note or a rest.
GUARD_ENTRIES   = 16

; Zero page: the player uses 14 bytes from zp_music on. Change the address if your game needs
; that place (define zp_music before you include this file). Zero page is the fast part of memory:
; instructions that use it are shorter and one cycle quicker, and (pointer),y only works there.
!ifndef zp_music { zp_music = $E0 }
zp_ptr          = zp_music + 0          ; 2 bytes: points into the song (header, order list, pattern)
zp_voice        = zp_music + 2          ; the voice that is being played
zp_tick         = zp_music + 3          ; 1 on the first frame of a tick, otherwise 0
zp_legato       = zp_music + 4          ; 1 when a legato marker was read for the next note
zp_start        = zp_music + 5          ; 1 when this voice starts a new note in this frame
zp_guard        = zp_music + 6          ; counts order entries, see GUARD_ENTRIES
zp_pitch        = zp_music + 7          ; the pitch that decides this frame's frequency
zp_t0           = zp_music + 8          ; scratch byte, see each routine
zp_m_lo         = zp_music + 9          ; multiply and divide: the multiplicand / divisor, low byte
zp_m_hi         = zp_music + 10         ; ... the multiplicand, high byte
zp_r0           = zp_music + 11         ; ... the result (and the multiplier / dividend), low byte
zp_r1           = zp_music + 12         ; ... middle byte
zp_r2           = zp_music + 13         ; ... high byte
; check_release also needs two scratch bytes. It never runs at the same time as multiply and divide,
; so it borrows two of their bytes:
zp_frames_left  = zp_m_lo
zp_ticks_left   = zp_m_hi

; ============================================================================================================
; [2] THE ENTRY POINTS
; ============================================================================================================

; music_init: start a song.  In: A = low byte, X = high byte of the address of the song header.
; Silences the SID, sets the volume to 15, resets all state and puts every voice on the first entry
; of its order list. The first call of music_play plays the first notes.
music_init
        sta st_song_lo
        stx st_song_hi
        jsr clear_sid                   ; all SID registers to 0: no sound, all gates off
        lda #$0F
        sta SID_VOLUME                  ; full volume. The game may change this later
        ; Set every per-voice variable to 0 (instrument 0, pitch 0, no gate, ...)
        lda #0
        ldx #st_voice_size - 1
@clear  sta st_voice_block,x
        dex
        bpl @clear
        sta st_frame_in_tick            ; 0 means: the very next frame is a tick
        sta st_frames
        jsr read_speed
        ; Put each voice on entry 0 of its order list
        ldx #2
@voice  lda #1
        sta st_active,x
        lda #GUARD_ENTRIES
        sta zp_guard
        jsr load_order_entry
        dex
        bpl @voice
        lda #1
        sta st_running
        rts

; music_stop: silence all voices and stop the player. music_play does nothing after this.
music_stop
        jsr clear_sid
        lda #0
        sta st_running
        rts

; music_play: call once per frame. Does all the work: the tick clock, then the three voices in turn.
music_play
        lda st_running
        bne @go
        rts                             ; not playing
@go     cld                             ; binary arithmetic (an interrupt does not clear the decimal flag by itself)
        inc st_frames                   ; counts every frame, the arpeggio uses its lowest bit

        ; --- The tick clock, shared by all voices. st_frame_in_tick = frames left until the next tick.
        ; When it is 0 this frame is a tick: read the speed (the song may have changed it) and start over.
        lda st_frame_in_tick
        beq @tick
        dec st_frame_in_tick
        lda #0
        sta zp_tick
        beq @voices                     ; (always jumps: A is 0)
@tick   jsr read_speed                  ; A = frames per tick
        sec
        sbc #1                          ; this frame is the first of the tick, so speed - 1 are left
        sta st_frame_in_tick
        lda #1
        sta zp_tick

        ; --- Play the three voices. A voice that has stopped (st_active = 0) is skipped.
@voices ldx #0
@next   stx zp_voice
        lda st_active,x
        beq @skip
        jsr play_voice
@skip   ldx zp_voice
        inx
        cpx #3
        bne @next

        ; --- When all three voices have stopped the song is over.
        lda st_active
        ora st_active + 1
        ora st_active + 2
        bne @alive
        sta st_running                  ; A is 0 here
@alive  rts

; ============================================================================================================
; [3] READING THE SONG
; ============================================================================================================

; read_speed: st_speed = the speed byte of the song header (at least 1). Out: A = speed.
read_speed
        lda st_song_lo
        sta zp_ptr
        lda st_song_hi
        sta zp_ptr + 1
        ldy #0
        lda (zp_ptr),y                  ; (zp_ptr),y: read the byte at address zp_ptr + Y
        bne @ok
        lda #1                          ; a speed of 0 makes no sense, use 1
@ok     sta st_speed
        rts

; header_pointer: zp_ptr = the 16-bit address that sits in the song header at offset A.
; The song is read through the header every time (and not copied at the start), so the tracker can
; move order lists and patterns around while the song plays. Clobbers A, Y.
header_pointer
        tay
        lda st_song_lo
        sta zp_ptr
        lda st_song_hi
        sta zp_ptr + 1
        lda (zp_ptr),y                  ; low byte of the address
        pha
        iny
        lda (zp_ptr),y                  ; high byte
        sta zp_ptr + 1
        pla
        sta zp_ptr
        rts

; load_order_entry: look at the order list entry that st_order_pos points to (X = voice).
; A pattern entry makes that pattern current; a loop entry jumps and looks again; a stop entry stops the voice.
load_order_entry
        dec zp_guard
        beq stop_voice                  ; too many entries without a note: the song is broken, stop
        txa
        asl                             ; voice * 2
        clc
        adc #HEADER_ORDER
        jsr header_pointer              ; zp_ptr = this voice's order list
        lda st_order_pos,x
        tay
        lda (zp_ptr),y                  ; first byte of the entry
        cmp #ORDER_STOP
        beq stop_voice
        cmp #ORDER_LOOP
        beq @loop
        ; A pattern entry: pattern number, then the transpose
        pha
        iny
        lda (zp_ptr),y
        sta st_transpose,x
        lda #HEADER_PATTERNS
        jsr header_pointer              ; zp_ptr = the pattern table (a list of 2-byte addresses)
        pla                             ; pattern number n
        asl                             ; 2 * n is the offset in the table. Bit 8 of it goes to the carry
        tay
        bcc @lowpage
        inc zp_ptr + 1                  ; offsets above 255: move the pointer on one page
@lowpage
        lda (zp_ptr),y
        sta st_pat_lo,x                 ; the pattern's address
        iny
        lda (zp_ptr),y
        sta st_pat_hi,x
        lda #0
        sta st_pat_pos,x                ; the next event to read is the first one
        rts
@loop   iny
        lda (zp_ptr),y                  ; the entry number to continue at
        asl                             ; times 2: entries are 2 bytes
        sta st_order_pos,x
        jmp load_order_entry

; stop_voice: this voice is finished and goes silent (X = voice).
stop_voice
        lda #0
        sta st_active,x
        sta st_gate,x
        rts

; fetch_byte: A = the next byte of the current pattern, and move on (X = voice, zp_ptr = the pattern).
; Clobbers Y. Patterns can be at most 255 bytes long because the position is one byte.
fetch_byte
        ldy st_pat_pos,x
        lda (zp_ptr),y
        inc st_pat_pos,x
        rts

; read_events: the current note or rest is over (or the song just started). Read events from the pattern
; until a note or a rest is found. X = voice.
read_events
        lda #GUARD_ENTRIES
        sta zp_guard
        lda #0
        sta zp_legato
@event  lda st_pat_lo,x                 ; point zp_ptr at the current pattern
        sta zp_ptr
        lda st_pat_hi,x
        sta zp_ptr + 1
        jsr fetch_byte                  ; A = first byte of the next event
        cmp #EV_REST
        bcc ev_note                     ; below $60: a note
        beq @rest
        cmp #EV_INSTRUMENT
        beq @instr
        cmp #EV_LEGATO
        beq @legato
        cmp #EV_END
        beq @end
        jmp @event                      ; an unknown byte: ignore it
@instr  jsr fetch_byte                  ; the instrument number
        sta st_instr,x
        jmp @event
@legato lda #1
        sta zp_legato                   ; applies to the next note
        jmp @event
@rest   jsr fetch_byte                  ; the length in ticks
        sta st_ticks_left,x
        lda #0
        sta st_gate,x                   ; a rest is silent: gate off
        rts
@end    lda st_order_pos,x              ; end of the pattern: go on with the next order list entry
        clc
        adc #2
        sta st_order_pos,x
        jsr load_order_entry
        lda st_active,x
        bne @event                      ; the voice goes on with the new pattern
        rts                             ; or it has stopped

; ev_note: a note event was read; A = its pitch (0-95). It is reached by a jump from read_events,
; so it also ends with the rts that read_events ends with.
ev_note
        pha
        lda st_transpose,x
        sta zp_t0
        pla
        jsr add_semitones               ; A = pitch + transpose, kept between 0 and 95
        sta st_pitch,x
        jsr fetch_byte                  ; the length in ticks
        sta st_ticks_left,x
        ; Look at the byte after the note: if it is a legato marker the next note must glide on
        ; from this one, so this note must not end with the gate-off at its end.
        lda #0
        sta st_hold,x
        ldy st_pat_pos,x
        lda (zp_ptr),y
        cmp #EV_LEGATO
        bne @hold_done
        inc st_hold,x
@hold_done
        ; A legato note on a voice that still sounds only changes the pitch. Otherwise start the note.
        lda zp_legato
        beq start_note
        lda st_gate,x
        beq start_note
        rts

; start_note: begin a new note on this voice (X = voice): open the gate, reset the counters,
; take the starting pulse width from the instrument.
start_note
        lda #1
        sta st_gate,x
        sta zp_start                    ; tells write_voice to do the clean start
        lda #0
        sta st_age,x
        sta st_vib_cnt,x                ; 0 = the vibrato has not started
        sta st_vib_off_lo,x
        sta st_vib_off_hi,x
        ldy st_instr,x
        lda inst_pw_lo,y
        sta st_pw_lo,x
        lda inst_pw_hi,y
        sta st_pw_hi,x
        lda inst_pw_step,y
        sta st_pw_step,x
        ; A drum starts its falling tone at the note's frequency, so remember that frequency
        ldy st_pitch,x
        lda freq_lo,y
        sta st_freq_lo,x
        lda freq_hi,y
        sta st_freq_hi,x
        rts

; ============================================================================================================
; [4] ONE VOICE, ONE FRAME
; ============================================================================================================

; play_voice: everything one voice does in one frame (X = voice).
;   1. on a tick: count the note down, and read the next events when it is over
;   2. the end of the note: clear the gate in the last frames (the clean end)
;   3. work out the SID values for this frame (out_freq_lo ... out_sr)
;   4. write them to the SID
;   5. move the counters on
play_voice
        lda #0
        sta zp_start
        lda zp_tick
        beq @sound                      ; between ticks nothing is read
        lda st_ticks_left,x
        beq @read                       ; 0: nothing left, read at once
        dec st_ticks_left,x
        bne @sound                      ; the note goes on
@read   jsr read_events
@sound  jsr check_release
        jsr calc_frequency
        jsr calc_pulse
        jsr calc_control
        jsr write_voice
        ldx zp_voice                    ; write_voice used X for something else
        jmp advance_voice               ; (its rts returns from play_voice)

; check_release: the clean end of a note. In the last inst_release frames of a note the gate is cleared
; (the envelope fades with AD = SR = 0, so it is empty when the next note starts). The count is in frames,
; not ticks. X = voice.
;   frames left in the note, this one included  =  (ticks_left - 1) * speed + st_frame_in_tick + 1
; The loop below adds up one speed per tick that is left, and stops as soon as the sum is more than
; inst_release, so it only runs a few times.
;
; WHY TWO FRAMES (when the decay is above 0). The SID's envelope counts time with a 15-bit "rate counter" that is never reset
; when the rate changes. Writing AD = SR = 0 asks for the fastest rate (a step every 9 cycles). If the counter
; is already past 9 (it nearly always is, after a longer decay or sustain), it first has to count on to
; 32768 and wrap around: up to 33 ms (1.7 frames) in which nothing happens, not even the release.
; If the next note opened its gate in that time, its attack would be stuck behind the same wait and the
; note would start up to two frames late. Two frames of gate-off give the wait time to pass, and the
; envelope is empty when the next note begins. So with a decay above 0 a release of 0 or 1 is played as 2,
; and a note of 1 or 2 frames keeps its gate open to its end (the next note restarts it). With decay 0 the
; counter is never past 9 (the sustain already runs at the fastest rate), nothing has to wait, and one
; frame of release works.
check_release
        lda st_gate,x
        beq @done                       ; nothing sounds
        lda zp_start
        bne @done                       ; a note always sounds for its first frame
        lda st_hold,x
        bne @done                       ; a legato note follows: keep the gate open
        ldy st_instr,x
        lda inst_ad,y
        and #$0F                        ; the decay nibble
        beq @one
        lda #RELEASE_MIN                ; decay above 0: the release is at least 2 frames, see above
        bne @least                      ; (always jumps)
@one    lda #1                          ; decay 0 never needs the wait, so 1 frame is enough. (It is a
                                        ; must: the gate has to go down at least once between two notes)
@least  sta zp_t0                       ; zp_t0 = the smallest release that is allowed
        lda inst_release,y
        cmp zp_t0
        bcs @not_min
        lda zp_t0                       ; a smaller inst_release is played as the smallest
@not_min
        cmp #RELEASE_MAX + 1
        bcc @rel_ok
        lda #RELEASE_MAX                ; a larger value would only make the loop below slow
@rel_ok sta zp_t0                       ; zp_t0 = inst_release, limited to the allowed range
        lda st_frame_in_tick
        clc
        adc #1
        sta zp_frames_left              ; frames left, counting only the current tick
        lda st_ticks_left,x
        beq @counted
        sec
        sbc #1                          ; ticks left after the current one
@counted
        sta zp_ticks_left               ; those ticks
@more   lda zp_t0
        cmp zp_frames_left
        bcc @done                       ; inst_release < frames left: not yet
        lda zp_ticks_left
        beq @end                        ; no more ticks: the note is in its last inst_release frames
        dec zp_ticks_left
        lda zp_frames_left
        clc
        adc st_speed                    ; add one more tick
        sta zp_frames_left
        bcc @more                       ; (a sum over 255 is certainly more than inst_release)
@done   rts
@end    lda zp_frames_left              ; all ticks are added now: the frames that are left in the note
        cmp #2
        bcs @close
        lda inst_ad,y                   ; only this frame is left (a note of 1 or 2 frames). With a decay above 0
        and #$0F                        ; a gate-off of one frame is too short, see above: keep the gate open
        bne @done
@close  lda #0
        sta st_gate,x
        rts

; advance_voice: at the end of the frame: the drum tone falls, and the note gets one frame older.
; X = voice. The age stops at 255.
advance_voice
        ldy st_instr,x
        lda inst_drum_noise,y
        beq @age                        ; not a drum
        lda st_age,x
        cmp inst_drum_noise,y
        bcc @age                        ; the noise phase: the frequency stays
        sec                             ; the tone phase: subtract the fall, but not below 0
        lda st_freq_lo,x
        sbc inst_drum_fall,y
        sta st_freq_lo,x
        lda st_freq_hi,x
        sbc #0
        sta st_freq_hi,x
        bcs @age
        lda #0
        sta st_freq_lo,x
        sta st_freq_hi,x
@age    lda st_age,x
        cmp #255
        beq @done
        inc st_age,x
@done   rts

; write_voice: copy the values of this frame to the SID. The order is always the same: frequency, pulse width,
; envelope, and the control register (with the gate) last. A new note first gets a control write with the
; gate low and the TEST bit set: the oscillator starts from zero, so every note begins in the same way, and
; the gate can open even if it was still open.
;
; A new note also writes AD twice. When the gate opens, the SID uses the DECAY rate for one cycle before it
; switches to the attack rate (a quirk of the chip). The rate counter is at some value below 9 at that moment
; (the voice has been waiting in the fastest release). If attack is 0 the attack rate is the same fast rate,
; and when the counter is at its last step before 9 the one cycle with the slower decay rate makes it miss
; that step: the counter then has to run all the way round (up to 33 ms) and the note starts that much late.
; About one note in nine would be hit. The cure: before the gate opens write AD with the decay nibble set
; equal to the attack nibble, so the rate does not change, and write the real AD a few cycles after the gate.
write_voice
        ldx zp_voice
        lda sid_offset,x
        tax                             ; X = first SID register of this voice
        lda zp_start
        beq @write
        lda out_ctrl
        and #$FF - CTRL_GATE
        ora #CTRL_TEST
        sta SID_BASE + SID_CTRL,x
@write  lda out_freq_lo
        sta SID_BASE + SID_FREQ_LO,x
        lda out_freq_hi
        sta SID_BASE + SID_FREQ_HI,x
        lda out_pw_lo
        sta SID_BASE + SID_PW_LO,x
        lda out_pw_hi
        sta SID_BASE + SID_PW_HI,x
        lda out_ad
        ldy zp_start
        beq @ad                         ; not a new note: AD as it is
        lsr
        lsr
        lsr
        lsr                             ; the attack nibble, moved to the low nibble
        sta zp_t0
        lda out_ad
        and #$F0
        ora zp_t0                       ; AD with decay = attack, for the moment
@ad     sta SID_BASE + SID_AD,x
        lda out_sr
        sta SID_BASE + SID_SR,x
        lda out_ctrl
        sta SID_BASE + SID_CTRL,x       ; this opens (or closes) the gate
        lda zp_start
        beq @done
        lda out_ad
        sta SID_BASE + SID_AD,x         ; a new note: now the real decay
@done   rts

sid_offset
        !byte 0, 7, 14                  ; first SID register of voice 1, 2 and 3

; ============================================================================================================
; [5] THE SOUND FEATURES (what an instrument does while a note sounds)
; ============================================================================================================

; calc_control: out_ctrl (waveform and gate), out_ad, out_sr. X = voice.
; While the gate is closed the envelope values are 0, so the sound fades out at once.
; Only the sustain nibble of inst_sr is used. The release nibble is never heard: the gate only closes with
; AD = SR = 0 (above), and a release value left in SR makes the SID's rate counter run past the fast rate
; that the next attack needs, which delays the next note (see check_release). So it is written as 0.
; A drum plays noise for the first inst_drum_noise frames and its own waveform after that.
calc_control
        ldy st_instr,x
        lda inst_wave,y
        and #$FF - (CTRL_GATE | CTRL_TEST) ; the player decides about gate and test, not the instrument
        sta out_ctrl
        lda inst_drum_noise,y
        beq @gate                       ; not a drum
        lda st_age,x
        cmp inst_drum_noise,y
        bcs @gate                       ; the tone phase
        lda #CTRL_NOISE
        sta out_ctrl                    ; the noise phase
@gate   lda st_gate,x
        beq @closed
        lda out_ctrl
        ora #CTRL_GATE
        sta out_ctrl
        lda inst_ad,y
        sta out_ad
        lda inst_sr,y
        and #$F0                        ; sustain only, the release nibble is cleared
        sta out_sr
        rts
@closed lda #0
        sta out_ad
        sta out_sr
        rts

; calc_pulse: out_pw_lo/hi = the pulse width of this frame, then the sweep moves it on for the next frame.
; The pulse width is 12 bits. The step is a signed byte. When the width (divided by 16) reaches
; inst_pw_max going up, or inst_pw_min going down, it is put exactly on that limit and the sweep turns around.
; Turning around is done with eor #$FF, which is "minus the step, minus 1": a step of 20 becomes -21 and
; then 20 again.   X = voice.
calc_pulse
        lda st_pw_lo,x
        sta out_pw_lo
        lda st_pw_hi,x
        sta out_pw_hi
        lda st_pw_step,x
        beq @done                       ; step 0: no sweep
        clc
        adc st_pw_lo,x                  ; add the step to the 16-bit pulse width
        sta st_pw_lo,x
        lda st_pw_step,x
        and #$80
        beq @high                       ; positive step: the high byte gets 0 + carry
        lda #$FF                        ; negative step: the high byte gets $FF + carry
@high   adc st_pw_hi,x
        sta st_pw_hi,x
        ldy st_instr,x
        lda st_pw_step,x
        bmi @down
        jsr pw_top                      ; going up: is the width at the maximum?
        cmp inst_pw_max,y
        bcc @done
        lda inst_pw_max,y
        jmp @turn
@down   jsr pw_top                      ; going down: is the width at the minimum?
        cmp inst_pw_min,y
        beq @min
        bcs @done
@min    lda inst_pw_min,y
@turn   pha                             ; A = the limit in units of 16: width = limit * 16
        lsr
        lsr
        lsr
        lsr
        sta st_pw_hi,x
        pla
        asl
        asl
        asl
        asl
        sta st_pw_lo,x
        lda st_pw_step,x
        eor #$FF
        sta st_pw_step,x
@done   rts

; pw_top: A = pulse width / 16 (0-255). If the width left the 12-bit range, A = 255 (above) or 0 (below).
pw_top
        lda st_pw_hi,x
        cmp #$10
        bcs @outside
        asl
        asl
        asl
        asl
        sta zp_t0                       ; high nibble moved to the top of the byte
        lda st_pw_lo,x
        lsr
        lsr
        lsr
        lsr
        ora zp_t0
        rts
@outside
        cmp #$80
        bcs @below
        lda #255
        rts
@below  lda #0
        rts

; calc_frequency: out_freq_lo/hi. X = voice.
;   A drum uses its running frequency (st_freq), which starts at the note and falls (see advance_voice).
;   Any other note: look the pitch up in the frequency table, then add the vibrato.
;   The arpeggio raises the pitch by inst_arp semitones on every second frame.
calc_frequency
        ldy st_instr,x
        lda inst_drum_noise,y
        beq @melodic
        lda st_freq_lo,x
        sta out_freq_lo
        lda st_freq_hi,x
        sta out_freq_hi
        rts
@melodic
        lda st_pitch,x
        sta zp_pitch
        lda inst_arp,y
        beq @lookup                     ; 0 = no arpeggio
        sta zp_t0
        lda st_frames
        and #1
        beq @lookup                     ; even frames: the note itself
        lda st_pitch,x                  ; odd frames: the note plus the offset
        jsr add_semitones
        sta zp_pitch
@lookup ldy zp_pitch
        lda freq_lo,y
        sta out_freq_lo
        lda freq_hi,y
        sta out_freq_hi
        ; fall through into the vibrato

; vibrato: adds the vibrato offset to out_freq. It does nothing until inst_vib_delay frames have passed.
; The offset swings like a triangle: it grows by one step per frame to a peak, then falls by the same
; step to the opposite peak, and so on. The peak is inst_vib_depth/16 of the distance to the neighbouring
; semitone, so the vibrato sounds equally wide on low and high notes. inst_vib_speed is the number of frames
; of one swing from one peak to the other (an odd number is rounded down). The first swing starts from the
; middle and is half as long.
; State: st_vib_cnt = frames left in this swing (0 = not started), st_vib_off = the offset (signed 16 bits),
; st_vib_step = the signed amount added per frame.
vibrato
        ldy st_instr,x
        lda inst_vib_depth,y
        beq @done                       ; depth 0 = no vibrato
        lda st_age,x
        cmp inst_vib_delay,y
        bcc @done                       ; the delay has not passed yet
        lda st_vib_cnt,x
        bne @running
        jsr vibrato_start               ; the first frame of the vibrato: offset 0
        jmp @apply
@running
        clc                             ; offset = offset + step
        lda st_vib_off_lo,x
        adc st_vib_step_lo,x
        sta st_vib_off_lo,x
        lda st_vib_off_hi,x
        adc st_vib_step_hi,x
        sta st_vib_off_hi,x
        dec st_vib_cnt,x
        bne @apply
        sec                             ; the swing is over: step = 0 - step (turn around)
        lda #0
        sbc st_vib_step_lo,x
        sta st_vib_step_lo,x
        lda #0
        sbc st_vib_step_hi,x
        sta st_vib_step_hi,x
        jsr vibrato_swing
        sta st_vib_cnt,x                ; a full swing is inst_vib_speed frames
@apply  clc                             ; out_freq = out_freq + offset (16 bits)
        lda out_freq_lo
        adc st_vib_off_lo,x
        sta out_freq_lo
        lda out_freq_hi
        adc st_vib_off_hi,x
        sta out_freq_hi
        lda st_vib_off_hi,x             ; (lda does not change the carry)
        bmi @minus
        bcc @done
        lda #$FF                        ; positive offset and the sum overflowed: stay at the top
        sta out_freq_lo
        sta out_freq_hi
        rts
@minus  bcs @done                       ; negative offset, carry set: the result is still >= 0
        lda #0
        sta out_freq_lo
        sta out_freq_hi
@done   rts

; vibrato_swing: A = frames of one swing = inst_vib_speed made even (rounded down), at least 2. Y = instrument.
; The first swing goes from the middle to the peak and takes half as many frames as a full swing; with an
; even number of frames both are whole numbers and the vibrato is exactly symmetrical.
vibrato_swing
        lda inst_vib_speed,y
        and #$FE                        ; clear bit 0: 5 becomes 4
        bne @ok
        lda #2                          ; 0 and 1 become 2
@ok     rts

; vibrato_start: work out the step per frame and begin the first (half) swing. X = voice.
;   delta = frequency of the pitch - frequency of the semitone below it
;   peak  = delta * depth / 16                  (depth is limited to 127)
;   step  = peak / (frames of half a swing)
vibrato_start
        ldy st_pitch,x
        bne @above0
        iny                             ; pitch 0 has no semitone below: use the distance from 0 to 1
@above0 sec
        lda freq_lo,y
        sbc freq_lo - 1,y
        sta zp_m_lo
        lda freq_hi,y
        sbc freq_hi - 1,y
        sta zp_m_hi
        ldy st_instr,x
        lda inst_vib_depth,y
        bpl @depth
        lda #127
@depth  sta zp_r0
        jsr multiply                    ; zp_r2:r1:r0 = delta * depth
        ldy #4                          ; divide by 16
@shift  lsr zp_r2
        ror zp_r1
        ror zp_r0
        dey
        bne @shift                      ; zp_r1:r0 = peak
        ldy st_instr,x
        jsr vibrato_swing               ; A = frames per swing
        lsr                             ; half of it: the first swing goes from the middle to the peak
        sta zp_m_lo
        jsr divide                      ; zp_r1:r0 = peak / half swing = step
        lda zp_r0
        sta st_vib_step_lo,x
        lda zp_r1
        sta st_vib_step_hi,x
        lda zp_m_lo
        sta st_vib_cnt,x
        lda #0
        sta st_vib_off_lo,x
        sta st_vib_off_hi,x
        rts

; ============================================================================================================
; [6] SMALL HELPERS
; ============================================================================================================

; clear_sid: write 0 to the 25 write-only SID registers. Voices silent, volume 0.
clear_sid
        lda #0
        ldx #24
@loop   sta SID_BASE,x
        dex
        bpl @loop
        rts

; add_semitones: A = A + the signed offset in zp_t0, kept between 0 and 95. Used for the transpose and the
; arpeggio. The sum is worked out in 8 bits: a positive offset cannot carry (95 + 127 < 256); with a
; negative offset the carry stays set as long as the result is not below 0.
add_semitones
        bit zp_t0                       ; bit 7 of zp_t0 goes to the N flag: the sign of the offset
        bmi @minus
        clc
        adc zp_t0
        cmp #96
        bcc @ok
        lda #95                         ; too high
@ok     rts
@minus  clc
        adc zp_t0
        bcs @ok
        lda #0                          ; below 0
        rts

; multiply: zp_r2:r1:r0 = zp_m_hi:m_lo * zp_r0   (16 bit times 8 bit = 24 bit). Clobbers A, Y.
; Shift and add: for each bit of the multiplier (lowest first) add the multiplicand to the top two bytes,
; then shift the 3-byte result one place to the right. The multiplier bits leave on the right
; while the product enters from the left.
multiply
        lda #0
        sta zp_r1
        sta zp_r2
        ldy #8
@bit    clc
        lda zp_r0
        and #1                          ; the bit that is being used now
        beq @shift
        lda zp_r1
        adc zp_m_lo
        sta zp_r1
        lda zp_r2
        adc zp_m_hi
        sta zp_r2                       ; (the carry of this add shifts into the result below)
@shift  ror zp_r2
        ror zp_r1
        ror zp_r0
        dey
        bne @bit
        rts

; divide: zp_r1:r0 = zp_r1:r0 / zp_m_lo   (16 bit by 8 bit, the divisor must be 1-127). Clobbers A, Y.
; Long division, as on paper: shift the dividend left one bit at a time into the remainder (in A).
; Whenever the remainder is at least the divisor, subtract it and put a 1 into the quotient. The quotient
; bits enter on the right of the dividend where its bits have just left.
divide
        lda #0                          ; the remainder
        ldy #16
@bit    asl zp_r0
        rol zp_r1
        rol                             ; the next dividend bit goes into the remainder
        cmp zp_m_lo
        bcc @next
        sbc zp_m_lo                     ; (the carry is set, so this subtracts exactly the divisor)
        inc zp_r0                       ; quotient bit = 1
@next   dey
        bne @bit
        rts

; ============================================================================================================
; [7] THE FREQUENCY TABLE
; ============================================================================================================
; 96 notes, index 0 = C-0 ... index 57 = A-4 = 440 Hz ... index 95 = B-7. PAL clock.
; The SID adds the 16-bit frequency value to a 24-bit counter every cycle, so
;       value = round(hz * 2^24 / clock)           with clock = 985248 Hz
; The assembler works the table out, there are no typed-in numbers. Values over 65535 would not fit in
; 16 bits and stop at 65535 (only the highest note).
CLOCK_PAL       = 985248

freq_lo
!for note, 0, 95 {
        !set f = int(440.0 * 2.0^((note - 57) / 12.0) * 16777216.0 / CLOCK_PAL + 0.5)
        !if f > 65535 { !set f = 65535 }
        !byte <f
}
freq_hi
!for note, 0, 95 {
        !set f = int(440.0 * 2.0^((note - 57) / 12.0) * 16777216.0 / CLOCK_PAL + 0.5)
        !if f > 65535 { !set f = 65535 }
        !byte >f
}

; ============================================================================================================
; [8] THE STATE BLOCK
; ============================================================================================================
; All variables of the player. They are in RAM next to the code (not in zero page). The tracker reads
; and changes some of them while a song plays, so their labels are exported (see docs/player.md).
; Per-voice variables are arrays of 3 bytes: index 0, 1, 2 = voice 1, 2, 3.
; music_init does not need initial values here, it clears everything itself.

; --- global
st_song_lo      !byte 0                 ; address of the song header
st_song_hi      !byte 0
st_speed        !byte 0                 ; frames per tick (read from the song header at every tick)
st_frame_in_tick !byte 0                ; frames left until the next tick (0: the next frame is a tick)
st_running      !byte 0                 ; 1 while a song plays, 0 when stopped or finished
st_frames       !byte 0                 ; frame counter, wraps around. Bit 0 drives the arpeggio

; --- what the SID gets this frame (the values are worked out first, then written together)
out_freq_lo     !byte 0
out_freq_hi     !byte 0
out_pw_lo       !byte 0
out_pw_hi       !byte 0
out_ctrl        !byte 0
out_ad          !byte 0
out_sr          !byte 0

; --- per voice. music_init clears this whole block to 0.
st_voice_block
st_order_pos    !fill 3, 0              ; byte offset in the voice's order list (a multiple of 2)
st_pat_lo       !fill 3, 0              ; address of the current pattern's first byte
st_pat_hi       !fill 3, 0
st_pat_pos      !fill 3, 0              ; offset in the pattern of the NEXT event to read
st_ticks_left   !fill 3, 0              ; ticks left of the current note or rest (0: read the next event)
st_instr        !fill 3, 0              ; the current instrument
st_pitch        !fill 3, 0              ; the pitch of the current note (0-95, transpose included)
st_transpose    !fill 3, 0              ; transpose of the current order entry (signed)
st_active       !fill 3, 0              ; 1 = the voice plays, 0 = it has stopped
st_gate         !fill 3, 0              ; 1 = the note sounds (gate open), 0 = silent
st_hold         !fill 3, 0              ; 1 = a legato note follows, so the gate stays open to the end
st_age          !fill 3, 0              ; frames since the note started (stops at 255)
st_pw_lo        !fill 3, 0              ; the pulse width now (12 bits) ...
st_pw_hi        !fill 3, 0
st_pw_step      !fill 3, 0              ; ... and the step it moves by (signed, turns around at the limits)
st_freq_lo      !fill 3, 0              ; a drum's running frequency
st_freq_hi      !fill 3, 0
st_vib_cnt      !fill 3, 0              ; vibrato: frames left in this swing (0: not started)
st_vib_off_lo   !fill 3, 0              ; vibrato: the offset added to the frequency (signed 16 bits) ...
st_vib_off_hi   !fill 3, 0
st_vib_step_lo  !fill 3, 0              ; ... and the signed step it changes by per frame
st_vib_step_hi  !fill 3, 0
st_voice_size = * - st_voice_block

music_end
music_size = music_end - music_start
