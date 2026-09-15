// ─────────────────────────────────────────────────────────────────────────────
// MZAZI XMD — command pack, part 6 of 8: ENCODING, CODES
//
// Part 1 shipped base64, hex, binary, ROT13, Caesar and Morse. This part is the
// second tier: the encodings people actually ask for when something has been
// encoded twice, the ciphers that turn up in CTF-style puzzles, and the checksum
// maths that decides whether an ID is real before it is typed into a form.
//
// ── Two rules that matter for this file ──────────────────────────────────────
// 1. Every backslash is DOUBLED. A body lives inside a template literal, so a
//    single \\s would collapse to a bare "s" before the body ever ran, and the
//    command would compile while matching the letter s instead of whitespace.
//    scripts/seed-commands.js refuses to write a part file that gets this wrong.
// 2. Where a backslash has to appear in the *output* (a \\uXXXX escape, say) it
//    is built with String.fromCharCode(92) rather than written literally, so
//    there is nothing left to mis-count.
//
// Base32, Base58, gzip and the JWT decoder use Node built-ins only — Buffer,
// BigInt and zlib — so nothing here needs a network call or a system binary.
// ─────────────────────────────────────────────────────────────────────────────

module.exports = [
  // ── Base encodings beyond base64 ─────────────────────────────────────────
  {
    name: 'base32',
    aliases: ['tobase32'],
    description: 'Encode text as Base32 (RFC 4648)',
    category: 'Encoding',
    usage: '.base32 <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'base32 <text>');
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const buf = Buffer.from(t, 'utf8');
let bits = '';
for (const b of buf) bits += b.toString(2).padStart(8, '0');
let out = '';
for (let i = 0; i + 5 <= bits.length; i += 5) out += A.charAt(parseInt(bits.slice(i, i + 5), 2));
const rem = bits.length % 5;
if (rem) out += A.charAt(parseInt(bits.slice(bits.length - rem).padEnd(5, '0'), 2));
while (out.length % 8) out += '=';
return mzazireply(out + '\\n\\n(' + out.length + ' characters, padding included)');`,
  },
  {
    name: 'unbase32',
    aliases: ['frombase32'],
    description: 'Decode Base32 text back to plain text',
    category: 'Encoding',
    usage: '.unbase32 <base32 text>',
    code: `const s = (Array.isArray(args) ? args.join('') : '').trim().toUpperCase().replace(/=+$/, '');
if (!s) return mzazireply('Usage: ' + prefix + 'unbase32 <base32 text>');
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
let bits = '';
for (const c of s) {
  const v = A.indexOf(c);
  if (v === -1) return mzazireply('❌ "' + c + '" is not a Base32 character (A-Z and 2-7 only).');
  bits += v.toString(2).padStart(5, '0');
}
const bytes = [];
for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
return mzazireply(Buffer.from(bytes).toString('utf8'));`,
  },
  {
    name: 'base58',
    aliases: ['tobase58'],
    description: 'Encode text as Base58, the alphabet Bitcoin addresses use',
    category: 'Encoding',
    usage: '.base58 <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'base58 <text>');
const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const buf = Buffer.from(t, 'utf8');
let n = BigInt('0x' + buf.toString('hex'));
let out = '';
while (n > BigInt(0)) {
  out = A.charAt(Number(n % BigInt(58))) + out;
  n = n / BigInt(58);
}
for (const b of buf) {
  if (b === 0) out = '1' + out;
  else break;
}
return mzazireply(out || '1');`,
  },
  {
    name: 'unbase58',
    aliases: ['frombase58'],
    description: 'Decode Base58 text back to plain text',
    category: 'Encoding',
    usage: '.unbase58 <base58 text>',
    code: `const s = (Array.isArray(args) ? args.join('') : '').trim();
if (!s) return mzazireply('Usage: ' + prefix + 'unbase58 <base58 text>');
const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
let n = BigInt(0);
for (const c of s) {
  const v = A.indexOf(c);
  if (v === -1) return mzazireply('❌ "' + c + '" is not a Base58 character (0, O, I and l are excluded by design).');
  n = n * BigInt(58) + BigInt(v);
}
const bytes = [];
for (const c of s) {
  if (c === '1') bytes.push(0);
  else break;
}
if (n > BigInt(0)) {
  let hex = n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  for (const b of Buffer.from(hex, 'hex')) bytes.push(b);
}
return mzazireply(Buffer.from(bytes).toString('utf8'));`,
  },
  {
    name: 'gziptext',
    aliases: ['gzipb64'],
    description: 'Compress text with gzip and show it as base64',
    category: 'Encoding',
    usage: '.gziptext <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'gziptext <text>');
const zlib = require('zlib');
try {
  const raw = Buffer.from(t, 'utf8');
  const out = zlib.gzipSync(raw).toString('base64');
  const saved = raw.length ? Math.round((1 - zlib.gzipSync(raw).length / raw.length) * 100) : 0;
  return mzazireply(out + '\\n\\n(' + raw.length + ' bytes → ' + zlib.gzipSync(raw).length + ' bytes, ' + saved + '% smaller)');
} catch (e) { return mzazireply('❌ Could not compress that: ' + e.message); }`,
  },
  {
    name: 'ungziptext',
    aliases: ['ungzipb64'],
    description: 'Decompress base64 gzip text back to plain text',
    category: 'Encoding',
    usage: '.ungziptext <base64 text>',
    code: `const t = (Array.isArray(args) ? args.join('') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'ungziptext <base64 text>');
const zlib = require('zlib');
try {
  return mzazireply(zlib.gunzipSync(Buffer.from(t, 'base64')).toString('utf8'));
} catch (e) { return mzazireply('❌ That is not gzipped base64: ' + e.message); }`,
  },
  {
    name: 'jwtdecode',
    aliases: ['jwt', 'decodejwt'],
    description: 'Read the header and payload of a JWT without verifying it',
    category: 'Encoding',
    usage: '.jwtdecode <token>',
    code: `const t = (Array.isArray(args) ? args.join('') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'jwtdecode <token>');
const parts = t.split('.');
if (parts.length < 2) return mzazireply('❌ A JWT has three dot-separated parts. I can see ' + parts.length + '.');
const readPart = function (s) {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (b64.length % 4)) % 4;
  if (pad) b64 += new Array(pad + 1).join('=');
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
};
let header;
let payload;
try {
  header = readPart(parts[0]);
  payload = readPart(parts[1]);
} catch (e) { return mzazireply('❌ Could not read that as a JWT: ' + e.message); }
let out = '🔓 *Header*\\n' + JSON.stringify(header, null, 2) + '\\n\\n*Payload*\\n' + JSON.stringify(payload, null, 2);
if (payload && payload.exp) {
  const when = new Date(Number(payload.exp) * 1000);
  const passed = when.getTime() < Date.now();
  out += '\\n\\n⏰ Expires: ' + when.toISOString() + (passed ? ' (already expired)' : ' (still valid)');
}
return mzazireply(out + '\\n\\n⚠️ Decoded only — the signature was NOT verified.');`,
  },

  // ── Escapes, dumps and code points ───────────────────────────────────────
  {
    name: 'unicodeescape',
    aliases: ['uescape', 'jsunicode'],
    description: 'Escape non-ASCII characters as unicode codes',
    category: 'Encoding',
    usage: '.unicodeescape <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'unicodeescape <text>');
const BS = String.fromCharCode(92);
const out = t.split('').map(function (c) {
  const code = c.charCodeAt(0);
  if (code >= 32 && code <= 126) return c;
  return BS + 'u' + code.toString(16).padStart(4, '0');
}).join('');
return mzazireply(out);`,
  },
  {
    name: 'unicodeunescape',
    aliases: ['unuescape'],
    description: 'Turn escaped unicode codes back into characters',
    category: 'Encoding',
    usage: '.unicodeunescape <text with unicode escapes>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'unicodeunescape <text with unicode escapes>');
const BS = String.fromCharCode(92);
const pattern = new RegExp(BS + BS + 'u([0-9a-fA-F]{4})', 'g');
const out = t.replace(pattern, function (match, hex) { return String.fromCharCode(parseInt(hex, 16)); });
if (out === t) return mzazireply('⚠️ Nothing to unescape — I found no ' + BS + 'uXXXX sequence.');
return mzazireply(out);`,
  },
  {
    name: 'htmlencode',
    aliases: ['htmlentities'],
    description: 'Escape HTML special characters as entities',
    category: 'Encoding',
    usage: '.htmlencode <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'htmlencode <text>');
const out = t
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
return mzazireply(out);`,
  },
  {
    name: 'htmldecode',
    aliases: ['htmlunescape', 'unhtmlentity'],
    description: 'Turn HTML entities back into characters',
    category: 'Encoding',
    usage: '.htmldecode <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'htmldecode <text>');
let out = t
  .replace(/&nbsp;/g, ' ')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>');
out = out.replace(/&#([0-9]{1,5});/g, function (match, dec) { return String.fromCharCode(parseInt(dec, 10)); });
out = out.replace(/&amp;/g, '&');
return mzazireply(out);`,
  },
  {
    name: 'hexdump',
    aliases: ['hexview', 'xxdlike'],
    description: 'Show text as a classic offset / hex / ascii dump',
    category: 'Encoding',
    usage: '.hexdump <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'hexdump <text>');
const buf = Buffer.from(t, 'utf8');
const lineCount = Math.min(40, Math.ceil(buf.length / 16) || 1);
const lines = [];
for (let row = 0; row < lineCount; row++) {
  const off = row * 16;
  const chunk = buf.slice(off, off + 16);
  const hex = [];
  const chars = [];
  for (let i = 0; i < 16; i++) {
    if (i < chunk.length) {
      const byte = chunk[i];
      hex.push(byte.toString(16).padStart(2, '0'));
      chars.push(byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.');
    } else {
      hex.push('  ');
      chars.push(' ');
    }
  }
  lines.push(off.toString(16).padStart(4, '0') + '  ' + hex.slice(0, 8).join(' ') + '  ' + hex.slice(8).join(' ') + '  |' + chars.join('') + '|');
}
let out = lines.join('\\n');
if (buf.length > 640) out += '\\n\\n(truncated — first 640 bytes of ' + buf.length + ')';
return mzazireply(out);`,
  },
  {
    name: 'charcodes',
    aliases: ['charcode', 'codepoints'],
    description: 'Show the numeric code of every character',
    category: 'Encoding',
    usage: '.charcodes <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'charcodes <text>');
if (t.length > 200) return mzazireply('❌ Keep it to 200 characters.');
const codes = [];
for (const c of t) codes.push(c.codePointAt(0));
return mzazireply('🔢 ' + codes.join(' ') + '\\n\\n(' + codes.length + ' character(s))');`,
  },
  {
    name: 'charmap',
    aliases: ['charinfo', 'unicodeinfo'],
    description: 'Show the code point, hex value and UTF-8 bytes of each character',
    category: 'Codes',
    usage: '.charmap <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'charmap <text>');
const chars = Array.from(t).slice(0, 20);
const lines = chars.map(function (c) {
  const cp = c.codePointAt(0);
  const bytes = [];
  for (const b of Buffer.from(c, 'utf8')) bytes.push(b.toString(16).padStart(2, '0'));
  const printable = cp >= 32 && cp !== 127 ? c : '(no glyph)';
  return '  ' + printable + '  U+' + cp.toString(16).toUpperCase().padStart(4, '0') + '  dec ' + cp + '  utf8 ' + bytes.join(' ');
});
let out = '🔤 *Character map*\\n\\n' + lines.join('\\n');
if (Array.from(t).length > 20) out += '\\n\\n(first 20 of ' + Array.from(t).length + ')';
return mzazireply(out);`,
  },
  {
    name: 'asciilookup',
    aliases: ['ascii', 'asciitable'],
    description: 'Look up an ASCII code, or the code for a character',
    category: 'Codes',
    usage: '.asciilookup <number or character>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'asciilookup <number or character>');
if (/^[0-9]{1,3}$/.test(t)) {
  const n = parseInt(t, 10);
  if (n < 0 || n > 255) return mzazireply('❌ Give me a number between 0 and 255.');
  const glyph = n >= 32 && n !== 127 ? String.fromCharCode(n) : '(not printable)';
  return mzazireply('🔤 ' + n + ' → ' + glyph + '\\n\\nhex: 0x' + n.toString(16).toUpperCase() + '\\nbinary: ' + n.toString(2).padStart(8, '0'));
}
const code = t.charCodeAt(0);
return mzazireply('🔤 ' + JSON.stringify(t.charAt(0)) + ' → ' + code + '\\n\\nhex: 0x' + code.toString(16).toUpperCase() + '\\nbinary: ' + code.toString(2).padStart(8, '0') + '\\n\\n(paste more than one character and I only read the first)');`,
  },
  {
    name: 'hex2bin',
    aliases: ['hextobin'],
    description: 'Convert a hex string into a binary string',
    category: 'Encoding',
    usage: '.hex2bin <hex>',
    code: `const t = (Array.isArray(args) ? args.join('') : '').trim().replace(/[ ,:]/g, '');
if (!t) return mzazireply('Usage: ' + prefix + 'hex2bin <hex>');
if (!/^[0-9a-fA-F]+$/.test(t)) return mzazireply('❌ Hex only — the letters a-f and the digits 0-9.');
if (t.length % 2) return mzazireply('❌ A hex string needs an even number of digits (I have ' + t.length + ').');
const out = [];
for (let i = 0; i < t.length; i += 2) out.push(parseInt(t.substr(i, 2), 16).toString(2).padStart(8, '0'));
return mzazireply(out.join(' '));`,
  },
  {
    name: 'bin2hex',
    aliases: ['bintohex'],
    description: 'Convert a binary string into hex',
    category: 'Encoding',
    usage: '.bin2hex <binary>',
    code: `const t = (Array.isArray(args) ? args.join('') : '').trim().replace(/[ ,]/g, '');
if (!t) return mzazireply('Usage: ' + prefix + 'bin2hex <binary>');
if (!/^[01]+$/.test(t)) return mzazireply('❌ Binary only — 0s and 1s.');
let bits = t;
const pad = (8 - (bits.length % 8)) % 8;
if (pad) bits += new Array(pad + 1).join('0');
const out = [];
for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.substr(i, 8), 2).toString(16).padStart(2, '0'));
return mzazireply(out.join('') + (pad ? '\\n\\n(' + pad + ' zero(s) added to fill the last byte)' : ''));`,
  },

  // ── Ciphers ──────────────────────────────────────────────────────────────
  {
    name: 'atbash',
    aliases: ['atbashcipher'],
    description: 'Atbash cipher — the alphabet reversed (A becomes Z)',
    category: 'Encoding',
    usage: '.atbash <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'atbash <text>');
const out = t.split('').map(function (c) {
  const code = c.charCodeAt(0);
  if (code >= 65 && code <= 90) return String.fromCharCode(90 - (code - 65));
  if (code >= 97 && code <= 122) return String.fromCharCode(122 - (code - 97));
  return c;
}).join('');
return mzazireply(out + '\\n\\n(Atbash is its own inverse — run it again to get back.)');`,
  },
  {
    name: 'bacon',
    aliases: ['baconcipher'],
    description: 'Encode text with the Bacon cipher (five A/B letters per character)',
    category: 'Encoding',
    usage: '.bacon <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim().toUpperCase().replace(/[^A-Z]/g, '');
if (!t) return mzazireply('Usage: ' + prefix + 'bacon <text>');
if (t.length > 40) return mzazireply('❌ Keep it to 40 letters — each one becomes five.');
const out = t.split('').map(function (c) {
  const bits = (c.charCodeAt(0) - 65).toString(2).padStart(5, '0');
  return bits.split('').map(function (b) { return b === '1' ? 'B' : 'A'; }).join('');
});
return mzazireply(out.join(' ') + '\\n\\n(A = 0, B = 1; five letters per character)');`,
  },
  {
    name: 'unbacon',
    aliases: ['unbaconcipher'],
    description: 'Decode a Bacon cipher back to text',
    category: 'Encoding',
    usage: '.unbacon <AABBB AABBA ...>',
    code: `const t = (Array.isArray(args) ? args.join('') : '').trim().toUpperCase().replace(/[^AB]/g, '');
if (!t) return mzazireply('Usage: ' + prefix + 'unbacon <AABBB AABBA ...>');
const pad = (5 - (t.length % 5)) % 5;
if (pad) return mzazireply('❌ A Bacon message needs a multiple of five letters (I have ' + t.length + ' — ' + pad + ' too many).');
const out = [];
for (let i = 0; i < t.length; i += 5) {
  const bits = t.substr(i, 5).split('').map(function (c) { return c === 'B' ? '1' : '0'; }).join('');
  out.push(String.fromCharCode(65 + parseInt(bits, 2)));
}
return mzazireply('🔓 ' + out.join(''));`,
  },
  {
    name: 'railfence',
    aliases: ['railfencecipher'],
    description: 'Encode text with the rail fence (zig-zag) cipher',
    category: 'Encoding',
    usage: '.railfence [rails] <text>',
    code: `const a = Array.isArray(args) ? args : [];
let rails = 3;
let rest = a.slice();
if (rest.length && /^[0-9]+$/.test(rest[0])) { rails = parseInt(rest[0], 10); rest = rest.slice(1); }
const t = rest.join(' ').replace(/[^A-Za-z0-9]/g, '');
if (!t) return mzazireply('Usage: ' + prefix + 'railfence [rails] <text>');
if (rails < 2 || rails > 10) return mzazireply('❌ Rails must be between 2 and 10.');
const rows = [];
for (let i = 0; i < rails; i++) rows.push('');
let row = 0;
let dir = 1;
for (const c of t) {
  rows[row] += c;
  if (row === 0) dir = 1;
  else if (row === rails - 1) dir = -1;
  row += dir;
}
return mzazireply(rows.join('') + '\\n\\n(' + rails + ' rails, ' + t.length + ' letters — punctuation and spaces removed)');`,
  },
  {
    name: 'vigenere',
    aliases: ['vigenerecipher'],
    description: 'Encrypt text with a Vigenere keyword',
    category: 'Encoding',
    usage: '.vigenere <key> | <text>',
    code: `const raw = (Array.isArray(args) ? args.join(' ') : '');
const parts = raw.split('|');
if (parts.length < 2) return mzazireply('Usage: ' + prefix + 'vigenere <key> | <text>');
const key = parts[0].replace(/[^A-Za-z]/g, '').toUpperCase();
const text = parts.slice(1).join('|');
if (!key) return mzazireply('❌ The key needs at least one letter.');
if (!text.trim()) return mzazireply('❌ There is no text to encrypt.');
let k = 0;
const out = text.split('').map(function (c) {
  const code = c.charCodeAt(0);
  let base = -1;
  if (code >= 65 && code <= 90) base = 65;
  else if (code >= 97 && code <= 122) base = 97;
  if (base === -1) return c;
  const shift = key.charCodeAt(k % key.length) - 65;
  k++;
  return String.fromCharCode(base + ((code - base + shift) % 26));
}).join('');
return mzazireply('🔐 ' + out + '\\n\\n(decrypt with ' + prefix + 'unvigenere ' + key + ' | <text>)');`,
  },
  {
    name: 'unvigenere',
    aliases: ['devigenere'],
    description: 'Decrypt text encrypted with a Vigenere keyword',
    category: 'Encoding',
    usage: '.unvigenere <key> | <text>',
    code: `const raw = (Array.isArray(args) ? args.join(' ') : '');
const parts = raw.split('|');
if (parts.length < 2) return mzazireply('Usage: ' + prefix + 'unvigenere <key> | <text>');
const key = parts[0].replace(/[^A-Za-z]/g, '').toUpperCase();
const text = parts.slice(1).join('|');
if (!key) return mzazireply('❌ The key needs at least one letter.');
if (!text.trim()) return mzazireply('❌ There is no text to decrypt.');
let k = 0;
const out = text.split('').map(function (c) {
  const code = c.charCodeAt(0);
  let base = -1;
  if (code >= 65 && code <= 90) base = 65;
  else if (code >= 97 && code <= 122) base = 97;
  if (base === -1) return c;
  const shift = key.charCodeAt(k % key.length) - 65;
  k++;
  return String.fromCharCode(base + ((code - base - shift + 26) % 26));
}).join('');
return mzazireply('🔓 ' + out);`,
  },
  {
    name: 'xortext',
    aliases: ['xorhex'],
    description: 'XOR text against a key and print the result as hex',
    category: 'Encoding',
    usage: '.xortext <key> | <text>',
    code: `const raw = (Array.isArray(args) ? args.join(' ') : '');
const parts = raw.split('|');
if (parts.length < 2) return mzazireply('Usage: ' + prefix + 'xortext <key> | <text>');
const key = parts[0];
const text = parts.slice(1).join('|');
if (!key) return mzazireply('❌ Give me a key.');
if (!text) return mzazireply('❌ Give me text to XOR.');
const kbuf = Buffer.from(key, 'utf8');
const tbuf = Buffer.from(text, 'utf8');
const out = Buffer.alloc(tbuf.length);
for (let i = 0; i < tbuf.length; i++) out[i] = tbuf[i] ^ kbuf[i % kbuf.length];
return mzazireply(out.toString('hex') + '\\n\\n(' + tbuf.length + ' byte(s) — decrypt with ' + prefix + 'unxortext ' + key + ' | <hex>)');`,
  },
  {
    name: 'unxortext',
    aliases: ['unxor', 'dexor'],
    description: 'Reverse an XOR, given the key and the hex output',
    category: 'Encoding',
    usage: '.unxortext <key> | <hex>',
    code: `const raw = (Array.isArray(args) ? args.join(' ') : '');
const parts = raw.split('|');
if (parts.length < 2) return mzazireply('Usage: ' + prefix + 'unxortext <key> | <hex>');
const key = parts[0];
const hex = parts.slice(1).join('|').replace(/[^0-9a-fA-F]/g, '');
if (!key) return mzazireply('❌ Give me the key.');
if (!hex) return mzazireply('❌ Give me the hex to decrypt.');
if (hex.length % 2) return mzazireply('❌ That hex has an odd number of digits.');
if (!/^[0-9a-fA-F]+$/.test(hex)) return mzazireply('❌ Hex only, please.');
const kbuf = Buffer.from(key, 'utf8');
const tbuf = Buffer.from(hex, 'hex');
const out = Buffer.alloc(tbuf.length);
for (let i = 0; i < tbuf.length; i++) out[i] = tbuf[i] ^ kbuf[i % kbuf.length];
return mzazireply(out.toString('utf8'));`,
  },
  {
    name: 'braille',
    aliases: ['brailletext'],
    description: 'Write text in Braille patterns',
    category: 'Encoding',
    usage: '.braille <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'braille <text>');
const map = { 'a': '⠁', 'b': '⠃', 'c': '⠉', 'd': '⠙', 'e': '⠑', 'f': '⠋', 'g': '⠛', 'h': '⠓', 'i': '⠊', 'j': '⠚',
  'k': '⠅', 'l': '⠇', 'm': '⠍', 'n': '⠝', 'o': '⠕', 'p': '⠏', 'q': '⠟', 'r': '⠗', 's': '⠎', 't': '⠞',
  'u': '⠥', 'v': '⠧', 'w': '⠺', 'x': '⠭', 'y': '⠽', 'z': '⠵',
  '1': '⠁', '2': '⠃', '3': '⠉', '4': '⠙', '5': '⠑', '6': '⠋', '7': '⠛', '8': '⠓', '9': '⠊', '0': '⠚',
  ',': '⠂', ';': '⠆', ':': '⠒', '.': '⠲', '?': '⠦', '!': '⠖', "'": '⠄', '-': '⠤', ' ': ' ' };
const out = t.toLowerCase().split('').map(function (c) { return map[c] || c; }).join('');
return mzazireply(out + '\\n\\n(grade 1 Braille — digits share letters, as the number sign is not written)');`,
  },

  // ── Colour maths — the same formulas the design work uses ────────────────
  {
    name: 'hex2rgb',
    aliases: ['hextorgb'],
    description: 'Convert a hex colour into rgb() values',
    category: 'Codes',
    usage: '.hex2rgb #7C3AED',
    code: `const raw = (Array.isArray(args) ? args.join('') : '').trim().replace(/^#/, '');
if (!raw) return mzazireply('Usage: ' + prefix + 'hex2rgb #7C3AED');
let hex = raw;
if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
if (!/^[0-9a-fA-F]{6}$/.test(hex)) return mzazireply('❌ Give me three or six hex digits, like #7C3AED.');
const r = parseInt(hex.substr(0, 2), 16);
const g = parseInt(hex.substr(2, 2), 16);
const b = parseInt(hex.substr(4, 2), 16);
return mzazireply('🎨 rgb(' + r + ', ' + g + ', ' + b + ')\\n#' + hex.toUpperCase() + '\\n\\nEach channel runs 0-255.');`,
  },
  {
    name: 'rgb2hex',
    aliases: ['rgbhex'],
    description: 'Convert rgb() values into a hex colour',
    category: 'Codes',
    usage: '.rgb2hex 124, 58, 237',
    code: `const raw = (Array.isArray(args) ? args.join('') : '').trim();
const nums = raw.split(/[^0-9]+/).filter(function (v) { return v.length; }).slice(0, 3);
if (nums.length < 3) return mzazireply('Usage: ' + prefix + 'rgb2hex 124, 58, 237');
const vals = nums.map(function (v) { return parseInt(v, 10); });
for (const v of vals) {
  if (isNaN(v) || v < 0 || v > 255) return mzazireply('❌ Each channel must be a number from 0 to 255.');
}
const hex = vals.map(function (v) { return v.toString(16).padStart(2, '0'); }).join('').toUpperCase();
return mzazireply('🎨 #' + hex + '\\n\\nrgb(' + vals.join(', ') + ')');`,
  },
  {
    name: 'hex2hsl',
    aliases: ['hextohsl'],
    description: 'Convert a hex colour into hsl() values',
    category: 'Codes',
    usage: '.hex2hsl #7C3AED',
    code: `const raw = (Array.isArray(args) ? args.join('') : '').trim().replace(/^#/, '');
if (!raw) return mzazireply('Usage: ' + prefix + 'hex2hsl #7C3AED');
let hex = raw;
if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
if (!/^[0-9a-fA-F]{6}$/.test(hex)) return mzazireply('❌ Give me three or six hex digits.');
const r = parseInt(hex.substr(0, 2), 16) / 255;
const g = parseInt(hex.substr(2, 2), 16) / 255;
const b = parseInt(hex.substr(4, 2), 16) / 255;
const max = Math.max(r, g, b);
const min = Math.min(r, g, b);
const d = max - min;
const l = (max + min) / 2;
let h = 0;
let s = 0;
if (d !== 0) {
  s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = h * 60;
}
return mzazireply('🎨 hsl(' + Math.round(h) + ', ' + Math.round(s * 100) + '%, ' + Math.round(l * 100) + '%)\\n#' + hex.toUpperCase());`,
  },
  {
    name: 'hsl2hex',
    aliases: ['hslhex'],
    description: 'Convert hsl() values into a hex colour',
    category: 'Codes',
    usage: '.hsl2hex 262, 83%, 58%',
    code: `const raw = (Array.isArray(args) ? args.join('') : '').trim();
const nums = raw.split(/[^0-9.]+/).filter(function (v) { return v.length; }).slice(0, 3);
if (nums.length < 3) return mzazireply('Usage: ' + prefix + 'hsl2hex 262, 83%, 58%');
let h = parseFloat(nums[0]) % 360;
if (isNaN(h)) return mzazireply('❌ The hue must be a number.');
if (h < 0) h += 360;
const s = Math.min(1, Math.max(0, parseFloat(nums[1]) / 100));
const l = Math.min(1, Math.max(0, parseFloat(nums[2]) / 100));
const c = (1 - Math.abs(2 * l - 1)) * s;
const x = c * (1 - Math.abs((h / 60) % 2 - 1));
const m = l - c / 2;
let rp = 0;
let gp = 0;
let bp = 0;
if (h < 60) { rp = c; gp = x; }
else if (h < 120) { rp = x; gp = c; }
else if (h < 180) { gp = c; bp = x; }
else if (h < 240) { gp = x; bp = c; }
else if (h < 300) { rp = x; bp = c; }
else { rp = c; bp = x; }
const to = function (v) { return Math.round((v + m) * 255).toString(16).padStart(2, '0'); };
return mzazireply('🎨 #' + (to(rp) + to(gp) + to(bp)).toUpperCase());`,
  },
  {
    name: 'colorinfo',
    aliases: ['hexinfo'],
    description: 'rgb, hsl and contrast against white and black, for a colour',
    category: 'Codes',
    usage: '.colorinfo #7C3AED',
    code: `const raw = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!raw) return mzazireply('Usage: ' + prefix + 'colorinfo #7C3AED');
const tokens = raw.split(/[^#0-9a-fA-F]+/).filter(function (v) { return v.length; }).slice(0, 3);
if (!tokens.length) return mzazireply('❌ Give me one or more hex colours.');
const lum = function (r, g, b) {
  const ch = [r, g, b].map(function (v) {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const blocks = [];
for (const token of tokens) {
  let hex = token.replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) { blocks.push('  ' + token + ' — not a hex colour'); continue; }
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const L = lum(r, g, b);
  const onWhite = 1.05 / (L + 0.05);
  const onBlack = (L + 0.05) / 0.05;
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const d = max - min;
  const l = (max + min) / 2;
  let hh = 0;
  let ss = 0;
  if (d !== 0) {
    ss = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rf) hh = (gf - bf) / d + (gf < bf ? 6 : 0);
    else if (max === gf) hh = (bf - rf) / d + 2;
    else hh = (rf - gf) / d + 4;
    hh = hh * 60;
  }
  const mark = onWhite >= 4.5 ? ' ✅' : ' ⚠️';
  blocks.push('  #' + hex.toUpperCase() + '\\n    rgb(' + r + ', ' + g + ', ' + b + ')\\n    hsl(' + Math.round(hh) + ', ' + Math.round(ss * 100) + '%, ' + Math.round(l * 100) + '%)\\n    against white: ' + onWhite.toFixed(2) + ':1' + mark + '\\n    against black: ' + onBlack.toFixed(2) + ':1');
}
return mzazireply('🎨 *Colour report*\\n\\n' + blocks.join('\\n\\n'));`,
  },
  {
    name: 'contrastcheck',
    aliases: ['contrastratio', 'wcagcontrast'],
    description: 'Check two colours against the WCAG readability thresholds',
    category: 'Codes',
    usage: '.contrastcheck #FFFFFF | #1A1A28',
    code: `const raw = (Array.isArray(args) ? args.join(' ') : '').trim();
const tokens = raw.split(/[^#0-9a-fA-F]+/).filter(function (v) { return v.length; });
if (tokens.length < 2) return mzazireply('Usage: ' + prefix + 'contrastcheck #FFFFFF | #1A1A28');
const read = function (token) {
  let hex = token.replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return { r: parseInt(hex.substr(0, 2), 16), g: parseInt(hex.substr(2, 2), 16), b: parseInt(hex.substr(4, 2), 16), hex: hex.toUpperCase() };
};
const A = read(tokens[0]);
const B = read(tokens[1]);
if (!A || !B) return mzazireply('❌ Both values must be hex colours, for example #FFFFFF and #1A1A28.');
const lum = function (c) {
  const ch = [c.r, c.g, c.b].map(function (v) {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const l1 = lum(A);
const l2 = lum(B);
const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
const ok = function (min) { return ratio >= min ? 'pass' : 'FAIL'; };
return mzazireply('🎨 *Contrast*\\n\\n#' + A.hex + ' against #' + B.hex + '\\nRatio ' + ratio.toFixed(2) + ':1\\n\\nNormal text, AA (4.5:1) — ' + ok(4.5) + '\\nNormal text, AAA (7:1) — ' + ok(7) + '\\nLarge text, AA (3:1) — ' + ok(3) + '\\nButtons and borders (3:1) — ' + ok(3));`,
  },
  {
    name: 'colortints',
    aliases: ['tints', 'shades'],
    description: 'Generate lighter tints and darker shades of a colour',
    category: 'Codes',
    usage: '.colortints #7C3AED',
    code: `const raw = (Array.isArray(args) ? args.join('') : '').trim().replace(/^#/, '');
if (!raw) return mzazireply('Usage: ' + prefix + 'colortints #7C3AED');
let hex = raw;
if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
if (!/^[0-9a-fA-F]{6}$/.test(hex)) return mzazireply('❌ Give me a hex colour, like #7C3AED.');
const r = parseInt(hex.substr(0, 2), 16);
const g = parseInt(hex.substr(2, 2), 16);
const b = parseInt(hex.substr(4, 2), 16);
const mix = function (v, target, amount) { return Math.round(v + (target - v) * amount); };
const toHex = function (rr, gg, bb) {
  return '#' + [rr, gg, bb].map(function (v) { return v.toString(16).padStart(2, '0'); }).join('').toUpperCase();
};
const tints = [];
const shades = [];
for (const step of [0.15, 0.3, 0.45, 0.6, 0.75]) {
  tints.push('  ' + Math.round(step * 100) + '% white  ' + toHex(mix(r, 255, step), mix(g, 255, step), mix(b, 255, step)));
  shades.push('  ' + Math.round(step * 100) + '% black  ' + toHex(mix(r, 0, step), mix(g, 0, step), mix(b, 0, step)));
}
return mzazireply('🎨 *Scales for #' + hex.toUpperCase() + '*\\n\\nLighter tints\\n' + tints.join('\\n') + '\\n\\nDarker shades\\n' + shades.join('\\n'));`,
  },
  {
    name: 'colorblend',
    aliases: ['blendcolor', 'mixcolor'],
    description: 'Mix two colours together by a percentage',
    category: 'Codes',
    usage: '.colorblend #7C3AED | #2563EB | 30',
    code: `const raw = (Array.isArray(args) ? args.join(' ') : '').trim();
const tokens = raw.split(/[^#0-9a-fA-F]+/).filter(function (v) { return v.length; });
if (tokens.length < 2) return mzazireply('Usage: ' + prefix + 'colorblend #7C3AED | #2563EB | 30');
const read = function (token) {
  let hex = token.replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return [parseInt(hex.substr(0, 2), 16), parseInt(hex.substr(2, 2), 16), parseInt(hex.substr(4, 2), 16)];
};
const A = read(tokens[0]);
const B = read(tokens[1]);
if (!A || !B) return mzazireply('❌ Both values must be hex colours.');
let pct = 50;
if (tokens.length > 2) pct = parseInt(tokens[2], 10);
if (isNaN(pct) || pct < 0 || pct > 100) return mzazireply('❌ The percentage must be between 0 and 100 (default 50).');
const amt = pct / 100;
const out = [0, 1, 2].map(function (i) { return Math.round(A[i] + (B[i] - A[i]) * amt); });
const hex = out.map(function (v) { return v.toString(16).padStart(2, '0'); }).join('').toUpperCase();
return mzazireply('🎨 #' + hex + '\\n\\nrgb(' + out.join(', ') + ')\\n\\n(' + pct + '% of the second colour mixed into the first)');`,
  },
  {
    name: 'hexalpha',
    aliases: ['rgbahex', 'hexwithalpha'],
    description: 'Turn a hex colour into an 8-digit hex and an rgba() value',
    category: 'Codes',
    usage: '.hexalpha #7C3AED 40',
    code: `const raw = (Array.isArray(args) ? args.join(' ') : '').trim();
const tokens = raw.split(/\\s+/).filter(function (v) { return v.length; });
if (!tokens.length) return mzazireply('Usage: ' + prefix + 'hexalpha #7C3AED 40');
let hex = tokens[0].replace(/^#/, '');
if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
if (!/^[0-9a-fA-F]{6}$/.test(hex)) return mzazireply('❌ Give me a hex colour first, like #7C3AED.');
let pct = 100;
if (tokens.length > 1) pct = parseInt(tokens[1], 10);
if (isNaN(pct) || pct < 0 || pct > 100) return mzazireply('❌ The alpha must be a percentage from 0 to 100.');
const alpha = Math.round((pct / 100) * 255);
const r = parseInt(hex.substr(0, 2), 16);
const g = parseInt(hex.substr(2, 2), 16);
const b = parseInt(hex.substr(4, 2), 16);
return mzazireply('🎨 #' + hex.toUpperCase() + alpha.toString(16).padStart(2, '0').toUpperCase() + '\\n\\nrgba(' + r + ', ' + g + ', ' + b + ', ' + (pct / 100).toFixed(2) + ')');`,
  },

  // ── Checksums and identifiers ────────────────────────────────────────────
  {
    name: 'luhncheck',
    aliases: ['luhnvalidate', 'checkluhn'],
    description: 'Check any number with the Luhn check digit (cards, IMEI, IDs)',
    category: 'Codes',
    usage: '.luhncheck <number>',
    code: `const digits = (Array.isArray(args) ? args.join('') : '').replace(/[^0-9]/g, '');
if (digits.length < 2) return mzazireply('Usage: ' + prefix + 'luhncheck <number>');
if (digits.length > 40) return mzazireply('❌ That is longer than any number I expect to check.');
let sum = 0;
let double = false;
for (let i = digits.length - 1; i >= 0; i--) {
  let d = digits.charCodeAt(i) - 48;
  if (double) { d = d * 2; if (d > 9) d -= 9; }
  sum += d;
  double = !double;
}
const valid = sum % 10 === 0;
let out = valid ? '✅ Valid — the Luhn check adds up.' : '❌ Invalid — the Luhn check does not add up.';
if (!valid) {
  const missing = (10 - (sum % 10)) % 10;
  out += '\\n\\nIf the last digit were ' + missing + ' instead of ' + digits.charAt(digits.length - 1) + ', it would pass.';
}
return mzazireply('🔢 ' + digits + '\\n\\n' + out + '\\n\\n(' + digits.length + ' digits)');`,
  },
  {
    name: 'isbncheck',
    aliases: ['isbnvalidate', 'isbn'],
    description: 'Validate an ISBN-10 or ISBN-13, or work out its check digit',
    category: 'Codes',
    usage: '.isbncheck <9, 10, 12 or 13 digits>',
    code: `const cleaned = (Array.isArray(args) ? args.join('') : '').toUpperCase().replace(/[^0-9X]/g, '');
if (!cleaned) return mzazireply('Usage: ' + prefix + 'isbncheck <9, 10, 12 or 13 digits>');
if (cleaned.length === 9) {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * (cleaned.charCodeAt(i) - 48);
  const rem = (11 - (sum % 11)) % 11;
  const check = rem === 10 ? 'X' : String(rem);
  return mzazireply('📚 ISBN-10 check digit: ' + check + '\\n\\nFull ISBN-10: ' + cleaned + check);
}
if (cleaned.length === 10) {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = cleaned.charAt(i);
    const v = ch === 'X' ? 10 : ch.charCodeAt(0) - 48;
    sum += (10 - i) * v;
  }
  if (sum % 11 === 0) return mzazireply('✅ ' + cleaned + ' is a valid ISBN-10.');
  return mzazireply('❌ ' + cleaned + ' is NOT a valid ISBN-10 — the check sum is ' + sum + ', which is not a multiple of 11.');
}
if (cleaned.length === 12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (cleaned.charCodeAt(i) - 48) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return mzazireply('📚 ISBN-13 check digit: ' + check + '\\n\\nFull ISBN-13: ' + cleaned + check);
}
if (cleaned.length === 13) {
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += (cleaned.charCodeAt(i) - 48) * (i % 2 === 0 ? 1 : 3);
  if (sum % 10 === 0) return mzazireply('✅ ' + cleaned + ' is a valid ISBN-13.');
  return mzazireply('❌ ' + cleaned + ' is NOT a valid ISBN-13 — the check sum is ' + sum + ', which is not a multiple of 10.');
}
return mzazireply('❌ An ISBN is 10 or 13 digits, and I counted ' + cleaned.length + '.\\n\\nGive me 9 or 12 digits and I will work out the check digit.');`,
  },
  {
    name: 'ibancheck',
    aliases: ['ibanvalidate', 'iban'],
    description: 'Validate an IBAN with the mod-97 check',
    category: 'Codes',
    usage: '.ibancheck <iban>',
    code: `const raw = (Array.isArray(args) ? args.join('') : '').toUpperCase().replace(/[^A-Z0-9]/g, '');
if (raw.length < 5) return mzazireply('Usage: ' + prefix + 'ibancheck <iban>');
if (raw.length > 34) return mzazireply('❌ An IBAN is at most 34 characters — I counted ' + raw.length + '.');
if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(raw)) return mzazireply('❌ An IBAN starts with a two-letter country code and two check digits.');
let digits = '';
for (const c of raw.substr(4) + raw.substr(0, 4)) {
  const code = c.charCodeAt(0);
  if (code >= 48 && code <= 57) digits += c;
  else digits += String(code - 55);
}
let rem = 0;
for (let i = 0; i < digits.length; i += 7) {
  rem = parseInt(String(rem) + digits.substr(i, 7), 10) % 97;
}
const country = raw.substr(0, 2);
if (rem === 1) return mzazireply('✅ Valid IBAN\\n\\nCountry: ' + country + '\\nCheck digits: ' + raw.substr(2, 2) + '\\nLength: ' + raw.length + ' characters');
return mzazireply('❌ NOT a valid IBAN — the mod-97 check came out at ' + rem + ' instead of 1.\\n\\nCountry: ' + country + '\\nLength: ' + raw.length + ' characters');`,
  },
  {
    name: 'ean13',
    aliases: ['makeean13', 'generateean'],
    description: 'Validate an EAN-13 barcode, or work out its 13th digit',
    category: 'Codes',
    usage: '.ean13 <12 or 13 digits>',
    code: `const digits = (Array.isArray(args) ? args.join('') : '').replace(/[^0-9]/g, '');
if (!digits) return mzazireply('Usage: ' + prefix + 'ean13 <12 or 13 digits>');
if (digits.length !== 12 && digits.length !== 13) {
  return mzazireply('❌ An EAN-13 is 12 digits plus a check digit — I counted ' + digits.length + '.');
}
let sum = 0;
for (let i = 0; i < 12; i++) sum += (digits.charCodeAt(i) - 48) * (i % 2 === 0 ? 1 : 3);
const check = (10 - (sum % 10)) % 10;
if (digits.length === 12) {
  return mzazireply('📦 EAN-13 check digit: ' + check + '\\n\\nFull barcode: ' + digits + check);
}
const given = digits.charAt(12);
if (Number(given) === check) return mzazireply('✅ ' + digits + ' is a valid EAN-13.');
return mzazireply('❌ ' + digits + ' is NOT valid — the last digit should be ' + check + ', not ' + given + '.');`,
  },
  {
    name: 'phoneformat',
    aliases: ['normalizephone', 'phoneke'],
    description: 'Normalise a Kenyan phone number to international format',
    category: 'Codes',
    usage: '.phoneformat 0712345678',
    code: `const raw = (Array.isArray(args) ? args.join('') : '').trim();
const digits = raw.replace(/[^0-9]/g, '');
if (!digits) return mzazireply('Usage: ' + prefix + 'phoneformat 0712345678');
let n = digits;
if (n.indexOf('254') === 0) n = n;
else if (n.charAt(0) === '0') n = '254' + n.slice(1);
else if (n.length === 9) n = '254' + n;
else if (n.indexOf('254') !== -1) n = n.substr(n.indexOf('254'));
const looksKenyan = n.length === 12 && n.indexOf('254') === 0;
const mobile = looksKenyan && (n.charAt(3) === '7' || n.charAt(3) === '1');
let out = '📱 *' + raw + '*\\n\\nInternational: +' + n + '\\nLocal: 0' + n.slice(3);
out += '\\n\\n' + (mobile ? '✅ Looks like a valid Kenyan mobile number.' : '⚠️ Not a standard Kenyan mobile format — check the digits and the length.');
if (n.length !== 12) out += '\\n(Expected 12 digits after normalising, found ' + n.length + '.)';
return mzazireply(out);`,
  },
];
