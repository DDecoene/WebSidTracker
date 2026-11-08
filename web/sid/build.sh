#!/bin/sh
# build.sh - builds sid.wasm: reSIDfp (libresidfp) plus our wrapper, compiled to WebAssembly.
#
# You only need to run this when the SID side changes. The resulting sid.wasm is
# committed, so working on the editor or the player needs no Emscripten.
#
# Needs Emscripten (em++), for example: brew install emscripten
# Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

set -e

VERSION=1.2.3
SHA256=66badd21cd8ba28d9bc7bd77e38343de90fa48fff4510fae2a3b49375f068c28
URL=https://github.com/libsidplayfp/libresidfp/archive/refs/tags/v$VERSION.tar.gz

HERE=$(cd "$(dirname "$0")" && pwd)
CACHE=$HERE/.cache                  # downloaded source and generated headers, not committed
SRC=$CACHE/libresidfp-$VERSION/src
GEN=$CACHE/gen                      # headers that the original build system generates

command -v em++ >/dev/null || { echo "em++ not found. Install Emscripten (brew install emscripten)." >&2; exit 1; }

# 1. Fetch the exact source and check it is the one we expect.
if [ ! -d "$SRC" ]; then
    mkdir -p "$CACHE"
    curl -sL -o "$CACHE/source.tar.gz" "$URL"
    echo "$SHA256  $CACHE/source.tar.gz" | shasum -a 256 -c - >/dev/null \
        || { echo "Checksum of the downloaded source does not match." >&2; rm -f "$CACHE/source.tar.gz"; exit 1; }
    tar xzf "$CACHE/source.tar.gz" -C "$CACHE"
    # reSIDfp starts threads to build its tables, which a browser page cannot do without
    # special HTTP headers. This small patch runs those jobs one after the other instead.
    patch -s -p1 -d "$CACHE/libresidfp-$VERSION" < "$HERE/no-threads.patch"
fi

# 2. Two headers are templates (.in) that autoconf normally fills in. We do the same
#    with sed: version numbers, and the choices made by the configure script.
mkdir -p "$GEN/residfp"
sed -e 's/@RESIDFP_BRANCH_HINTS@/1/' \
    -e 's/@HAVE_BUILTIN_EXPECT@/1/' \
    -e "s/@PACKAGE_VERSION@/$VERSION/" \
    -e 's/@RESIDFP_INLINING@/1/' \
    -e 's/@RESIDFP_INLINE@/inline/' \
    "$SRC/siddefs-fp.h.in" > "$GEN/siddefs-fp.h"
sed -e "s/@LIB_MAJOR@/${VERSION%%.*}/" \
    -e "s/@LIB_MINOR@/$(echo $VERSION | cut -d. -f2)/" \
    -e "s/@LIB_LEVEL@/${VERSION##*.}/" \
    "$SRC/residfp/sidversion.h.in" > "$GEN/residfp/sidversion.h"

# 3. Compile. The source list is the one from the library's own Makefile.am.
SOURCES="
    Dac EnvelopeGenerator ExternalFilter Filter Filter6581 Filter8580
    FilterModelConfig FilterModelConfig6581 FilterModelConfig8580
    Integrator6581 Integrator8580 OpAmp SID Spline State
    WaveformCalculator WaveformGenerator resample/SincResampler residfp/residfp
"
FILES=""
for f in $SOURCES; do FILES="$FILES $SRC/$f.cpp"; done

# -ffile-prefix-map       the compiler writes source file names into the result (for assert
#                         messages). Map them to short fixed names, so the build does not
#                         contain the paths of the machine it ran on, and gives the same
#                         bytes wherever you build it.
# -fwasm-exceptions       reSIDfp uses C++ exceptions for bad settings
# -sSTANDALONE_WASM       a plain .wasm without Emscripten's JavaScript glue, we load it ourselves
# --no-entry              it is a library, there is no main()
# -sINITIAL_MEMORY        fixed 32 MB, so the sample buffer address never moves
em++ -O2 -std=c++17 -fwasm-exceptions \
    -ffile-prefix-map="$CACHE/libresidfp-$VERSION=libresidfp" \
    -ffile-prefix-map="$GEN=generated" -ffile-prefix-map="$HERE=wrapper" \
    -I "$GEN" -I "$SRC" \
    $FILES "$HERE/wrapper.cpp" \
    -sSTANDALONE_WASM --no-entry \
    -sINITIAL_MEMORY=33554432 -sALLOW_MEMORY_GROWTH=0 \
    -o "$HERE/sid.wasm"

ls -l "$HERE/sid.wasm"
