// ─────────────────────────────────────────────────────────────────────────────
// MZAZI XMD — command pack, part 8 of 8: NETWORK, LINKS, DOCUMENTS
//
// Parts 1 to 7 leaned on pure computation. These do not: the network commands
// open sockets and the document commands read files the user sends. That makes
// them the most useful commands in the pack for troubleshooting and the most
// likely to fail for reasons that are nobody's fault — so every one of them
// carries a timeout, reports the failure in plain language, and never lets an
// exception reach the customer as a stack trace.
//
// ── Two deliberate limits ────────────────────────────────────────────────────
// 1. Timeouts are short (5-10s). A bot that hangs for two minutes on a dead
//    host stops answering everybody else in the queue.
// 2. The certificate command connects with verification OFF in order to read
//    the certificate. It says so in its own output, so nobody mistakes it for
//    a health check that proves a connection is trustworthy.
//
// Node built-ins only: dns, net, tls. No new dependency is required by any of
// this, which matters on a panel host where npm install is not routine.
//
// Backslashes are doubled throughout: see the note at the top of part 6.
// ─────────────────────────────────────────────────────────────────────────────

module.exports = [
  // ── Network diagnostics ──────────────────────────────────────────────────
  {
    name: 'dnslookup',
    aliases: ['dns', 'resolvehost'],
    description: 'Look up the DNS records for a domain',
    category: 'Network',
    usage: '.dnslookup <domain> [a|aaaa|mx|txt|ns|cname]',
    code: `const a = Array.isArray(args) ? args : [];
const host = String(a[0] || '').trim();
if (!host) return mzazireply('Usage: ' + prefix + 'dnslookup <domain> [a|aaaa|mx|txt|ns|cname]');
const wanted = (a[1] || 'a').toLowerCase();
const allowed = ['a', 'aaaa', 'mx', 'txt', 'ns', 'cname'];
if (allowed.indexOf(wanted) === -1) return mzazireply('❌ Choose one of: ' + allowed.join(', '));
const dns = require('dns').promises;
try {
  let records;
  if (wanted === 'a') records = await dns.resolve4(host);
  else if (wanted === 'aaaa') records = await dns.resolve6(host);
  else if (wanted === 'mx') {
    const mx = await dns.resolveMx(host);
    records = mx.map(function (r) { return r.priority + '  ' + r.exchange; });
  } else if (wanted === 'txt') {
    const txt = await dns.resolveTxt(host);
    records = txt.map(function (parts) { return parts.join(''); });
  } else if (wanted === 'ns') records = await dns.resolveNs(host);
  else records = await dns.resolveCname(host);
  if (!records.length) return mzazireply('🔎 No ' + wanted.toUpperCase() + ' records for ' + host + '.');
  return mzazireply('🔎 *' + host + '* — ' + wanted.toUpperCase() + '\\n\\n' + records.slice(0, 20).join('\\n'));
} catch (e) {
  return mzazireply('❌ Lookup failed for ' + host + ': ' + e.code + (e.code === 'ENOTFOUND' ? ' (no such domain, or no ' + wanted.toUpperCase() + ' records)' : ''));
}`,
  },
  {
    name: 'reverseip',
    aliases: ['ptrlookup', 'reversedns'],
    description: 'Find the hostname behind an IP address',
    category: 'Network',
    usage: '.reverseip <ip>',
    code: `const ip = (Array.isArray(args) ? args.join('') : '').trim();
if (!ip) return mzazireply('Usage: ' + prefix + 'reverseip <ip>');
if (!/^[0-9]{1,3}(\\.[0-9]{1,3}){3}$/.test(ip)) return mzazireply('❌ Give me an IPv4 address, like 8.8.8.8.');
const dns = require('dns').promises;
try {
  const names = await dns.reverse(ip);
  if (!names.length) return mzazireply('🔎 No reverse record for ' + ip + '.');
  return mzazireply('🔎 *' + ip + '* →\\n\\n' + names.join('\\n'));
} catch (e) {
  return mzazireply('❌ No reverse record for ' + ip + ' (' + e.code + '). Most addresses do not have one.');
}`,
  },
  {
    name: 'portcheck',
    aliases: ['checkport', 'tcpport'],
    description: 'Test whether a TCP port answers',
    category: 'Network',
    usage: '.portcheck <host> <port>',
    code: `const a = Array.isArray(args) ? args : [];
const host = String(a[0] || '').trim();
const port = parseInt(a[1], 10);
if (!host || !port) return mzazireply('Usage: ' + prefix + 'portcheck <host> <port>');
if (port < 1 || port > 65535) return mzazireply('❌ A port is between 1 and 65535.');
const net = require('net');
const started = Date.now();
const result = await new Promise(function (resolve) {
  const socket = new net.Socket();
  let done = false;
  const finish = function (text) {
    if (done) return;
    done = true;
    socket.destroy();
    resolve(text);
  };
  socket.setTimeout(6000);
  socket.once('connect', function () { finish('✅ open — connected in ' + (Date.now() - started) + ' ms'); });
  socket.once('timeout', function () { finish('⏱️ no answer within 6 seconds — usually a firewall dropping the packets'); });
  socket.once('error', function (err) {
    const hints = {
      ECONNREFUSED: 'the host answered but nothing is listening on that port',
      ENOTFOUND: 'that hostname does not resolve',
      EHOSTUNREACH: 'no route to that host',
      ECONNRESET: 'the connection was closed immediately'
    };
    finish('❌ ' + (hints[err.code] || err.message) + ' (' + err.code + ')');
  });
  socket.connect(port, host);
});
return mzazireply('🔌 *' + host + ':' + port + '*\\n\\n' + result);`,
  },
  {
    name: 'sslinfo',
    aliases: ['tlsinfo', 'certinfo'],
    description: 'Read a site certificate and show when it expires',
    category: 'Network',
    usage: '.sslinfo <domain>',
    code: `let host = (Array.isArray(args) ? args.join('') : '').trim();
if (!host) return mzazireply('Usage: ' + prefix + 'sslinfo <domain>');
host = host.replace(/^https?:\\/\\//i, '').replace(/\\/.*$/, '');
const tls = require('tls');
const info = await new Promise(function (resolve) {
  const socket = tls.connect({ host: host, port: 443, servername: host, rejectUnauthorized: false, timeout: 8000 }, function () {
    const cert = socket.getPeerCertificate();
    const authorized = socket.authorized;
    socket.end();
    resolve({ cert: cert, authorized: authorized });
  });
  socket.once('timeout', function () { socket.destroy(); resolve({ error: 'timed out after 8 seconds' }); });
  socket.once('error', function (err) { resolve({ error: err.message }); });
});
if (info.error) return mzazireply('❌ Could not read a certificate from ' + host + ': ' + info.error);
const cert = info.cert || {};
if (!cert.valid_to) return mzazireply('❌ ' + host + ' answered but sent no certificate — it may not be serving TLS on 443.');
const to = new Date(cert.valid_to);
const days = Math.round((to.getTime() - Date.now()) / 86400000);
const subject = (cert.subject && cert.subject.CN) || '(no common name)';
const issuer = (cert.issuer && (cert.issuer.O || cert.issuer.CN)) || '(unknown issuer)';
let verdict = '✅ valid for another ' + days + ' day(s)';
if (days < 0) verdict = '❌ EXPIRED ' + Math.abs(days) + ' day(s) ago';
else if (days < 14) verdict = '⚠️ expires in ' + days + ' day(s) — renew now';
return mzazireply('🔒 *Certificate for ' + host + '*\\n\\nSubject: ' + subject + '\\nIssued by: ' + issuer + '\\nValid from: ' + new Date(cert.valid_from).toISOString().slice(0, 10) + '\\nValid to: ' + to.toISOString().slice(0, 10) + '\\n\\n' + verdict + '\\n\\n⚠️ Read with verification switched off, so this reports what the server sent — it is not proof the chain is trusted.');`,
  },
  {
    name: 'pingurl',
    aliases: ['responsetime', 'urltime'],
    description: 'Time how long a URL takes to answer',
    category: 'Network',
    usage: '.pingurl <url>',
    code: `const url = (Array.isArray(args) ? args.join('') : '').trim();
if (!url) return mzazireply('Usage: ' + prefix + 'pingurl <url>');
if (!/^https?:\\/\\//i.test(url)) return mzazireply('❌ Include the scheme — http:// or https://');
const start = Date.now();
try {
  const res = await axios.get(url, { timeout: 10000, maxRedirects: 3, validateStatus: function () { return true; }, headers: { 'User-Agent': 'MZAZI-XMD/probe' } });
  const ms = Date.now() - start;
  let verdict = '⚡ fast';
  if (ms > 3000) verdict = '🐢 slow';
  else if (ms > 1200) verdict = '🙂 acceptable';
  return mzazireply('⏱️ *' + url + '*\\n\\nStatus: ' + res.status + '\\nAnswered in: ' + ms + ' ms — ' + verdict);
} catch (e) {
  return mzazireply('❌ No answer from ' + url + ' after ' + (Date.now() - start) + ' ms: ' + e.message);
}`,
  },
  {
    name: 'httpheaders',
    aliases: ['headurl', 'fetchheaders'],
    description: 'Show the response headers a URL sends back',
    category: 'Network',
    usage: '.httpheaders <url>',
    code: `const url = (Array.isArray(args) ? args.join('') : '').trim();
if (!url) return mzazireply('Usage: ' + prefix + 'httpheaders <url>');
if (!/^https?:\\/\\//i.test(url)) return mzazireply('❌ Include the scheme — http:// or https://');
const keep = ['server', 'content-type', 'content-length', 'cache-control', 'strict-transport-security', 'x-powered-by', 'x-frame-options', 'content-security-policy', 'location', 'via', 'cf-cache-status'];
try {
  const res = await axios.head(url, { timeout: 10000, maxRedirects: 3, validateStatus: function () { return true; }, headers: { 'User-Agent': 'MZAZI-XMD/probe' } });
  const headers = res.headers || {};
  const lines = [];
  for (const key of keep) {
    if (headers[key] !== undefined) {
      let value = String(headers[key]);
      if (value.length > 90) value = value.slice(0, 90) + '…';
      lines.push('  ' + key + ': ' + value);
    }
  }
  if (!lines.length) lines.push('  (none of the usual headers were present)');
  return mzazireply('🧾 *' + url + '*\\n\\nStatus: ' + res.status + '\\n\\n' + lines.join('\\n'));
} catch (e) {
  return mzazireply('❌ Could not read headers from ' + url + ': ' + e.message);
}`,
  },
  {
    name: 'robots',
    aliases: ['robotstxt'],
    description: 'Fetch the robots.txt of a site',
    category: 'Network',
    usage: '.robots <url or domain>',
    code: `let raw = (Array.isArray(args) ? args.join('') : '').trim();
if (!raw) return mzazireply('Usage: ' + prefix + 'robots <url or domain>');
if (!/^https?:\\/\\//i.test(raw)) raw = 'https://' + raw;
let target;
try {
  const parsed = new URL(raw);
  target = parsed.origin + '/robots.txt';
} catch (e) { return mzazireply('❌ I could not read that as a web address.'); }
try {
  const res = await axios.get(target, { timeout: 10000, responseType: 'text', validateStatus: function () { return true; }, headers: { 'User-Agent': 'MZAZI-XMD/probe' } });
  const text = String(res.data || '').trim();
  if (res.status === 404 || !text) return mzazireply('🔎 ' + target + ' returned status ' + res.status + ' with no rules — nothing is disallowed explicitly.');
  const lines = text.split('\\n').filter(function (l) { return l.trim().length && !l.trim().startsWith('#'); });
  const shown = lines.slice(0, 24).join('\\n');
  return mzazireply('🤖 *' + target + '*\\n\\n' + shown + (lines.length > 24 ? '\\n\\n(' + (lines.length - 24) + ' more line(s))' : ''));
} catch (e) {
  return mzazireply('❌ Could not fetch ' + target + ': ' + e.message);
}`,
  },
  {
    name: 'subnet',
    aliases: ['cidr', 'subnetcalc'],
    description: 'Work out the network, mask and usable range of a CIDR block',
    category: 'Network',
    usage: '.subnet 192.168.1.10/24',
    code: `const raw = (Array.isArray(args) ? args.join('') : '').trim();
if (!raw) return mzazireply('Usage: ' + prefix + 'subnet 192.168.1.10/24');
const parts = raw.split('/');
if (parts.length !== 2) return mzazireply('❌ Include the prefix length, like 192.168.1.10/24');
const octets = parts[0].split('.');
if (octets.length !== 4) return mzazireply('❌ That does not look like an IPv4 address.');
for (const o of octets) {
  const n = parseInt(o, 10);
  if (isNaN(n) || n < 0 || n > 255 || String(n) !== String(Number(o))) return mzazireply('❌ Every part of an IPv4 address is a number from 0 to 255.');
}
const bits = parseInt(parts[1], 10);
if (isNaN(bits) || bits < 0 || bits > 32) return mzazireply('❌ The prefix length is between 0 and 32.');
const ip = ((Number(octets[0]) * 256 + Number(octets[1])) * 256 + Number(octets[2])) * 256 + Number(octets[3]);
const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;
const network = (ip & mask) >>> 0;
const broadcast = (network | (~mask >>> 0)) >>> 0;
const toIp = function (n) { return [Math.floor(n / 16777216) % 256, Math.floor(n / 65536) % 256, Math.floor(n / 256) % 256, n % 256].join('.'); };
const total = Math.pow(2, 32 - bits);
let usable = total - 2;
if (bits >= 31) usable = bits === 32 ? 1 : 2;
return mzazireply('🧮 *' + raw + '*\\n\\nNetwork:   ' + toIp(network) + '\\nMask:      ' + toIp(mask) + '\\nBroadcast: ' + toIp(broadcast) + '\\nFirst host: ' + (bits >= 31 ? toIp(network) : toIp((network + 1) >>> 0)) + '\\nLast host:  ' + (bits >= 31 ? toIp(broadcast) : toIp((broadcast - 1) >>> 0)) + '\\n\\nAddresses in the block: ' + total + '\\nUsable for hosts: ' + usable);`,
  },
  {
    name: 'ip2long',
    aliases: ['iplong'],
    description: 'Convert an IPv4 address to its integer value',
    category: 'Network',
    usage: '.ip2long 192.168.1.1',
    code: `const ip = (Array.isArray(args) ? args.join('') : '').trim();
if (!ip) return mzazireply('Usage: ' + prefix + 'ip2long 192.168.1.1');
const octets = ip.split('.');
if (octets.length !== 4) return mzazireply('❌ An IPv4 address has four parts.');
const nums = octets.map(function (o) { return parseInt(o, 10); });
for (const n of nums) {
  if (isNaN(n) || n < 0 || n > 255) return mzazireply('❌ Every part is a number from 0 to 255.');
}
const value = ((nums[0] * 256 + nums[1]) * 256 + nums[2]) * 256 + nums[3];
return mzazireply('🔢 ' + ip + '\\n\\nDecimal: ' + value + '\\nHex: 0x' + value.toString(16).toUpperCase() + '\\nBinary: ' + value.toString(2).padStart(32, '0'));`,
  },
  {
    name: 'long2ip',
    aliases: ['longip'],
    description: 'Convert an integer back into an IPv4 address',
    category: 'Network',
    usage: '.long2ip 3232235777',
    code: `const t = (Array.isArray(args) ? args.join('') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'long2ip 3232235777');
const value = Number(t);
if (!isFinite(value) || Math.floor(value) !== value || value < 0 || value > 4294967295) {
  return mzazireply('❌ Give me a whole number between 0 and 4294967295.');
}
const out = [Math.floor(value / 16777216) % 256, Math.floor(value / 65536) % 256, Math.floor(value / 256) % 256, value % 256];
return mzazireply('🌐 ' + out.join('.') + '\\n\\n(from decimal ' + value + ')');`,
  },
  {
    name: 'isprivateip',
    aliases: ['privateip'],
    description: 'Say whether an IP is private, reserved or routable',
    category: 'Network',
    usage: '.isprivateip <ip>',
    code: `const ip = (Array.isArray(args) ? args.join('') : '').trim();
if (!ip) return mzazireply('Usage: ' + prefix + 'isprivateip <ip>');
const octets = ip.split('.').map(function (o) { return parseInt(o, 10); });
if (octets.length !== 4 || octets.some(function (n) { return isNaN(n) || n < 0 || n > 255; })) {
  return mzazireply('❌ Give me an IPv4 address, like 192.168.1.1');
}
const a = octets[0];
const b = octets[1];
const reasons = [];
if (a === 10) reasons.push('10.0.0.0/8 — private (RFC 1918)');
if (a === 172 && b >= 16 && b <= 31) reasons.push('172.16.0.0/12 — private (RFC 1918)');
if (a === 192 && b === 168) reasons.push('192.168.0.0/16 — private (RFC 1918)');
if (a === 127) reasons.push('127.0.0.0/8 — loopback, this machine only');
if (a === 169 && b === 254) reasons.push('169.254.0.0/16 — link-local, no DHCP answer');
if (a === 100 && b >= 64 && b <= 127) reasons.push('100.64.0.0/10 — carrier-grade NAT');
if (a === 0) reasons.push('0.0.0.0/8 — this network, not a host');
if (a >= 224 && a <= 239) reasons.push('224.0.0.0/4 — multicast');
if (a >= 240) reasons.push('240.0.0.0/4 — reserved');
if (a === 198 && (b === 18 || b === 19)) reasons.push('198.18.0.0/15 — benchmarking range');
if (a === 192 && b === 0) reasons.push('192.0.0.0/24 or 192.0.2.0/24 — special use or documentation');
if (a === 203 && b === 0) reasons.push('203.0.113.0/24 — documentation');
if (reasons.length) return mzazireply('🏠 *' + ip + '* is NOT a public address:\\n\\n' + reasons.map(function (r) { return '  • ' + r; }).join('\\n'));
return mzazireply('🌍 *' + ip + '* looks like an ordinary public address — it is not in any private or reserved block.');`,
  },

  // ── Links ────────────────────────────────────────────────────────────────
  {
    name: 'urlparse',
    aliases: ['parseurl', 'urlinfo'],
    description: 'Break a URL into its parts',
    category: 'Links',
    usage: '.urlparse <url>',
    code: `const raw = (Array.isArray(args) ? args.join('') : '').trim();
if (!raw) return mzazireply('Usage: ' + prefix + 'urlparse <url>');
let u;
try { u = new URL(raw); } catch (e) { return mzazireply('❌ That is not a URL I can read. Include the scheme, like https://example.com/path?x=1'); }
const rows = [
  '  scheme:   ' + u.protocol.replace(':', ''),
  '  host:     ' + u.hostname,
  '  port:     ' + (u.port || '(default)'),
  '  path:     ' + (u.pathname || '/'),
  '  query:    ' + (u.search || '(none)'),
  '  hash:     ' + (u.hash || '(none)')
];
if (u.username) rows.push('  user:     ' + u.username + ' (a credential in the URL — avoid this)');
const params = [];
u.searchParams.forEach(function (v, k) { params.push(k + '=' + v); });
if (params.length) rows.push('  ' + params.length + ' parameter(s): ' + params.join(', '));
return mzazireply('🔗 *URL parts*\\n\\n' + rows.join('\\n'));`,
  },
  {
    name: 'urlparams',
    aliases: ['queryparams', 'getparams'],
    description: 'List the query parameters of a URL, one per line',
    category: 'Links',
    usage: '.urlparams <url>',
    code: `const raw = (Array.isArray(args) ? args.join('') : '').trim();
if (!raw) return mzazireply('Usage: ' + prefix + 'urlparams <url>');
let u;
try { u = new URL(raw); } catch (e) { return mzazireply('❌ That is not a URL I can read.'); }
const rows = [];
u.searchParams.forEach(function (v, k) { rows.push('  ' + k + ' = ' + (v.length ? v : '(empty)')); });
if (!rows.length) return mzazireply('🔗 That URL has no query parameters.');
return mzazireply('🔗 *' + rows.length + ' parameter(s)*\\n\\n' + rows.join('\\n'));`,
  },
  {
    name: 'cleanurl',
    aliases: ['striputm', 'untrackurl'],
    description: 'Strip tracking parameters from a link before sharing it',
    category: 'Links',
    usage: '.cleanurl <url>',
    code: `const raw = (Array.isArray(args) ? args.join('') : '').trim();
if (!raw) return mzazireply('Usage: ' + prefix + 'cleanurl <url>');
let u;
try { u = new URL(raw); } catch (e) { return mzazireply('❌ That is not a URL I can read.'); }
const junk = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'fbclid', 'gclid', 'dclid', 'msclkid', 'igshid', 'igsh', 'mc_cid', 'mc_eid', 'yclid', 'twclid', '_hsenc', '_hsmi', 'ref_src', 'spm', 'scm', 'si', 'feature'];
const removed = [];
for (const key of junk) {
  if (u.searchParams.has(key)) {
    removed.push(key);
    u.searchParams.delete(key);
  }
}
const cleaned = u.toString();
if (!removed.length) return mzazireply('✅ Nothing to strip — that link carries no tracking parameters I know of.\\n\\n' + cleaned);
return mzazireply('🧼 *Cleaned link*\\n\\n' + cleaned + '\\n\\nRemoved: ' + removed.join(', '));`,
  },
  {
    name: 'urlbuild',
    aliases: ['addparam', 'setparam'],
    description: 'Add or change a query parameter on a URL',
    category: 'Links',
    usage: '.urlbuild <url> | <key=value>',
    code: `const raw = (Array.isArray(args) ? args.join(' ') : '').trim();
const parts = raw.split('|');
if (parts.length < 2) return mzazireply('Usage: ' + prefix + 'urlbuild <url> | <key=value>');
let u;
try { u = new URL(parts[0].trim()); } catch (e) { return mzazireply('❌ The first part must be a URL I can read.'); }
const pairs = parts.slice(1).join('|').split(/[&,]/).map(function (s) { return s.trim(); }).filter(Boolean);
const applied = [];
for (const pair of pairs) {
  const eq = pair.indexOf('=');
  if (eq === -1) return mzazireply('❌ Write each parameter as key=value — I could not read "' + pair + '".');
  const key = pair.slice(0, eq).trim();
  const value = pair.slice(eq + 1).trim();
  if (!key) return mzazireply('❌ One of the parameters has an empty name.');
  const existed = u.searchParams.has(key);
  u.searchParams.set(key, value);
  applied.push((existed ? 'updated ' : 'added ') + key);
}
return mzazireply('🔗 ' + u.toString() + '\\n\\n' + applied.join(', '));`,
  },
  {
    name: 'urlsame',
    aliases: ['compareurls', 'sameurl'],
    description: 'Check whether two links are the same page, ignoring tracking',
    category: 'Links',
    usage: '.urlsame <url> | <url>',
    code: `const raw = (Array.isArray(args) ? args.join(' ') : '').trim();
const parts = raw.split('|');
if (parts.length < 2) return mzazireply('Usage: ' + prefix + 'urlsame <url> | <url>');
const junk = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'fbclid', 'gclid', 'igshid', 'mc_cid', 'mc_eid', 'si', 'spm', 'ref'];
const normalise = function (input) {
  const u = new URL(input.trim());
  for (const key of junk) u.searchParams.delete(key);
  u.hash = '';
  let host = u.hostname.toLowerCase();
  if (host.indexOf('www.') === 0) host = host.slice(4);
  const search = u.searchParams.toString();
  return host + (u.port ? ':' + u.port : '') + (u.pathname || '/') + (search ? '?' + search : '');
};
let one;
let two;
try { one = normalise(parts[0]); two = normalise(parts.slice(1).join('|')); }
catch (e) { return mzazireply('❌ Both sides need to be URLs I can read.'); }
if (one === two) return mzazireply('✅ Same page.\\n\\n' + one);
return mzazireply('❌ Different pages.\\n\\n  ' + one + '\\n  ' + two + '\\n\\n(tracking parameters, the hash and a leading www. are ignored)');`,
  },
  {
    name: 'urlresolve',
    aliases: ['resolveurl', 'absolutize'],
    description: 'Turn a relative link into a full URL',
    category: 'Links',
    usage: '.urlresolve <base url> | <relative link>',
    code: `const raw = (Array.isArray(args) ? args.join(' ') : '').trim();
const parts = raw.split('|');
if (parts.length < 2) return mzazireply('Usage: ' + prefix + 'urlresolve <base url> | <relative link>');
try {
  const base = new URL(parts[0].trim());
  const full = new URL(parts.slice(1).join('|').trim(), base);
  return mzazireply('🔗 ' + full.toString() + '\\n\\n(same host, path resolved against ' + base.origin + ')');
} catch (e) {
  return mzazireply('❌ I could not resolve that: ' + e.message);
}`,
  },

  // ── Documents the user sends ─────────────────────────────────────────────
  {
    name: 'doccount',
    aliases: ['countwords', 'docstats'],
    description: 'Count the words, lines and characters in a document you send',
    category: 'Documents',
    usage: 'Send a text document with .doccount as the caption',
    code: `const msg = (m && m.message) ? m.message : {};
const doc = msg.documentMessage;
if (!doc) return mzazireply('📎 Send a *text document* (.txt, .md, .csv, .json, .log) with ' + prefix + 'doccount as the caption.');
if (doc.fileLength && Number(doc.fileLength) > 4 * 1024 * 1024) return mzazireply('❌ That file is larger than 4 MB — send a smaller one.');
try {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: mzazi.updateMediaMessage });
  if (!buf || !buf.length) return mzazireply('❌ Could not download that document.');
  const text = buf.toString('utf8');
  const lines = text.split('\\n');
  const words = text.split(/\\s+/).filter(Boolean);
  const nonEmpty = lines.filter(function (l) { return l.trim().length; });
  const longest = lines.reduce(function (a, b) { return b.length > a.length ? b : a; }, '');
  return mzazireply('📄 *' + (doc.fileName || 'document') + '*\\n\\nCharacters: ' + text.length + '\\nWords: ' + words.length + '\\nLines: ' + lines.length + '\\nNon-empty lines: ' + nonEmpty.length + '\\nLongest line: ' + longest.length + ' characters\\nReading time: about ' + Math.max(1, Math.round(words.length / 200)) + ' minute(s)');
} catch (e) {
  return mzazireply('❌ Could not read that document: ' + e.message);
}`,
  },
  {
    name: 'docfind',
    aliases: ['findindoc', 'searchdoc'],
    description: 'Find a word in a document you send, with the matching lines',
    category: 'Documents',
    usage: 'Send a text document with .docfind <word> as the caption',
    code: `const msg = (m && m.message) ? m.message : {};
const doc = msg.documentMessage;
if (!doc) return mzazireply('📎 Send a *text document* with ' + prefix + 'docfind <word> as the caption.');
const needle = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!needle) return mzazireply('📎 Add the word to look for in the caption, like ' + prefix + 'docfind invoice');
if (doc.fileLength && Number(doc.fileLength) > 4 * 1024 * 1024) return mzazireply('❌ That file is larger than 4 MB — send a smaller one.');
try {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: mzazi.updateMediaMessage });
  if (!buf || !buf.length) return mzazireply('❌ Could not download that document.');
  const lines = buf.toString('utf8').split('\\n');
  const lower = needle.toLowerCase();
  const hits = [];
  for (let i = 0; i < lines.length && hits.length < 15; i++) {
    if (lines[i].toLowerCase().indexOf(lower) !== -1) hits.push((i + 1) + ': ' + lines[i].slice(0, 120));
  }
  if (!hits.length) return mzazireply('🔎 "' + needle + '" does not appear in ' + (doc.fileName || 'that document') + '.\\n\\n(' + lines.length + ' line(s) searched)');
  return mzazireply('🔎 *' + hits.length + ' match(es)* for "' + needle + '"\\n\\n' + hits.join('\\n') + (hits.length === 15 ? '\\n\\n(capped at 15 — there may be more)' : ''));
} catch (e) {
  return mzazireply('❌ Could not read that document: ' + e.message);
}`,
  },
  {
    name: 'dochead',
    aliases: ['docpeek', 'showdoc'],
    description: 'Show the first part of a document you send, without downloading it to a phone',
    category: 'Documents',
    usage: 'Send a text document with .dochead as the caption',
    code: `const msg = (m && m.message) ? m.message : {};
const doc = msg.documentMessage;
if (!doc) return mzazireply('📎 Send a *text document* with ' + prefix + 'dochead as the caption.');
if (doc.fileLength && Number(doc.fileLength) > 4 * 1024 * 1024) return mzazireply('❌ That file is larger than 4 MB — send a smaller one.');
try {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: mzazi.updateMediaMessage });
  if (!buf || !buf.length) return mzazireply('❌ Could not download that document.');
  const text = buf.toString('utf8');
  const head = text.slice(0, 1200);
  return mzazireply('📄 *' + (doc.fileName || 'document') + '* — first 1200 characters\\n\\n' + head + (text.length > 1200 ? '\\n\\n[…' + (text.length - 1200) + ' more characters]' : ''));
} catch (e) {
  return mzazireply('❌ Could not read that document: ' + e.message);
}`,
  },
  {
    name: 'fileb64',
    aliases: ['base64file', 'encodefile'],
    description: 'Turn a small file you send into base64 text',
    category: 'Documents',
    usage: 'Send a file (under 256 KB) with .fileb64 as the caption',
    code: `const msg = (m && m.message) ? m.message : {};
const doc = msg.documentMessage || msg.imageMessage;
if (!doc) return mzazireply('📎 Send a *file* with ' + prefix + 'fileb64 as the caption.');
if (doc.fileLength && Number(doc.fileLength) > 256 * 1024) return mzazireply('❌ Base64 makes a file a third bigger and WhatsApp caps a message at 65,000 characters — keep it under 256 KB.');
try {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: mzazi.updateMediaMessage });
  if (!buf || !buf.length) return mzazireply('❌ Could not download that file.');
  if (buf.length > 256 * 1024) return mzazireply('❌ That file is ' + formatBytes(buf.length) + ' — too large to return as text.');
  const b64 = buf.toString('base64');
  return mzazireply('🔐 *' + (doc.fileName || 'file') + '* (' + formatBytes(buf.length) + ')\\n\\n' + b64 + '\\n\\n(Decode with base64 -d.)');
} catch (e) {
  return mzazireply('❌ Could not read that file: ' + e.message);
}`,
  },
];
