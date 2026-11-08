; hardware.asm - names for the C64 chips, fixed memory areas and colours
; Only names live here, no code or data, so nothing in this file takes up any memory.
;
; WHERE IS WHAT? Search for the number in front of the heading (for example "[3]").
;
;   [1] Memory areas        screen, colour RAM, processor port
;   [2] Sprites (VIC-II)    sprite pointers, positions, enable, collision, colours
;   [3] Screen (VIC-II)     raster line, scroll registers, background and border, memory control
;   [4] Colours             the 16 colour numbers we use
;   [5] Sound (SID)         voice 1, 2 and 3, filter and volume
;   [6] Keyboard and joystick (CIA 1)
;   [7] Timers (CIA 2)

; ============================================================================================================
; [1] MEMORY AREAS
; ============================================================================================================
SCREEN     = $0400                  ; screen memory, 40x25 characters, one byte per character
COLOR_RAM  = $d800                  ; colour memory, one byte per character, same layout as the screen
CPU_PORT   = $01                    ; processor port: bit 2 = 0 shows the character ROM at $d000 instead of I/O

; ============================================================================================================
; [2] SPRITES (VIC-II video chip)
; ============================================================================================================
; Sprite n has its X at $d000 + 2 * n and its Y in the next register. Sprites 0, 1 and 2 are named, 3 to 7 follow.
; Shape pointers (at the end of screen memory): the value * 64 = the address of the shape
SPRITE_PTR = $07f8                  ; sprite 0 data pointer, value * 64 = address of its shape
SPRITE1_PTR = $07f9                 ; sprite 1 data pointer
SPRITE2_PTR = $07fa                 ; sprite 2 data pointer, sprites 3 to 6 follow
SPRITE7_PTR = $07ff                 ; sprite 7 data pointer
; Positions
SPR0_X     = $d000                  ; sprite 0 X position (low 8 bits)
SPR0_Y     = $d001                  ; sprite 0 Y position
SPR1_X     = $d002                  ; sprite 1 (the enemy) X position
SPR1_Y     = $d003                  ; sprite 1 Y position
SPR2_X     = $d004                  ; sprite 2 X (low 8 bits); sprite n is at $d000 + 2 * n, its Y is the next register
SPR2_Y     = $d005                  ; sprite 2 Y
SPR7_X     = $d00e                  ; sprite 7 X position
SPR7_Y     = $d00f                  ; sprite 7 Y position
SPR_XHI    = $d010                  ; bit 8 of every sprite's X: bit 0 = ship, bit 1 = enemy, bit 7 = the Glitch (X can reach 343, one byte only 255)
; Switches and status
SPR_ENABLE = $d015                  ; one bit per sprite: 1 = visible
SPR_MULTI  = $d01c                  ; one bit per sprite: 1 = multicolor sprite
SPR_COLL   = $d01e                  ; sprite-sprite collision, one bit per sprite, cleared when read
; Colours
SPR_MC0    = $d025                  ; multicolor 0, shared by all sprites (bit pair 01)
SPR_MC1    = $d026                  ; multicolor 1, shared by all sprites (bit pair 11)
SPR0_COLOR = $d027                  ; sprite 0 colour (0-15)
SPR1_COLOR = $d028                  ; sprite 1 colour (0-15)
SPR2_COLOR = $d029                  ; sprite 2 colour, sprites 3 to 6 follow
SPR7_COLOR = $d02e                  ; sprite 7 colour (0-15)

