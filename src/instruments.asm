; instruments.asm - the default instrument set (MIT licence, see ../LICENSE)
;
; An instrument is one entry in each of 15 tables. The tables are 256 bytes long and sit one after
; the other, starting at $2000 (the runner puts the assembler there). The player reaches field F of
; instrument N with   ldy N : lda F,y   so no instrument needs more than the same index in every table.
; The tracker writes this layout; the exported game files may use shorter tables.
;
; Instruments in this set (the number is the index in every table):
;    0 Bass       pulse bass with a slow pulse sweep
;    1 Lead       pulse lead, vibrato that starts late
;    2 Pad        pulse, slow attack, gentle late vibrato
;    3 Pluck      short pulse note that dies away by itself
;    4 Kick       drum: a click, then a triangle tone that falls
;    5 Snare      drum: noise that gets darker
;    6 Hat        drum: a very short noise tick
;    7 Arp 5th    pulse that jumps up a fifth on every second frame
;    8 Tom        drum: triangle tone that falls slowly
;    9 Open hat   drum: longer noise
;   10 Saw lead   sawtooth lead with vibrato
;   11 Tri bass   soft triangle bass
;   12 Octave arp pulse that jumps up an octave on every second frame
;
; Envelope numbers (hex digit -> time):  attack 0 = 2 ms, 2 = 16 ms, 4 = 38 ms, 6 = 68 ms, 9 = 250 ms
; decay 1 = 24 ms, 3 = 72 ms, 5 = 168 ms, 7 = 240 ms, 8 = 300 ms, 9 = 750 ms.  Sustain 0-F is the level.
; The release nibble (low nibble of inst_sr) is not used: the player ends every note with its own clean
; end, see inst_release.

; Pads the table that started at the given label up to 256 bytes with zeros.
!macro end_of_table .start {
        !fill 256 - (* - .start), 0
}

; waveform bits: $10 triangle, $20 sawtooth, $40 pulse, $80 noise (no gate bit: the player adds it)
inst_wave
        !byte $40               ; 0  Bass
        !byte $40               ; 1  Lead
        !byte $40               ; 2  Pad
        !byte $40               ; 3  Pluck
        !byte $10               ; 4  Kick: triangle
        !byte $80               ; 5  Snare: noise
        !byte $80               ; 6  Hat: noise
        !byte $40               ; 7  Arp 5th
        !byte $10               ; 8  Tom: triangle
        !byte $80               ; 9  Open hat: noise
        !byte $20               ; 10 Saw lead
        !byte $10               ; 11 Tri bass
        !byte $40               ; 12 Octave arp
        +end_of_table inst_wave

; attack (high nibble) and decay (low nibble)
inst_ad
        !byte $07               ; 0  Bass
        !byte $08               ; 1  Lead
        !byte $69               ; 2  Pad
        !byte $04               ; 3  Pluck
        !byte $05               ; 4  Kick
        !byte $03               ; 5  Snare
        !byte $01               ; 6  Hat
        !byte $09               ; 7  Arp 5th
        !byte $06               ; 8  Tom
        !byte $05               ; 9  Open hat
        !byte $08               ; 10 Saw lead
        !byte $08               ; 11 Tri bass
        !byte $08               ; 12 Octave arp
        +end_of_table inst_ad

; sustain level (high nibble) and release (low nibble, not used)
inst_sr
        !byte $A0               ; 0  Bass
        !byte $C0               ; 1  Lead
        !byte $B0               ; 2  Pad
        !byte $00               ; 3  Pluck
        !byte $00               ; 4  Kick
        !byte $00               ; 5  Snare
        !byte $00               ; 6  Hat
        !byte $90               ; 7  Arp 5th
        !byte $00               ; 8  Tom
        !byte $00               ; 9  Open hat
        !byte $B0               ; 10 Saw lead
        !byte $C0               ; 11 Tri bass
        !byte $A0               ; 12 Octave arp
        +end_of_table inst_sr

