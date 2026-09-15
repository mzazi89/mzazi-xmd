#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Functional test for the MZAZI XMD command pack.
//
// scripts/seed-commands.js proves every body COMPILES. This proves a body
// actually COMPUTES the right answer, which is a different claim: a body can
// compile perfectly while working entirely on the wrong data (the classic being
// /\s+/ losing its backslash and matching the letter s instead).
//
// Every expected value below was derived independently of the code under test —
// base32, base58, IBAN check digits, ISBN checks, subnet maths, the WCAG
// contrast ratio and the randomness generators' invariants were all recomputed
// with Python's standard library or from first principles, not read out of the
// command being tested.
//
// Nothing here touches the network or the WhatsApp socket. Commands that need
// either are exercised only on their argument-validation and error paths, which
// is deliberate: a dead host has to produce a sentence, not a stack trace.
//
// Usage: node scripts/test-commands.js   (or: npm run test:commands)
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const PARTS = path.join(__dirname, 'commands');

function loadPack() {
  const all = [];
  for (const file of fs.readdirSync(PARTS).filter((f) => f.endsWith('.js')).sort()) {
    const mod = require(path.join(PARTS, file));
    for (const cmd of mod) all.push({ ...cmd, __file: file });
  }
  return all;
}

const PACK = loadPack();
const byName = new Map();
for (const c of PACK) {
  if (!byName.has(c.name)) byName.set(c.name, c);
  for (const a of c.aliases || []) if (!byName.has(a)) byName.set(a, c);
}

/** Run one command the way the runtime does and capture what it would send. */
async function run(name, argText) {
  const cmd = byName.get(name);
  if (!cmd) throw new Error(`unknown command "${name}"`);

  const sent = [];
  const ctx = {
    // The real context is far larger; these are the values these commands touch.
    mzazireply: async (t) => { sent.push(String(t)); return t; },
    reply: async (t) => { sent.push(String(t)); return t; },
    args: String(argText).length ? String(argText).split(/ +/) : [],
    prefix: '.',
    command: name,
    text: String(argText),
    body: '.' + name + ' ' + argText,
    isOwner: false,
    isAdmin: false,
    isGroup: false,
    isBotAdmin: false,
    isGroupOwner: false,
    sender: '254700000000@s.whatsapp.net',
    senderNumber: '254700000000',
    botName: 'MZAZI XMD',
    botPhoneNum: '254700000000',
    logger: { error() {}, info() {}, warn() {}, debug() {} },
    logSystem() {},
    m: {},
    mzazi: { sendMessage: async () => {} },
    formatBytes: (n) => n + ' B',
    // The runtime injects these by name; `new Function` cannot see module-locals.
    require: require,
    module: { exports: {} },
    __dirname: __dirname,
    __filename: __filename,
    // Network and media are disabled: anything that reaches out fails loudly
    // rather than silently passing, so offline runs stay honest.
    axios: {
      get: async () => { throw new Error('network disabled in tests'); },
      head: async () => { throw new Error('network disabled in tests'); },
    },
    downloadMediaMessage: async () => { throw new Error('no media in tests'); },
    crypto: require('crypto'),
  };

  const keys = Object.keys(ctx);
  // Same construction the runtime uses, so a body is exercised under the same
  // parameter names it will see in production.
  // eslint-disable-next-line no-new-func
  const fn = new Function(...keys, `return (async () => {\n${cmd.code}\n})()`);
  await fn(...keys.map((k) => ctx[k]));
  return sent.join('\n');
}

const results = [];
function check(name, argText, label, expect, fn, note) {
  results.push({ name, argText, label, expect, fn, note });
}

// ── Cases ────────────────────────────────────────────────────────────────────
// Encodings, with values recomputed in Python.
check('base32', 'hello', 'contains', 'NBSWY3DP');
check('unbase32', 'NBSWY3DP', 'contains', 'hello');
check('base58', 'hello', 'exact', 'Cn8eVZg');
check('unbase58', 'Cn8eVZg', 'contains', 'hello');
check('hex2bin', 'ff', 'contains', '11111111');
check('bin2hex', '11111111', 'contains', 'ff');
check('htmlencode', '<a href="x">&', 'contains', '&lt;a href=&quot;x&quot;&gt;&amp;');
check('atbash', 'abc', 'contains', 'zyx');
check('bacon', 'AB', 'contains', 'AAAAA AAAAB');
check('unbacon', 'AAAAA AAAAB', 'contains', 'AB');
check('vigenere', 'KEY | HELLO', 'contains', 'RIJVS');
check('unvigenere', 'KEY | RIJVS', 'contains', 'HELLO');
check('unicodeescape', 'é', 'contains', 'u00e9');
check('charcodes', 'AB', 'contains', '65 66');
check('asciilookup', '65', 'contains', 'A');
check('railfence', '3 hello world', 'hasLength', null); // spaces removed, 10 letters
check('nato', 'abc', 'contains', 'Alfa Bravo Charlie');

