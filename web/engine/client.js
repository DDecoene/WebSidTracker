// client.js - the page's side of the audio engine.
//
//   const engine = await createEngineClient({ model: 0 });   // after a click or key press
//   engine.load([{ address: 0x2000, bytes }]);
//   engine.start(0x3000);
//   engine.resume();            // at every play: the browser may have suspended the audio
//
// It creates the AudioContext, fetches and compiles the SID, loads the worklet and
// waits until the worklet says it is ready. After that everything is a message that
// does not wait for an answer. Answers come through the onState, onEnded and onError
// callbacks.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ../LICENSE).

export async function createEngineClient({ model = 0 } = {}) {
  const context = new AudioContext();
  try {
    // An AudioWorklet has no fetch(): the page loads the files and sends them over.
    const url = (path) => new URL(path, import.meta.url);
    const [wasmBytes, playerPrg, symbols] = await Promise.all([
      fetchOk(url('../sid/sid.wasm')).then((r) => r.arrayBuffer()),
      fetchOk(url('../player/player.prg')).then((r) => r.arrayBuffer()),
      fetchOk(url('../player/symbols.json')).then((r) => r.json()),
      context.audioWorklet.addModule(url('./worklet.js')),
    ]);

    const node = new AudioWorkletNode(context, 'sid-tracker', {
      numberOfInputs: 0,
      outputChannelCount: [1],
    });
    node.connect(context.destination);

    const client = {
      context,
      sampleRate: context.sampleRate,
      onState: null,
      onEnded: null,
      onError: null,
      load(writes) {
        for (const w of writes) node.port.postMessage({ type: 'write', address: w.address, bytes: w.bytes });
      },
      start(address) { node.port.postMessage({ type: 'start', address }); },
      stop() { node.port.postMessage({ type: 'stop' }); },
      edit(edit) { node.port.postMessage({ type: 'edit', writes: edit.writes, playhead: edit.playhead, remap: edit.remap }); },
      setModel(m) { node.port.postMessage({ type: 'model', model: m }); },
      setMuted(voice, muted) { node.port.postMessage({ type: 'mute', voice, muted }); },
      setVolume(value) { node.port.postMessage({ type: 'volume', value }); },
      resume() { return context.state === 'running' ? Promise.resolve() : context.resume(); },
      close() {
        node.port.onmessage = null;
        node.disconnect();
        return context.close();
      },
    };

    // Wait for 'ready' (the worklet builds both chip models first, about a second).
    await new Promise((resolve, reject) => {
      node.port.onmessage = (event) => {
        const msg = event.data;
        if (msg.type === 'ready') {
          client.initMs = msg.initMs;
          node.port.onmessage = (e) => dispatch(client, e.data);
          resolve();
        } else if (msg.type === 'error') {
          reject(new Error(msg.message));
        }
      };
      node.port.postMessage({ type: 'init', wasmBytes, playerPrg: new Uint8Array(playerPrg), symbols, model });
      setTimeout(() => reject(new Error('the audio engine did not answer within 10 seconds')), 10000);
    });

    // Normally running already: the client is made inside a click or key press. If the browser
    // still holds the context back, do not wait for it here: play() asks again at every press.
    if (context.state === 'suspended') await Promise.race([context.resume(), new Promise((r) => setTimeout(r, 1500))]);
    return client;
  } catch (error) {
    context.close().catch(() => {});
    throw error;
  }
}

async function fetchOk(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`could not load ${url} (${response.status})`);
  return response;
}

function dispatch(client, msg) {
  if (msg.type === 'state') client.onState?.(msg);
  else if (msg.type === 'ended') client.onEnded?.();
  else if (msg.type === 'error') client.onError?.(msg.message);
}
