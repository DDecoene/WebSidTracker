NAME   = websidtracker
SRC    = src/main.asm
OUT    = build/$(NAME).prg

.PHONY: all clean emu player serve test stop vice

all: $(OUT)

$(OUT): $(wildcard src/*.asm)
	@mkdir -p build
	acme -f cbm --cpu 6510 -I src -l build/$(NAME).lbl -r build/$(NAME).rpt -o $@ $(SRC)

# the player image for the browser tracker: web/player/player.prg and symbols.json (both are committed)
player:
	tools/build-player.sh

# the vc64web browser emulator, fetched once into tools/vc64web (about 26 MB, not part of the repo)
tools/vc64web:
	git clone --depth 1 https://github.com/vc64web/vc64web.github.io $@

emu: tools/vc64web

# serve the emulator and the build on http://127.0.0.1:8000 (stop with Ctrl-C)
serve: $(OUT) tools/vc64web
	python3 tools/serve.py 8000

# build, (re)start the server, open the program in the browser emulator
test: $(OUT) tools/vc64web
	@pkill -f tools/serve.py || true
	@(nohup python3 tools/serve.py 8000 > /dev/null 2>&1 &)
	@for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do curl -s -o /dev/null http://127.0.0.1:8000/ && break; sleep 0.5; done; curl -s -o /dev/null http://127.0.0.1:8000/ || (echo "the server did not start"; exit 1)
	open "http://127.0.0.1:8000/#openROMS=true"

# build and run in VICE (x64sc, the accurate one: use this to judge the sound; vc64web is better for game input)
vice: $(OUT)
	x64sc -autostart $(OUT)

# stop the server that make test left running in the background
stop:
	@pkill -f tools/serve.py && echo "server stopped" || echo "no server running"

clean:
	rm -rf build
