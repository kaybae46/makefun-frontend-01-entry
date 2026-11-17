// Take the entry's screenshots with the headless Chromium on this machine:
// serves app/ (already running on localhost:8080), opens each route from
// shots.json, waits for window.__shotReady, and saves a JPEG.
// Node 22+ standard library only (global WebSocket + fetch).
//   node tools/shots.mjs [port]
// The screenshots are real renders of the app on live make.fun data.

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const shots = (await import(join(repo, 'shots.json'), { with: { type: 'json' } })).default;
const port = Number(process.argv[2] || 8080);
const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell`;
const DEBUG_PORT = 9223;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDebugger() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('chrome did not open its debugger port');
}

// This machine reaches the internet through an egress proxy, but the
// headless shell's own network stack only reaches loopback, so it cannot use
// the proxy directly. tools/relay.mjs (a CONNECT relay on 127.0.0.1:8888)
// bridges it: Chrome talks to the relay, the relay talks to the egress proxy.
import { spawn as spawnRelay } from 'node:child_process';
const relay = spawnRelay(process.execPath, [join(here, 'relay.mjs'), '8888'], { stdio: 'ignore' });
await new Promise((resolve) => setTimeout(resolve, 1000));
const chrome = spawn(CHROME, [
  '--remote-debugging-port=' + DEBUG_PORT,
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--proxy-server=http://127.0.0.1:8888',
  '--ignore-certificate-errors',
  '--proxy-bypass-list=localhost;127.0.0.1',
  'about:blank',
], { stdio: 'ignore' });

let code = 0;
try {
  await waitForDebugger();
  for (const shot of shots) {
    const url = `http://localhost:${port}/index.html${shot.path}`;
    const target = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    let nextId = 1;
    const pending = new Map();
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: shot.viewport.width, height: shot.viewport.height, deviceScaleFactor: 1, mobile: false });
    // The target already navigated to the URL; wait for the app to render.
    let ready = false;
    for (let i = 0; i < 60; i++) {
      const r = await send('Runtime.evaluate', { expression: 'window.__shotReady === true', returnByValue: true });
      if (r.result?.value) { ready = true; break; }
      await sleep(500);
    }
    if (!ready) throw new Error(`__shotReady never became true for ${shot.path}`);
    await sleep(1500); // let avatar images settle before the capture
    const shotResult = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
    const out = join(repo, 'screenshots', shot.file);
    writeFileSync(out, Buffer.from(shotResult.data, 'base64'));
    console.log(`saved ${shot.file} (${shot.path})`);
    ws.close();
    await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/close/${target.id}`);
  }
} catch (err) {
  console.error('FAILED:', err.message);
  code = 1;
} finally {
  chrome.kill('SIGKILL');
  relay.kill('SIGKILL');
}
process.exit(code);