; starting pulse width, low byte. The pulse width is 12 bits: $0800 is a square wave.
inst_pw_lo
        !byte $00               ; 0  Bass
        !byte $00               ; 1  Lead
        !byte $00               ; 2  Pad
        !byte $00               ; 3  Pluck
        !byte $00               ; 4  Kick (not a pulse)
        !byte $00               ; 5  Snare
        !byte $00               ; 6  Hat
        !byte $00               ; 7  Arp 5th
        !byte $00               ; 8  Tom
        !byte $00               ; 9  Open hat
        !byte $00               ; 10 Saw lead
        !byte $00               ; 11 Tri bass
        !byte $00               ; 12 Octave arp
        +end_of_table inst_pw_lo

; starting pulse width, high nibble
inst_pw_hi
        !byte $04               ; 0  Bass:   $0400
        !byte $06               ; 1  Lead:   $0600
        !byte $08               ; 2  Pad:    $0800
        !byte $05               ; 3  Pluck:  $0500
        !byte $00               ; 4  Kick
        !byte $00               ; 5  Snare
        !byte $00               ; 6  Hat
        !byte $08               ; 7  Arp 5th
        !byte $00               ; 8  Tom
        !byte $00               ; 9  Open hat
        !byte $00               ; 10 Saw lead
        !byte $00               ; 11 Tri bass
        !byte $08               ; 12 Octave arp
        +end_of_table inst_pw_hi

; pulse sweep: signed amount added to the pulse width every frame (0 = no sweep)
inst_pw_step
        !byte 24                ; 0  Bass
        !byte 8                 ; 1  Lead
        !byte 6                 ; 2  Pad
        !byte 30                ; 3  Pluck
        !byte 0                 ; 4  Kick
        !byte 0                 ; 5  Snare
        !byte 0                 ; 6  Hat
        !byte 20                ; 7  Arp 5th
        !byte 0                 ; 8  Tom
        !byte 0                 ; 9  Open hat
        !byte 0                 ; 10 Saw lead
        !byte 0                 ; 11 Tri bass
        !byte 14                ; 12 Octave arp
        +end_of_table inst_pw_step

; sweep limits, in units of 16 (so $20 means a pulse width of $200). The sweep turns around there.
inst_pw_min
        !byte $20               ; 0  Bass
        !byte $30               ; 1  Lead
        !byte $40               ; 2  Pad
        !byte $20               ; 3  Pluck
        !byte 0                 ; 4  Kick
        !byte 0                 ; 5  Snare
        !byte 0                 ; 6  Hat
        !byte $30               ; 7  Arp 5th
        !byte 0                 ; 8  Tom
        !byte 0                 ; 9  Open hat
        !byte 0                 ; 10 Saw lead
        !byte 0                 ; 11 Tri bass
        !byte $30               ; 12 Octave arp
        +end_of_table inst_pw_min

inst_pw_max
        !byte $C0               ; 0  Bass
        !byte $A0               ; 1  Lead
        !byte $C0               ; 2  Pad
        !byte $D0               ; 3  Pluck
        !byte 0                 ; 4  Kick
        !byte 0                 ; 5  Snare
        !byte 0                 ; 6  Hat
        !byte $D0               ; 7  Arp 5th
        !byte 0                 ; 8  Tom
        !byte 0                 ; 9  Open hat
        !byte 0                 ; 10 Saw lead
        !byte 0                 ; 11 Tri bass
        !byte $D0               ; 12 Octave arp
        +end_of_table inst_pw_max

; vibrato: frames after the note start before it begins
inst_vib_delay
        !byte 0                 ; 0  Bass
        !byte 10                ; 1  Lead
        !byte 20                ; 2  Pad
        !byte 0                 ; 3  Pluck
        !byte 0                 ; 4  Kick
        !byte 0                 ; 5  Snare
        !byte 0                 ; 6  Hat
        !byte 0                 ; 7  Arp 5th
        !byte 0                 ; 8  Tom
        !byte 0                 ; 9  Open hat
        !byte 16                ; 10 Saw lead
        !byte 0                 ; 11 Tri bass
        !byte 0                 ; 12 Octave arp
        +end_of_table inst_vib_delay

