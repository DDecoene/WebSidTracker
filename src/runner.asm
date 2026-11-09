; runner.asm - a complete C64 program that plays the demo song (MIT licence, see ../LICENSE)
;
; This is the image the tracker exports: a BASIC line that starts the program, the player, the
; instrument tables and the song, all at fixed addresses (see docs/player.md). The tracker overwrites
; the instrument tables and the song in this image with the data you made; the program stays the same.
;
; Memory map:   $0801  BASIC line and this program (up to $0FFF)
;               $1000  music.asm: player code, frequency table, state (up to $1FFF)
;               $2000  instrument tables, 15 x 256 bytes (up to $2EFF)
;               $3000  the song
SONG_ADDRESS    = $3000

; Registers of the KERNAL and the chips that we use here
VIC_RASTER_LINE = $D012                 ; the raster line that triggers the interrupt (bits 0-7)
VIC_CONTROL     = $D011                 ; bit 7 is bit 8 of the raster line
VIC_IRQ_FLAGS   = $D019                 ; which VIC interrupts fired (write 1 to clear)
VIC_IRQ_ENABLE  = $D01A                 ; which VIC interrupts are switched on
CIA1_IRQ        = $DC0D                 ; CIA 1 interrupt control (the timer that the KERNAL uses)
CIA2_IRQ        = $DD0D
IRQ_VECTOR      = $0314                 ; the KERNAL calls the routine whose address is stored here
KERNAL_IRQ_EXIT = $EA81                 ; puts the registers back and returns from the interrupt
CHROUT          = $FFD2                 ; KERNAL: print the character in A

        * = $0801
; The BASIC line  10 SYS 2064  starts the program when you type RUN
        !word basic_end, 10
        !byte $9E                       ; the BASIC token SYS
        !text "2064"
        !byte 0
basic_end
        !word 0

        * = 2064
start
        ; Print a short message
        ldx #0
@print  lda message,x
        beq @printed
        jsr CHROUT
        inx
        bne @print
@printed
        sei                             ; no interrupts while we change the set-up
        lda #<SONG_ADDRESS
        ldx #>SONG_ADDRESS
        jsr music_init
        ; Switch off the timer interrupts of the KERNAL (CIA 1 and 2); we want one interrupt per frame only
        lda #$7F
        sta CIA1_IRQ
        sta CIA2_IRQ
        lda CIA1_IRQ                    ; reading clears an interrupt that may be waiting
        lda CIA2_IRQ
        ; Raster interrupt: the VIC-II calls us once per frame, when it draws the line we choose
        lda VIC_CONTROL
        and #$7F                        ; bit 8 of the line number = 0
        sta VIC_CONTROL
        lda #250                        ; line 250: below the picture
        sta VIC_RASTER_LINE
        lda #<irq
        sta IRQ_VECTOR
        lda #>irq
        sta IRQ_VECTOR + 1
        lda #$01
        sta VIC_IRQ_ENABLE              ; switch on the raster interrupt
        sta VIC_IRQ_FLAGS               ; clear a flag that may be set
        cli
@wait   jmp @wait                       ; the music is played by the interrupt, nothing else to do

; The interrupt: once per frame
irq
        lda #$01
        sta VIC_IRQ_FLAGS               ; tell the VIC-II we have seen it
        jsr music_play
        jmp KERNAL_IRQ_EXIT

message
        !pet "websidtracker player", 13, 0

        * = $1000
        !source "music.asm"

        * = $2000
        !source "instruments.asm"

        * = SONG_ADDRESS
        !source "song_demo.asm"
