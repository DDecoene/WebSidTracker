; song_demo.asm - a short original demo tune (MIT licence, see ../LICENSE)
;
; A minor, 8 bars of 16 ticks, then it loops. Speed 6: a tick is 6 frames (0.12 s), a bar is 1.9 s.
;   voice 1: bass (one bass pattern, played on the chords A minor, F, C, G with a transpose),
;            and an arpeggio in the last two bars
;   voice 2: lead melody, two phrases of 4 bars, the second one with a legato glide
;   voice 3: drums (kick, snare, hat), a tom fill in the last bar
;
; Format: see docs/design-player-format-and-timing.md. Pitch numbers: 12 per octave, C-0 = 0.
; Notes are written as  octave + note name,  for example  o4 + nA  is A-4 (pitch 57).

o0 = 0
o1 = 12
o2 = 24
o3 = 36
o4 = 48
o5 = 60
o6 = 72
o7 = 84
nC  = 0
nCs = 1
nD  = 2
nDs = 3
nE  = 4
nF  = 5
nFs = 6
nG  = 7
nGs = 8
nA  = 9
nAs = 10
nB  = 11

; The instruments (numbers in instruments.asm)
iBass     = 0
iLead     = 1
iKick     = 4
iSnare    = 5
iHat      = 6
iArp5     = 7
iTom      = 8
iSawLead  = 10

song_demo
        !byte 6                         ; speed: frames per tick
        !word order_v1, order_v2, order_v3
        !word pattern_table

pattern_table
        !word pat_bass                  ; 0
        !word pat_bass_arp              ; 1
        !word pat_lead_a                ; 2
        !word pat_lead_b                ; 3
        !word pat_drums                 ; 4
        !word pat_drums_fill            ; 5

; ---- order lists. Entry: pattern number, transpose. The bass pattern is written on C-2 and moved to
; the root of each chord: A-1 is 3 semitones lower, F-1 is 7 lower, G-1 is 5 lower.
order_v1
        !byte 0, -3                     ; bar 1  Am
        !byte 0, -7                     ; bar 2  F
        !byte 0, 0                      ; bar 3  C
        !byte 0, -5                     ; bar 4  G
        !byte 0, -3                     ; bar 5  Am
        !byte 0, -7                     ; bar 6  F
        !byte 1, 0                      ; bar 7  C, arpeggio
        !byte 1, -5                     ; bar 8  G, arpeggio
        !byte ORDER_LOOP, 0             ; start again at entry 0

order_v2
        !byte 2, 0                      ; bars 1-4
        !byte 3, 0                      ; bars 5-8
        !byte ORDER_LOOP, 0

order_v3
        !byte 4, 0, 4, 0, 4, 0, 4, 0    ; bars 1-4
        !byte 4, 0, 4, 0, 4, 0          ; bars 5-7
        !byte 5, 0                      ; bar 8: fill
        !byte ORDER_LOOP, 0

; ---- patterns
; One bar of bass: root, octave, root, root, octave, root, fifth, root. 16 ticks.
pat_bass
        !byte EV_INSTRUMENT, iBass
        !byte o2 + nC, 3
        !byte o3 + nC, 1
        !byte o2 + nC, 2
        !byte o2 + nC, 2
        !byte o3 + nC, 1
        !byte o2 + nC, 3
        !byte o2 + nG, 2
        !byte o2 + nC, 2
        !byte EV_END

; One bar of a held, arpeggiated note (the instrument jumps up a fifth on every second frame).
pat_bass_arp
        !byte EV_INSTRUMENT, iArp5
        !byte o3 + nC, 16
        !byte EV_END

; Lead, phrase A: four bars (Am, F, C, G), 16 ticks each.
pat_lead_a
        !byte EV_INSTRUMENT, iLead
        !byte o4 + nA, 3                ; bar 1
        !byte o5 + nC, 1
        !byte o5 + nE, 4
        !byte o5 + nD, 3
        !byte o5 + nC, 1
        !byte o4 + nB, 4
        !byte o4 + nA, 3                ; bar 2
        !byte o5 + nC, 1
        !byte o5 + nF, 4
        !byte o5 + nE, 3
        !byte o5 + nC, 1
        !byte o4 + nA, 4
        !byte o4 + nG, 3                ; bar 3
        !byte o5 + nC, 1
        !byte o5 + nE, 4
        !byte o5 + nG, 3
        !byte o5 + nE, 1
        !byte o5 + nC, 4
        !byte o4 + nB, 3                ; bar 4
        !byte o5 + nD, 1
        !byte o5 + nG, 4
        !byte o5 + nD, 3
        !byte o4 + nB, 1
        !byte o4 + nG, 4
        !byte EV_END

; Lead, phrase B: saw lead, shorter notes, and one glide (bar 3).
pat_lead_b
        !byte EV_INSTRUMENT, iSawLead
        !byte o5 + nE, 2                ; bar 5
        !byte EV_REST, 2
        !byte o5 + nE, 2
        !byte o5 + nD, 2
        !byte o5 + nC, 4
        !byte o4 + nB, 2
        !byte o4 + nA, 2
        !byte o5 + nC, 2                ; bar 6
        !byte EV_REST, 2
        !byte o5 + nC, 2
        !byte o4 + nA, 2
        !byte o4 + nF, 4
        !byte o4 + nA, 4
        !byte o5 + nE, 4                ; bar 7: the second note glides on from the first
        !byte EV_LEGATO
        !byte o5 + nG, 4
        !byte o5 + nE, 4
        !byte o5 + nC, 4
        !byte o5 + nD, 4                ; bar 8
        !byte o4 + nB, 4
        !byte o4 + nG, 4
        !byte EV_REST, 4
        !byte EV_END

; Drums, one bar: kick, hat, snare, hat, kick, kick, snare, hat (each 2 ticks).
; For a drum the pitch decides how it sounds: the kick starts low, the hat very high.
pat_drums
        !byte EV_INSTRUMENT, iKick
        !byte o3 + nE, 2
        !byte EV_INSTRUMENT, iHat
        !byte o7 + nFs, 2
        !byte EV_INSTRUMENT, iSnare
        !byte o6 + nFs, 2
        !byte EV_INSTRUMENT, iHat
        !byte o7 + nFs, 2
        !byte EV_INSTRUMENT, iKick
        !byte o3 + nE, 2
        !byte o3 + nE, 2
        !byte EV_INSTRUMENT, iSnare
        !byte o6 + nFs, 2
        !byte EV_INSTRUMENT, iHat
        !byte o7 + nFs, 2
        !byte EV_END

; Drums, the last bar: kick, snare, then a fall of toms.
pat_drums_fill
        !byte EV_INSTRUMENT, iKick
        !byte o3 + nE, 2
        !byte o3 + nE, 2
        !byte EV_INSTRUMENT, iSnare
        !byte o6 + nFs, 4
        !byte EV_INSTRUMENT, iTom
        !byte o4 + nG, 2
        !byte o4 + nE, 2
        !byte o4 + nC, 2
        !byte o3 + nA, 2
        !byte EV_INSTRUMENT, iSnare
        !byte o6 + nFs, 1
        !byte o6 + nFs, 1
        !byte o6 + nFs, 1
        !byte o6 + nFs, 1
        !byte EV_END