// Ciphers that must be their own inverse.
check('xortext', 'k | secret', 'roundtripXor', 'k | secret');

// Checksums — canonical published examples.
check('luhncheck', '4111111111111111', 'contains', 'Valid');
check('luhncheck', '4111111111111112', 'contains', 'Invalid');
check('isbncheck', '030640615', 'contains', 'check digit: 2');
check('isbncheck', '0306406152', 'contains', 'valid ISBN-10');
check('isbncheck', '9780306406157', 'contains', 'valid ISBN-13');
check('ibancheck', 'GB82WEST12345698765432', 'contains', 'Valid IBAN');
check('ibancheck', 'GB83WEST12345698765432', 'contains', 'NOT a valid IBAN');
check('ean13', '590123412345', 'contains', 'check digit: 7');
check('ean13', '5901234123457', 'contains', 'valid EAN-13');
check('phoneformat', '0712345678', 'contains', '+254712345678');

// Colour maths, recomputed in Python.
check('hex2rgb', '#7C3AED', 'contains', 'rgb(124, 58, 237)');
check('rgb2hex', '124, 58, 237', 'contains', '#7C3AED');
check('hex2hsl', '#7C3AED', 'contains', 'hsl(262, 83%, 58%)');
// hsl(262, 83%, 58%) is exactly rgb(124, 59, 237) — the #7C3AED it came from
// rounds to those percentages, so the round trip lands one step off in green.
// Expected value recomputed by hand from the HSL->RGB formula, not from the code.
check('hsl2hex', '262, 83%, 58%', 'contains', '#7C3BED');
check('contrastcheck', '#FFFFFF | #000000', 'contains', '21.00:1');
check('contrastcheck', '#FFFFFF | #A16207', 'contains', '4.92:1');
check('contrastcheck', '#1A1A28 | #9A9CB6', 'contains', '6.39:1');
check('colorblend', '#7C3AED | #2563EB | 30', 'contains', '#6246EC');
check('colortints', '#7C3AED', 'contains', '15% white  #9058F0');
// 58 * 0.25 = 14.5 — JS rounds halves up (15, so 0F); Python rounds halves to
// even (14, so 0E). The JS answer is the one the command should produce.
check('colortints', '#7C3AED', 'contains', '75% black  #1F0F3B');
check('hexalpha', '#7C3AED 40', 'contains', '#7C3AED66');
check('hexalpha', '#7C3AED 40', 'contains', 'rgba(124, 58, 237, 0.40)');

