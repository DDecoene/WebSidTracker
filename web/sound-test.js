// sound-test.js - the page: one button, a chip model choice and a status line.
//
// Part of the WebSidTracker web app, GPL version 3 or later (see ./LICENSE).

const button = document.getElementById('play');
const modelSelect = document.getElementById('model');
const status = document.getElementById('status');

let context = null;                   // the AudioContext, made on the first click
let node = null;                      // our AudioWorkletNode
let playing = false;
let info = { sampleRate: 0, initMs: 0 };

function show(peak, samples) {
  const db = peak > 0 ? (20 * Math.log10(peak)).toFixed(1) : '-inf';
  status.textContent =
    `sample rate ${info.sampleRate} Hz\n` +
    `SID ready in ${info.initMs} ms\n` +
    `samples made ${samples}\n` +
    `peak level ${db} dBFS`;
}

// A browser only lets a page make sound after the visitor clicked something, so all of
// this waits for the first click.
async function start() {
  context = new AudioContext();
  status.textContent = 'loading...';

  // An AudioWorklet cannot fetch files. The page fetches the .wasm, compiles it and
  // sends the compiled module to the worklet in a message.
  const [wasm] = await Promise.all([
    fetch('sid/sid.wasm').then((r) => WebAssembly.compileStreaming(r)),
    context.audioWorklet.addModule('sound-test-worklet.js'),
  ]);

  node = new AudioWorkletNode(context, 'sid-tone', {
    numberOfInputs: 0,
    outputChannelCount: [1],
  });
  node.port.onmessage = (event) => {
    const msg = event.data;
    if (msg.type === 'ready') info = msg;
    else if (msg.type === 'stats') show(msg.peak, msg.samples);
    else if (msg.type === 'error') status.textContent = 'error: ' + msg.message;
  };
  node.connect(context.destination);
  node.port.postMessage({ type: 'init', module: wasm, model: Number(modelSelect.value) });
}

button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    if (!context) {
      await start();                  // the tone starts right away: the worklet set the gate on
      playing = true;
    } else if (playing) {
      node.port.postMessage({ type: 'gate', on: false });
      playing = false;
    } else {
      node.port.postMessage({ type: 'gate', on: true });
      playing = true;
    }
    button.textContent = playing ? 'Stop' : 'Play';
  } catch (error) {
    status.textContent = 'error: ' + error;
  }
  button.disabled = false;
});

modelSelect.addEventListener('change', () => {
  if (node) node.port.postMessage({ type: 'model', model: Number(modelSelect.value) });
});
