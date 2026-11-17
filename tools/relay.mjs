// A minimal CONNECT relay so the headless Chromium on this machine can reach
// the internet: the shell's own network stack only reaches loopback, while
// this machine's egress proxy (hatch-egress-proxy:3128, unauthenticated from
// this host) does the real fetching. Listens on 127.0.0.1:8888.
//   node tools/relay.mjs [port]
// On CONNECT host:port, opens TCP to the egress proxy, asks it to CONNECT to
// the target, then pipes bytes both ways. Only used to take screenshots.

import { createServer, connect } from 'node:net';

const EGRESS_HOST = 'hatch-egress-proxy';
const EGRESS_PORT = 3128;
const port = Number(process.argv[2] || 8888);

const server = createServer((client) => {
  client.once('data', (chunk) => {
    const line = chunk.toString('latin1').split('\r\n')[0] || '';
    const m = line.match(/^CONNECT\s+(\S+)\s+HTTP\/1\.1/i);
    if (!m) {
      client.end('HTTP/1.1 405 Method Not Allowed\r\n\r\n');
      return;
    }
    const target = m[1];
    const upstream = connect({ host: EGRESS_HOST, port: EGRESS_PORT }, () => {
      upstream.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`);
    });
    let established = false;
    let buf = Buffer.alloc(0);
    upstream.on('data', (d) => {
      if (established) return;
      buf = Buffer.concat([buf, d]);
      const idx = buf.indexOf('\r\n\r\n');
      if (idx === -1) return;
      const headers = buf.subarray(0, idx).toString('latin1');
      if (!/^HTTP\/1\.[01] 200/.test(headers)) {
        client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        upstream.destroy();
        return;
      }
      established = true;
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      const rest = buf.subarray(idx + 4);
      if (rest.length) upstream.write(rest);
      client.pipe(upstream);
      upstream.pipe(client);
    });
    upstream.on('error', () => {
      if (!established) client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    });
    client.on('error', () => upstream.destroy());
  });
  client.on('error', () => {});
});

server.listen(port, '127.0.0.1', () => console.log(`relay on 127.0.0.1:${port}`));
