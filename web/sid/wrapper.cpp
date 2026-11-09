// wrapper.cpp - a small C interface around reSIDfp, for use from JavaScript.
//
// JavaScript cannot call C++ classes directly. It can call plain C functions that
// WebAssembly exports. So this file creates one SID chip and exposes a handful of
// functions that work on it. Sound comes out as 16-bit mono samples in a buffer
// that lives in the WebAssembly memory; JavaScript reads it through sid_buffer().
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

#include <cstdint>
#include <exception>
#include <new>
#include <cstring>
#include <typeinfo>
#include <emscripten.h>

#include "residfp/residfp.h"

using namespace reSIDfp;

namespace
{
    // Room for one block of output. The AudioWorklet asks for 128 samples at a time,
    // a whole PAL frame at 48 kHz is about 960; 4096 leaves plenty of headroom.
    const int BUFFER_SAMPLES = 4096;

    residfp* chip = nullptr;
    char     lastError[128] = "";
    int16_t  buffer[BUFFER_SAMPLES];
}

extern "C"
{

// Create (or re-create) the chip.
//   model:      0 = MOS 6581 (the old chip), 1 = CSG 8580 (the new chip)
//   clockHz:    the C64's clock, 985248 for PAL
//   sampleRate: the sound card's rate, for example 44100 or 48000
// Returns 1 when all went well, 0 when reSIDfp refused a setting. A C++ exception
// must never cross into JavaScript, so anything unexpected is caught here and
// reported as a negative number: -1 = out of memory, -2 = another std exception,
// -3 = something else.
EMSCRIPTEN_KEEPALIVE
int sid_init(int model, double clockHz, double sampleRate)
{
    try
    {
        delete chip;
        chip = new residfp();
        if (!chip->setChipModel(model == 0 ? MOS6581 : CSG8580)) return 0;
        if (!chip->setSamplingParameters(clockHz, RESAMPLE, sampleRate)) return 0;
        // The C64's audio output goes through a 10 uF capacitor that blocks DC. How fast it lets a
        // DC step die away depends on the load: reSIDfp assumes 10 kOhm (1.6 Hz, 0.1 s) by default,
        // VICE and most players use 1 kOhm (16 Hz, 10 ms). The 6581 voices have a DC level that
        // depends on the envelope, so every note start and end is a DC step; with 1.6 Hz the steps
        // linger as a slow, bass-heavy wobble (3 to 8 % of the energy under 40 Hz instead of 1 %).
        // 1.0 selects 1 kOhm.
        chip->setDCBRes(1.0);
        chip->reset();
        return 1;
    }
    catch (std::bad_alloc&)  { return -1; }
    catch (std::exception& e)
    {
        std::strncpy(lastError, typeid(e).name(), sizeof(lastError) - 1);
        std::strncat(lastError, ": ", sizeof(lastError) - std::strlen(lastError) - 1);
        std::strncat(lastError, e.what(), sizeof(lastError) - std::strlen(lastError) - 1);
        return -2;
    }
    catch (...)              { return -3; }
}

// Text of the last error that sid_init caught, as a C string in the WebAssembly memory.
EMSCRIPTEN_KEEPALIVE
const char* sid_last_error()
{
    return lastError;
}

// Change the chip model while running. Registers keep their values.
EMSCRIPTEN_KEEPALIVE
int sid_set_model(int model)
{
    return chip->setChipModel(model == 0 ? MOS6581 : CSG8580) ? 1 : 0;
}

// Reset the chip: all registers to zero, as after power on.
EMSCRIPTEN_KEEPALIVE
void sid_reset()
{
    chip->reset();
}

// Write a SID register. reg is 0 to 31 (so $D400 + reg on a C64), like STA $D400,x.
EMSCRIPTEN_KEEPALIVE
void sid_write(int reg, int value)
{
    chip->write(reg, (unsigned char)value);
}

// Run the chip for a number of C64 clock cycles. Returns how many samples that
// produced; they are in sid_buffer(). The tracker will use this one: the 6502
// emulator knows exactly how many cycles passed between two SID writes.
EMSCRIPTEN_KEEPALIVE
int sid_clock(unsigned int cycles)
{
    return chip->clock(cycles, buffer);
}

// Run the chip until `samples` samples have been produced. Returns how many cycles
// that took. This is the shape an audio callback wants: "give me 128 samples".
EMSCRIPTEN_KEEPALIVE
int sid_render(int samples)
{
    if (samples > BUFFER_SAMPLES) samples = BUFFER_SAMPLES;
    return chip->clock(buffer, samples);
}

// Address of the sample buffer inside the WebAssembly memory.
EMSCRIPTEN_KEEPALIVE
int16_t* sid_buffer()
{
    return buffer;
}

// Size of the sample buffer, in samples.
EMSCRIPTEN_KEEPALIVE
int sid_buffer_size()
{
    return BUFFER_SAMPLES;
}

}