// Text maths, recomputed in Python.
check('levenshtein', 'kitten | sitting', 'contains', 'Edit distance: 3');
check('similarity', 'kitten | sitting', 'contains', 'Similarity: 57%');
check('palindrome', 'Never odd or even', 'contains', 'is a palindrome');
check('palindrome', 'hello', 'contains', 'No —');
check('stripaccents', 'café naïve', 'contains', 'cafe naive');
check('striphtml', '<b>bold</b> &amp; text', 'contains', 'bold & text');
check('squeeze', 'a   b', 'contains', 'a b');
check('camelcase', 'hello big world', 'contains', 'helloBigWorld');
check('snakecase', 'Hello Big World', 'contains', 'hello_big_world');
check('kebabcase', 'Hello Big World', 'contains', 'hello-big-world');
check('constantcase', 'hello big world', 'contains', 'HELLO_BIG_WORLD');
check('removevowels', 'MZAZI TECH', 'contains', 'MZZ TCH');
check('acronym', 'as soon as possible', 'contains', 'ASAP');
check('initials', 'John Mwangi Doe', 'contains', 'JMD');
check('sortwords', 'banana apple cherry', 'contains', 'apple banana cherry');
check('longestword', 'a bb ccc', 'contains', 'ccc (3)');
check('truncate', '3 abcdef', 'contains', 'abc');
check('repeat', '3 ab', 'contains', 'ab\nab\nab');
check('bulletlist', 'one two', 'contains', '• one two');
check('numberedlist', 'one two', 'contains', '1. one two');
// Multi-line input: the runtime splits on spaces only, so newlines survive
// inside a token and these commands receive them intact.
check('uniquelines', 'a\nb\na', 'contains', 'Removed 1 duplicate');
check('dedent', '\n    a\n    b', 'contains', 'a\nb');
check('blockquote', 'line', 'contains', '> line');
check('textbox', 'hi', 'contains', '┌────┐');
check('redact', 'mail me at a@b.com', 'contains', '[email hidden]');
check('piglatin', 'hello', 'contains', 'ellohay');
check('spacedletters', 'abc', 'contains', 'a b c');
check('dotsep', 'abc', 'contains', 'a·b·c');
check('clap', 'a b', 'contains', 'a 👏 b');
check('circledtext', 'ab', 'contains', 'ⓐⓑ');
check('superscript', '12', 'contains', '¹²');
check('vaporwave', 'AB', 'contains', 'ＡＢ');
check('strikethrough', 'hi', 'contains', 'h\u0336');
check('wrap', '10 aa bb cc dd', 'contains', 'aa bb cc');
check('separator', '5 -', 'contains', '-----');
check('padtext', '5 ab', 'contains', '|ab   |');
check('centertext', 'a\nbbb', 'contains', '| a');
check('alignright', 'a\nbbb', 'contains', '|a');
check('indent', '2 ab', 'contains', '|  ab');
check('charfreq', 'aab', 'contains', '"a"  ×2');
check('wordfreq', 'go go stop', 'contains', 'go — 2');
check('charmap', 'A', 'contains', 'U+0041');

