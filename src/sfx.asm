; sfx.asm - the default sound effects (MIT licence, see ../LICENSE)
;
; A sound effect is a short stream of pattern events with its own speed. The game starts one with
;       lda #SFX_ZAP : ldx #1 : jsr sfx_play         ; effect SFX_ZAP on voice 2
; The music of that voice keeps counting while the effect plays, and comes back at its next note.
;
; Layout (the runner puts this file at $3100; the tracker writes the same layout there):
;   sfx_lo, sfx_hi   the address of every effect (64 entries each here; an exported file has one per effect)
;   sfx_voice        the voice each effect was made for (0, 1, 2). Only a suggestion: the game picks the voice
;   sfx_count        how many effects there are
;   the effects      each one: its speed (frames per tick), its events, $FF
; The events are the ones of a pattern: a note is pitch (0-95) and length in ticks, $60 length is a rest,
; $61 n switches to instrument n, $62 makes the next note legato. An effect has no transpose.

SFX_ZAP         = 0
SFX_TING        = 1
SFX_BOOM        = 2

!macro end_of_sfx_table .start {
        !fill 64 - (* - .start), 0
}

sfx_lo
        !byte <sfx_zap, <sfx_ting, <sfx_boom
        +end_of_sfx_table sfx_lo
sfx_hi
        !byte >sfx_zap, >sfx_ting, >sfx_boom
        +end_of_sfx_table sfx_hi
sfx_voice
        !byte 1, 2, 2
        +end_of_sfx_table sfx_voice
sfx_count
        !byte 3

sfx_zap                                 ; a laser: a pulse note that slides down fast
        !byte 1                         ; speed: a tick is one frame
        !byte $61, 13                   ; instrument 13, Zap
        !byte 72, 12                    ; C-6 for 12 frames
        !byte $FF

sfx_ting                                ; two bell notes, a fourth apart
        !byte 1
        !byte $61, 14                   ; instrument 14, Ting
        !byte 78, 10                    ; F#6 for 10 frames
        !byte 83, 20                    ; B-6 for 20 frames
        !byte $FF

sfx_boom                                ; an explosion: noise that rumbles down
        !byte 1
        !byte $61, 15                   ; instrument 15, Boom
        !byte 52, 40                    ; E-4 for 40 frames
        !byte $FF