; ============================================================================================================
; [3] SCREEN (VIC-II video chip)
; ============================================================================================================
VIC_CTRL1  = $d011                  ; bits 0-2: vertical fine scroll (0-7 lines, 3 = normal), bit 3: 1 = 25 rows, bit 4: screen on
VIC_RASTER = $d012                  ; the raster line the beam is currently drawing
VIC_CTRL2  = $d016                  ; bits 0-2: horizontal fine scroll (0-7 pixels), bit 3: 1 = 40 columns
VIC_MEMCTL = $d018                  ; bits 4-7: screen address / $400, bits 1-3: character set address / $800
VIC_BORDER = $d020                  ; border colour
VIC_BG     = $d021                  ; background colour
VIC_BG1    = $d022                  ; extended colour mode: background colour 1 (the plasma's main colour). Background colour 0 is $d021, always black

; ============================================================================================================
; [4] COLOURS: the C64 colour numbers we use
; ============================================================================================================
COLOR_BLACK = 0                     ; C64 colour number for black
COLOR_WHITE = 1                     ; C64 colour number for white
COLOR_RED   = 2                     ; C64 colour number for red
COLOR_GREEN = 5                     ; C64 colour number for green
COLOR_YELLOW = 7                    ; C64 colour number for yellow
COLOR_ORANGE = 8                    ; C64 colour number for orange
COLOR_DGREY = 11                    ; C64 colour number for dark grey
COLOR_LGREY = 15                    ; C64 colour number for light grey

; ============================================================================================================
; [5] SOUND (SID sound chip)
; ============================================================================================================
; Voice 1
SID_FREQ1L = $d400                  ; SID voice 1 frequency, low byte
SID_FREQ1H = $d401                  ; SID voice 1 frequency, high byte
SID_PW1L   = $d402                  ; SID voice 1 pulse width, low byte
SID_PW1H   = $d403                  ; SID voice 1 pulse width, high nibble ($08 = square wave)
SID_CTRL1  = $d404                  ; SID voice 1 control (bit 7 = noise, bit 0 = gate: 0 to 1 starts the sound)
SID_AD1    = $d405                  ; SID voice 1 attack (high nibble) and decay (low nibble)
SID_SR1    = $d406                  ; SID voice 1 sustain (high nibble) and release (low nibble)
; Voice 2 (the music)
SID_FREQ2L = $d407                  ; SID voice 2 frequency, low byte
SID_FREQ2H = $d408                  ; SID voice 2 frequency, high byte
SID_PW2L   = $d409                  ; SID voice 2 pulse width, low byte
SID_PW2H   = $d40a                  ; SID voice 2 pulse width, high nibble ($08 = square wave)
SID_CTRL2  = $d40b                  ; SID voice 2 control (bit 6 = pulse wave, bit 0 = gate)
SID_AD2    = $d40c                  ; SID voice 2 attack and decay
SID_SR2    = $d40d                  ; SID voice 2 sustain and release
; Voice 3 (drums and sound effects)
SID_FREQ3L = $d40e                  ; SID voice 3 frequency, low byte
SID_FREQ3H = $d40f                  ; SID voice 3 frequency, high byte
SID_CTRL3  = $d412                  ; SID voice 3 control (bit 7 = noise, bit 4 = triangle, bit 0 = gate)
SID_AD3    = $d413                  ; SID voice 3 attack and decay
SID_SR3    = $d414                  ; SID voice 3 sustain and release
; Filter and volume
SID_FC_HI   = $d416                 ; SID filter cutoff, high byte (the filter opens as this goes up)
SID_RES     = $d417                 ; SID filter resonance (high nibble) and which voices go through the filter (bits 0-2)
SID_VOLUME = $d418                  ; SID master volume (low nibble), bit 7 = mute voice 3
SID_OSC3   = $d41b                  ; READ: the current output of voice 3's oscillator (0-255)
SID_ENV3   = $d41c                  ; READ: the current output of voice 3's envelope (0-255), a free LFO in hardware

; ============================================================================================================
; [6] KEYBOARD AND JOYSTICK (CIA 1)
; ============================================================================================================
CIA1_PORTA = $dc00                  ; joystick port 2, bits are 0 when pressed: up, down, left, right, fire
CIA1_PORTB = $dc01                  ; keyboard rows / joystick port 1
CIA1_DDRA  = $dc02                  ; data direction of port A: 1 = output, 0 = input (per pin)
CIA1_DDRB  = $dc03                  ; data direction of port B
CIA1_TA_LO = $dc04                  ; CIA 1 timer A, low byte (the KERNAL keeps it running: it times the interrupt)
CIA1_TA_HI = $dc05                  ; CIA 1 timer A, high byte (write: the start value for the next round)
CIA1_CRA   = $dc0e                  ; CIA 1 timer A control (bit 1 = show the timer on port B pin 6)
CIA1_CRB   = $dc0f                  ; CIA 1 timer B control (bit 1 = show the timer on port B pin 7)

; ============================================================================================================
; [7] TIMERS (CIA 2)
; ============================================================================================================
; Timer A counts down by one every CPU cycle while it runs, so it can measure how long a piece of code takes.
CIA2_TA_LO = $dd04                  ; CIA 2 timer A, low byte (read: the counter, write: the start value)
CIA2_TA_HI = $dd05                  ; CIA 2 timer A, high byte
CIA2_CRA   = $dd0e                  ; CIA 2 timer A control (bit 0 = run, bit 4 = load the start value now)