// The last few encodings, and the ones whose answer is a round trip rather than
// a fixed string.
check('braille', 'hello', 'contains', '⠓⠑⠇⠇⠕');
check('unicodeunescape', '\\u00e9', 'contains', 'é');
check('htmldecode', '&lt;b&gt; &amp; x', 'contains', '<b> & x');
check('hexdump', 'AB', 'contains', '0000  41 42');
check('hexdump', 'AB', 'contains', '|AB');
// gzip output carries an OS byte and a timestamp, so the base64 is not stable
// between implementations. The claim worth testing is that it round trips.
check('gziptext', 'the quick brown fox', 'roundtripGzip', null);
check('ungziptext', 'not base64 at all!', 'contains', 'not gzipped base64');
check('jwtdecode', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c', 'contains', '"name": "John Doe"');
check('jwtdecode', 'not-a-token', 'contains', 'A JWT has three dot-separated parts');
// Luminance and the ratio against white were recomputed from the WCAG formula
// in Python, not read out of the command.
check('colorinfo', '#7C3AED', 'contains', 'rgb(124, 58, 237)');
check('colorinfo', '#7C3AED', 'contains', 'against white: 5.70:1');

// ── Part 7: generators ───────────────────────────────────────────────────────
// Nothing below is checked against network access. Every case is either
// argument validation or an invariant that must hold for any random draw.
check('dndroll', '3d6+2', 'custom', null, (out) => {
  if (!out.includes('*3d6+2*')) return false;
  const rolls = out.match(/Rolls: ([^\n]+)/);
  if (!rolls) return false;
  const vals = rolls[1].split(',').map((s) => Number(s.trim()));
  if (vals.length !== 3 || !vals.every((v) => v >= 1 && v <= 6)) return false;
  const total = Number((out.match(/Total: (-?\d+)/) || [])[1]);
  return total === vals.reduce((a, b) => a + b, 0) + 2;
}, 'three d6 plus 2, and the total agrees with the individual rolls');
check('dndroll', '1d20', 'contains', '*1d20*');
check('dndroll', '0d6', 'contains', 'between 1 and 50 dice');
check('dndroll', '3d1', 'contains', 'between 2 and 1000 sides');
check('dndroll', 'abc', 'contains', 'Usage:');
check('lottery', '', 'custom', null, (out) => {
  const m = out.match(/(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
  if (!m) return false;
  const nums = m.slice(1).map(Number);
  return new Set(nums).size === 6 && nums.every((n) => n >= 1 && n <= 49);
}, 'six unique numbers between 1 and 49');
check('lucky', '', 'contains', 'lucky number for');
check('yesno', '', 'contains', 'Usage:');
check('yesno', 'should I ship today', 'contains', 'should I ship today');
check('eightball', 'will it work', 'contains', 'You asked: will it work');
check('spin', 'a, b, c', 'contains', 'Picked from 3 options');
check('spin', 'justone', 'contains', 'at least two');
check('teams', '2 a, b, c, d', 'contains', 'Team 1:');
check('teams', '2 a, b, c, d', 'contains', 'Team 2:');
check('teams', '5 a, b', 'contains', 'need at least 5 names');
check('teams', '11 a, b', 'contains', 'Between 2 and 10 teams');
check('pairup', 'a, b, c', 'contains', 'is on their own');
check('bingocard', '', 'contains', 'B   I   N   G   O');
check('bingocard', '', 'contains', 'FREE');
// The day count is recomputed here from the calendar rather than hardcoded, so
// this check does not rot as the date moves on.
check('countdown', '2026-12-25', 'custom', null, (out) => {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((Date.parse('2026-12-25T00:00:00Z') - today) / 86400000);
  return out.includes('*' + days + '* day(s) until 2026-12-25 (Friday)');
}, 'day count recomputed from the calendar');
check('countdown', '2020-01-01', 'contains', 'ago (Wednesday)');
check('countdown', 'the day after tomorrow', 'contains', 'Use YYYY-MM-DD');
check('serialkey', '3', 'custom', null, (out) => {
  const first = out.split('\n')[0].trim();
  return /^🔑 [A-Z0-9]{5}(-[A-Z0-9]{5}){2}$/.test(first);
}, 'exactly the three requested groups, five characters each');
check('serialkey', '0', 'contains', 'Between 1 and 10 groups');
check('randomstring', '8 hex', 'custom', null, (out) => /^🎲 [0-9a-f]{8}$/.test(out.split('\n')[0].trim()), 'eight hex characters and nothing else');
check('randomstring', '200', 'contains', 'between 1 and 128');
check('randomhex', '5', 'custom', null, (out) => {
  // The first item shares its line with the 🎨 header.
  const ls = out.replace('🎨 ', '').split('\n').map((l) => l.trim()).filter(Boolean);
  return ls.length === 5 && ls.every((l) => /^#[0-9A-F]{6}$/.test(l));
}, 'five colours, one per line, all #RRGGBB');
check('randomhex', '21', 'contains', 'Between 1 and 20 colours');
check('randomip', '3', 'custom', null, (out) => {
  const ls = out.replace('🌐 ', '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3);
  return ls.length === 3 && ls.every((l) => {
    const o = l.split('.').map(Number);
    return o.length === 4 && o.every((n) => n >= 0 && n <= 255) && [10, 127, 172, 192].indexOf(o[0]) === -1;
  });
}, 'three addresses, none in a private or loopback block');
check('randommac', '', 'custom', null, (out) => /^🔌 ([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(out.split('\n')[0].trim()), 'six colon-separated hex bytes');
check('randomdate', '2020 2021', 'custom', null, (out) => /^📅 202[01]-\d{2}-\d{2}$/.test(out.split('\n')[0].trim()), 'a date inside the requested year range');
check('randomdate', '1800 1900', 'contains', 'between 1900 and 2200');
// Entropy is length x log2(pool), recomputed by hand for each input.
check('passstrength', 'abc', 'contains', '14 bits — very weak');
check('passstrength', 'Tr0ub4dor&3', 'contains', '72 bits — reasonable');
check('passstrength', 'correct-horse-battery-staple-42', 'contains', '189 bits — very strong');
check('passstrength', 'correct-horse-battery-staple-42', 'contains', 'You just sent this password through WhatsApp');
check('passphrase', '5', 'custom', null, (out) => {
  const first = out.split('\n')[0].trim().replace(/^🔑 /, '');
  const tokens = first.split('-');
  return tokens.length === 6 && /^\d{2}$/.test(tokens[5]);
}, 'five words plus a two-digit number');
check('passphrase', '2', 'contains', 'between 3 and 8 words');
check('username', '3', 'custom', null, (out) => {
  const ls = out.replace('👤 ', '').split('\n').map((l) => l.trim()).filter(Boolean);
  return ls.length === 3 && ls.every((l) => /^[a-z]+_[a-z]+\d{3}$/.test(l));
}, 'three adjective_animal### names');
check('gradient', '#7C3AED', 'contains', '#7C3AED');
check('gradient', 'nothex', 'matches', /🌈 linear-gradient\(\d+deg, #[0-9A-F]{6} 0%, #[0-9A-F]{6} \d+%\)/);
check('colorscheme', '#7C3AED', 'contains', 'Brand     #7C3AED');
check('colorscheme', '#7C3AED', 'contains', 'Complement');
check('storyprompt', 'rapid urban growth', 'contains', 'Write about:* rapid urban growth');
check('emoji', '5', 'custom', null, (out) => out.replace('🎲 ', '').trim().split(' ').length === 5, 'five emoji');
check('motivation', '', 'custom', null, (out) => out.startsWith('🌱 ') && out.includes('I do not invent authors'), 'a line, and the note about attribution');
// Length is not a safe assertion here — the shortest prompt in the pool is 35
// characters. Every entry is a question, so check that instead.
check('icebreaker', '', 'custom', null, (out) => out.startsWith('💬 ') && out.trim().endsWith('?'), 'a question, and nothing but');
check('affirmation', '', 'custom', null, (out) => out.startsWith('💙 ') && out.length > 20, 'a line');
check('dadjoke', '', 'custom', null, (out) => out.startsWith('😄 ') && out.length > 20, 'a joke');

// ── Part 8: network, links, documents ────────────────────────────────────────
// There is no network in this harness, so the cases below are argument
// validation and pure arithmetic. pingurl is asserted on its catch path, which
// is itself the behaviour under test: a dead host must produce a sentence, not
// a stack trace.
check('ip2long', '192.168.1.1', 'contains', 'Decimal: 3232235777');
check('ip2long', '192.168.1.1', 'contains', 'Hex: 0xC0A80101');
check('ip2long', '192.168.1.1', 'contains', '11000000101010000000000100000001');
check('ip2long', '1.2.3', 'contains', 'four parts');
check('ip2long', '1.2.3.300', 'contains', '0 to 255');
check('long2ip', '3232235777', 'contains', '192.168.1.1');
check('long2ip', '4294967296', 'contains', 'between 0 and 4294967295');
check('isprivateip', '192.168.1.1', 'contains', '192.168.0.0/16 — private (RFC 1918)');
check('isprivateip', '127.0.0.1', 'contains', 'loopback');
check('isprivateip', '8.8.8.8', 'contains', 'ordinary public address');
check('isprivateip', '999.1.1.1', 'contains', 'IPv4 address');
// Network, mask, broadcast and host count recomputed with Python's ipaddress.
check('subnet', '192.168.1.10/24', 'contains', 'Network:   192.168.1.0');
check('subnet', '192.168.1.10/24', 'contains', 'Mask:      255.255.255.0');
check('subnet', '192.168.1.10/24', 'contains', 'Broadcast: 192.168.1.255');
check('subnet', '192.168.1.10/24', 'contains', 'Usable for hosts: 254');
check('subnet', '10.0.0.5/30', 'contains', 'Network:   10.0.0.4');
check('subnet', '10.0.0.5/30', 'contains', 'Usable for hosts: 2');
check('subnet', '172.16.5.9/26', 'contains', 'Mask:      255.255.255.192');
check('subnet', '172.16.5.9/26', 'contains', 'Usable for hosts: 62');
check('subnet', '192.168.1.10', 'contains', 'Include the prefix length');
check('subnet', '192.168.1.300/24', 'contains', '0 to 255');
check('subnet', '192.168.1.10/33', 'contains', 'between 0 and 32');
check('reverseip', 'notanip', 'contains', 'IPv4 address');
check('dnslookup', '', 'contains', 'Usage:');
check('dnslookup', 'example.com weird', 'contains', 'Choose one of');
check('portcheck', 'example.com 99999', 'contains', 'between 1 and 65535');
check('portcheck', '', 'contains', 'Usage:');
check('sslinfo', '', 'contains', 'Usage:');
check('pingurl', 'example.com', 'contains', 'Include the scheme');
check('httpheaders', 'example.com', 'contains', 'Include the scheme');
check('robots', 'http://[bad', 'contains', 'could not read that as a web address');

check('urlparse', 'https://user@mzazi.shop/a/b?x=1&y=2#top', 'contains', 'host:     mzazi.shop');
check('urlparse', 'https://user@mzazi.shop/a/b?x=1&y=2#top', 'contains', '2 parameter(s): x=1, y=2');
check('urlparse', 'https://user@mzazi.shop/a/b?x=1&y=2#top', 'contains', 'a credential in the URL');
check('urlparse', 'not a url', 'contains', 'not a URL I can read');
check('urlparams', 'https://a.com/?x=1&y=', 'contains', 'y = (empty)');
check('urlparams', 'https://a.com/', 'contains', 'no query parameters');
// The link itself must lose the tracking keys, though the note below it names
// them on purpose — so assert on the link line, not on the whole message.
check('cleanurl', 'https://shop.example/item?utm_source=fb&fbclid=abc&id=7', 'custom', null, (out) => {
  const link = out.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('http'))[0];
  return link === 'https://shop.example/item?id=7' && out.includes('Removed: utm_source, fbclid');
}, 'tracking stripped, the real parameter kept');
check('cleanurl', 'https://shop.example/item?id=7', 'contains', 'Nothing to strip');
check('urlbuild', 'https://a.com/?x=1 | y=2', 'contains', 'added y');
check('urlbuild', 'https://a.com/?x=1 | x=9', 'contains', 'updated x');
check('urlbuild', 'https://a.com/', 'contains', 'Usage:');
check('urlbuild', 'https://a.com/ | justakey', 'contains', 'key=value');
check('urlsame', 'https://www.Example.com/p?utm_source=x#frag | https://example.com/p', 'contains', 'Same page');
check('urlsame', 'https://example.com/a | https://example.com/b', 'contains', 'Different pages');
// urljoin('https://example.com/blog/post', '../about') in Python gives the same
// answer this must produce.
check('urlresolve', 'https://example.com/blog/post | ../about', 'contains', 'https://example.com/about');

// No media in the harness, so these must reach their "send me a document"
// branch rather than throwing on an undefined message.
check('doccount', '', 'contains', 'Send a *text document*');
check('docfind', '', 'contains', 'Send a *text document*');
check('dochead', '', 'contains', 'Send a *text document*');
check('fileb64', '', 'contains', 'Send a *file*');

// ── Runner ───────────────────────────────────────────────────────────────────
async function main() {
  let pass = 0;
  const failures = [];

  for (const t of results) {
    let out = '';
    let err = null;
    try {
      out = await run(t.name, t.argText);
    } catch (e) {
      err = e;
    }

    if (err) {
      failures.push({ ...t, out: 'THREW: ' + err.message });
      continue;
    }
    if (t.label === 'roundtripXor') {
      // XOR twice with the same key must return the original text.
      const first = out.split('\n')[0].trim();
      const key = t.expect.split('|')[0].trim();
      const back = await run('unxortext', key + ' | ' + first);
      if (back.includes(t.expect.split('| ')[1])) pass++;
      else failures.push({ ...t, out: first + ' → ' + back });
      continue;
    }
    if (t.label === 'roundtripGzip') {
      // The base64 is not stable across implementations; the round trip is.
      const b64 = out.split('\n\n')[0].trim();
      const back = await run('ungziptext', b64);
      if (back.includes('the quick brown fox')) pass++;
      else failures.push({ ...t, out: b64 + ' → ' + back });
      continue;
    }
    if (t.label === 'hasLength') {
      const letters = out.split('\n')[0].trim();
      if (letters.length === 10) pass++;
      else failures.push({ ...t, out: letters });
      continue;
    }
    if (t.label === 'matches') {
      if (t.expect.test(out)) pass++;
      else failures.push({ ...t, expect: String(t.expect), out });
      continue;
    }
    if (t.label === 'custom') {
      if (t.fn(out)) pass++;
      else failures.push({ ...t, expect: t.note || 'custom predicate', out });
      continue;
    }
    if (t.label === 'exact') {
      if (out.trim() === t.expect) pass++;
      else failures.push({ ...t, out });
      continue;
    }
    // 'contains' — for the multi-line cases the newline escapes are compared literally
    const wanted = t.expect.replace(/\\n/g, '\n');
    if (out.includes(wanted)) pass++;
    else failures.push({ ...t, out });
  }

  console.log(`Ran ${results.length} checks against ${PACK.length} commands.\n`);
  if (failures.length === 0) {
    console.log(`✅ All ${pass} checks passed.`);
    return;
  }
  console.log(`❌ ${failures.length} failed, ${pass} passed.\n`);
  for (const f of failures) {
    console.log(`  ${f.name} "${f.argText}"`);
    console.log(`    expected to contain: ${JSON.stringify(f.expect)}`);
    console.log(`    got:                 ${JSON.stringify(f.out.slice(0, 220))}\n`);
  }
  process.exitCode = 1;
}

main().catch((e) => {
  console.error('Harness failed:', e.message);
  process.exitCode = 1;
});
