; websidtracker - the C64 side: our own music player and test programs
; Assembler: ACME   (build: make, run in the browser emulator: make test, in VICE: make vice)

        * = $0801                   ; BASIC programs always start loading here

; BASIC stub: "10 SYS 2064", so typing RUN jumps into our machine code
        !word basic_end, 10
        !byte $9e                   ; BASIC token for SYS
        !text "2064"                ; the address of 'start' as decimal text
        !byte 0
basic_end
        !word 0

        * = 2064

start
        rts                         ; nothing yet: back to BASIC
