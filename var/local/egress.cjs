'use strict';
const http = require('node:http');
const net = require('node:net');
const dns = require('node:dns').promises;
const ipaddr = require('ipaddr.js');

// Exact names only. No wildcard domains, general HTTP forwarding or URL logging.
const allowed = new Set(['www.googleapis.com', 'oauth2.googleapis.com', 'youtube.googleapis.com']);
function allowedTarget(authority) {
  return typeof authority === 'string' && /^[a-z0-9.-]+:443$/.test(authority) && allowed.has(authority.slice(0, -4));
}
function publicAddress(address) {
  try { return net.isIP(address) !== 0 && ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}
function createProxy(lookup = dns.lookup) {
  const server = http.createServer((_req, res) => { res.writeHead(403); res.end(); });
  server.maxConnections = 32;
  server.headersTimeout = 10000;
  server.requestTimeout = 10000;
  server.on('connect', async (req, socket, head) => {
    socket.on('error', () => {});
    if (!allowedTarget(req.url)) return socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    const host = req.url.slice(0, -4);
    try {
      const records = await lookup(host, { all: true });
      if (!records.length || records.some(record => !publicAddress(record.address))) throw new Error('Blocked destination');
      // Connect to the validated IP, never resolve the name a second time.
      const upstream = net.connect({ host: records[0].address, family: records[0].family, port: 443 });
      const close = () => { upstream.destroy(); socket.destroy(); };
      upstream.setTimeout(120000, close); socket.setTimeout(120000, close);
      upstream.on('error', close); socket.on('error', close); socket.on('close', () => upstream.destroy());
      upstream.on('connect', () => {
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        socket.pipe(upstream); upstream.pipe(socket);
      });
    } catch { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); }
  });
  return server;
}
if (require.main === module) createProxy().listen(3128, process.platform === 'win32' ? '127.0.0.1' : '0.0.0.0');
module.exports = { allowedTarget, publicAddress, createProxy };