; vibrato depth: how far the pitch moves to each side, in 1/16 of the distance to the next semitone (0 = off)
inst_vib_depth
        !byte 0                 ; 0  Bass
        !byte 3                 ; 1  Lead
        !byte 2                 ; 2  Pad
        !byte 0                 ; 3  Pluck
        !byte 0                 ; 4  Kick
        !byte 0                 ; 5  Snare
        !byte 0                 ; 6  Hat
        !byte 0                 ; 7  Arp 5th
        !byte 0                 ; 8  Tom
        !byte 0                 ; 9  Open hat
        !byte 3                 ; 10 Saw lead
        !byte 0                 ; 11 Tri bass
        !byte 0                 ; 12 Octave arp
        +end_of_table inst_vib_depth

; vibrato speed: frames for one swing from one side to the other (use an even number, 2 or more)
inst_vib_speed
        !byte 0                 ; 0  Bass
        !byte 4                 ; 1  Lead
        !byte 6                 ; 2  Pad
        !byte 0                 ; 3  Pluck
        !byte 0                 ; 4  Kick
        !byte 0                 ; 5  Snare
        !byte 0                 ; 6  Hat
        !byte 0                 ; 7  Arp 5th
        !byte 0                 ; 8  Tom
        !byte 0                 ; 9  Open hat
        !byte 4                 ; 10 Saw lead
        !byte 0                 ; 11 Tri bass
        !byte 0                 ; 12 Octave arp
        +end_of_table inst_vib_speed

; arpeggio: on every second frame the pitch is raised by this many semitones (signed, 0 = off)
inst_arp
        !byte 0                 ; 0  Bass
        !byte 0                 ; 1  Lead
        !byte 0                 ; 2  Pad
        !byte 0                 ; 3  Pluck
        !byte 0                 ; 4  Kick
        !byte 0                 ; 5  Snare
        !byte 0                 ; 6  Hat
        !byte 7                 ; 7  Arp 5th: a fifth up
        !byte 0                 ; 8  Tom
        !byte 0                 ; 9  Open hat
        !byte 0                 ; 10 Saw lead
        !byte 0                 ; 11 Tri bass
        !byte 12                ; 12 Octave arp: an octave up
        +end_of_table inst_arp

; drum: frames of noise at the start of the note (0 = this is not a drum)
inst_drum_noise
        !byte 0                 ; 0  Bass
        !byte 0                 ; 1  Lead
        !byte 0                 ; 2  Pad
        !byte 0                 ; 3  Pluck
        !byte 1                 ; 4  Kick
        !byte 1                 ; 5  Snare
        !byte 1                 ; 6  Hat
        !byte 0                 ; 7  Arp 5th
        !byte 1                 ; 8  Tom
        !byte 1                 ; 9  Open hat
        !byte 0                 ; 10 Saw lead
        !byte 0                 ; 11 Tri bass
        !byte 0                 ; 12 Octave arp
        +end_of_table inst_drum_noise

; drum: after the noise the tone starts at the note's pitch and falls by this much (frequency register
; units, 17 units are about 1 Hz) on every frame
inst_drum_fall
        !byte 0                 ; 0  Bass
        !byte 0                 ; 1  Lead
        !byte 0                 ; 2  Pad
        !byte 0                 ; 3  Pluck
        !byte 150               ; 4  Kick
        !byte 250               ; 5  Snare
        !byte 0                 ; 6  Hat
        !byte 0                 ; 7  Arp 5th
        !byte 120               ; 8  Tom
        !byte 0                 ; 9  Open hat
        !byte 0                 ; 10 Saw lead
        !byte 0                 ; 11 Tri bass
        !byte 0                 ; 12 Octave arp
        +end_of_table inst_drum_fall

; release: how many frames at the end of every note the gate stays closed, so the next note starts clean
inst_release
        !byte 2                 ; 0  Bass
        !byte 2                 ; 1  Lead
        !byte 2                 ; 2  Pad
        !byte 2                 ; 3  Pluck
        !byte 2                 ; 4  Kick
        !byte 2                 ; 5  Snare
        !byte 1                 ; 6  Hat
        !byte 2                 ; 7  Arp 5th
        !byte 2                 ; 8  Tom
        !byte 2                 ; 9  Open hat
        !byte 2                 ; 10 Saw lead
        !byte 2                 ; 11 Tri bass
        !byte 2                 ; 12 Octave arp
        +end_of_table inst_release
