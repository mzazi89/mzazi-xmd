// ─────────────────────────────────────────────────────────────────────────────
// MZAZI XMD — command pack, part 7 of 8: GENERATORS
//
// Part 1 had the small stuff: coin, dice, PIN, password, UUID, random colour.
// This part is the rest of the workshop — dice notation for tabletop play,
// throwaway identifiers for testing, passphrase and strength tools, and the
// conversation starters a group actually uses.
//
// ── What is deliberately absent ──────────────────────────────────────────────
// No quotation is attributed to a named person. A generated pool of quotes
// with invented authors is a lie that gets forwarded, so the motivational
// command ships unattributed lines instead. Same reason there is no "fact of
// the day": anything factual would be made up.
//
// Everything here is seeded by Math.random(). That is fine for a dice roll, a
// test key or a conversation starter, and it is NOT fine for anything a person
// could later rely on — so the identifier-style commands say so in their own
// output.
//
// Backslashes are doubled throughout: see the note at the top of part 6.
// ─────────────────────────────────────────────────────────────────────────────

module.exports = [
  // ── Dice and chance ──────────────────────────────────────────────────────
  {
    name: 'dndroll',
    aliases: ['diceroll', 'rollnotation'],
    description: 'Roll dice in NdM+K notation, like 3d6+2',
    category: 'Generators',
    usage: '.dndroll 3d6+2',
    code: `const a = Array.isArray(args) ? args : [];
const spec = String(a[0] || '1d20').toLowerCase().replace(/\\s+/g, '');
const m = spec.match(/^([0-9]{1,3})d([0-9]{1,4})(?:([+-])([0-9]{1,4}))?$/);
if (!m) return mzazireply('Usage: ' + prefix + 'dndroll 3d6+2\\n\\n(count d sides, optional modifier)');
const count = parseInt(m[1], 10);
const sides = parseInt(m[2], 10);
if (count < 1 || count > 50) return mzazireply('❌ Roll between 1 and 50 dice.');
if (sides < 2 || sides > 1000) return mzazireply('❌ A die needs between 2 and 1000 sides.');
const rolls = [];
let total = 0;
for (let i = 0; i < count; i++) {
  const r = Math.floor(Math.random() * sides) + 1;
  rolls.push(r);
  total += r;
}
let mod = 0;
if (m[3]) mod = (m[3] === '-' ? -1 : 1) * parseInt(m[4], 10);
total += mod;
const label = count + 'd' + sides + (mod === 0 ? '' : mod > 0 ? '+' + mod : String(mod));
return mzazireply('🎲 *' + label + '*\\n\\n' + (count === 1 ? 'Rolled ' + rolls[0] : 'Rolls: ' + rolls.join(', ')) + '\\nTotal: ' + total + (count > 1 ? '\\nAverage: ' + (total / count).toFixed(1) : ''));`,
  },
  {
    name: 'lottery',
    aliases: ['lotto', 'drawnumbers'],
    description: 'Draw six unique numbers from 1 to 49',
    category: 'Generators',
    usage: '.lottery',
    code: `const pool = [];
for (let i = 1; i <= 49; i++) pool.push(i);
for (let i = pool.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  const tmp = pool[i];
  pool[i] = pool[j];
  pool[j] = tmp;
}
const draw = pool.slice(0, 6).sort(function (x, y) { return x - y; });
return mzazireply('🎟️ *Your numbers*\\n\\n' + draw.join('  ') + '\\n\\nSix unique numbers, 1 to 49.\\nPlay responsibly — every combination is equally likely.');`,
  },
  {
    name: 'lucky',
    aliases: ['luckynumber'],
    description: 'A lucky number for the day, 1 to 100',
    category: 'Generators',
    usage: '.lucky',
    code: `const n = Math.floor(Math.random() * 100) + 1;
const day = new Date().toISOString().slice(0, 10);
return mzazireply('🍀 Your lucky number for ' + day + ' is *' + n + '*');`,
  },
  {
    name: 'yesno',
    aliases: ['shouldi', 'decide'],
    description: 'Answer a question with a straight yes or no',
    category: 'Generators',
    usage: '.yesno <question>',
    code: `const q = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!q) return mzazireply('Usage: ' + prefix + 'yesno <question>');
const answers = ['Yes.', 'No.', 'Definitely yes.', 'Definitely not.', 'Go for it.', 'Not this time.', 'Ask again later.', 'That is a yes.', 'That is a no.', 'Only if you are sure.'];
const pick = answers[Math.floor(Math.random() * answers.length)];
return mzazireply('🎱 ' + pick + '\\n\\n' + q);`,
  },
  {
    name: 'eightball',
    aliases: ['magic8ball', 'ask8'],
    description: 'Ask the magic eight ball a question',
    category: 'Generators',
    usage: '.eightball <question>',
    code: `const q = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!q) return mzazireply('Usage: ' + prefix + 'eightball <question>');
const answers = [
  'It is certain.', 'Without a doubt.', 'Yes, definitely.', 'You may rely on it.',
  'Most likely.', 'Outlook good.', 'Signs point to yes.', 'Reply hazy, try again.',
  'Ask again later.', 'Better not tell you now.', 'Cannot predict right now.',
  'Do not count on it.', 'My reply is no.', 'Very doubtful.', 'Outlook not so good.'
];
const pick = answers[Math.floor(Math.random() * answers.length)];
return mzazireply('🎱 *' + pick + '*\\n\\nYou asked: ' + q + '\\n\\n(It is a plastic ball. Take it as a prompt, not a prophecy.)');`,
  },
  {
    name: 'spin',
    aliases: ['spinner', 'wheel'],
    description: 'Pick one name from a list as if spinning a wheel',
    category: 'Generators',
    usage: '.spin <name, name, name>',
    code: `const raw = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!raw) return mzazireply('Usage: ' + prefix + 'spin <name, name, name>');
const names = raw.split(/[,;]/).map(function (s) { return s.trim(); }).filter(Boolean);
if (names.length < 2) return mzazireply('❌ Separate the names with commas — I need at least two.');
if (names.length > 100) return mzazireply('❌ Keep it to 100 names.');
const pick = names[Math.floor(Math.random() * names.length)];
return mzazireply('🎯 *' + pick + '*\\n\\nPicked from ' + names.length + ' options:\\n' + names.join(' · '));`,
  },
  {
    name: 'teams',
    aliases: ['maketeams', 'teamup'],
    description: 'Split a list of names into random teams',
    category: 'Generators',
    usage: '.teams <count> <name, name, name>',
    code: `const a = Array.isArray(args) ? args : [];
let count = 2;
let rest = a.slice();
if (rest.length && /^[0-9]+$/.test(rest[0])) { count = parseInt(rest[0], 10); rest = rest.slice(1); }
const names = rest.join(' ').split(/[,;\\n]/).map(function (s) { return s.trim(); }).filter(Boolean);
if (names.length < 2) return mzazireply('Usage: ' + prefix + 'teams <count> <name, name, name>');
if (count < 2 || count > 10) return mzazireply('❌ Between 2 and 10 teams.');
if (count > names.length) return mzazireply('❌ ' + count + ' teams need at least ' + count + ' names.');
const shuffled = names.slice();
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  const tmp = shuffled[i];
  shuffled[i] = shuffled[j];
  shuffled[j] = tmp;
}
const groups = [];
for (let i = 0; i < count; i++) groups.push([]);
for (let i = 0; i < shuffled.length; i++) groups[i % count].push(shuffled[i]);
const lines = groups.map(function (g, i) { return 'Team ' + (i + 1) + ': ' + g.join(', '); });
return mzazireply('👥 *' + count + ' teams*\\n\\n' + lines.join('\\n'));`,
  },
  {
    name: 'pairup',
    aliases: ['makepairs', 'pairs'],
    description: 'Pair up a list of names at random',
    category: 'Generators',
    usage: '.pairup <name, name, name, name>',
    code: `const raw = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!raw) return mzazireply('Usage: ' + prefix + 'pairup <name, name, name, name>');
const names = raw.split(/[,;\\n]/).map(function (s) { return s.trim(); }).filter(Boolean);
if (names.length < 2) return mzazireply('❌ Separate the names with commas — I need at least two.');
const shuffled = names.slice();
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  const tmp = shuffled[i];
  shuffled[i] = shuffled[j];
  shuffled[j] = tmp;
}
const lines = [];
let i = 0;
for (; i + 1 < shuffled.length; i += 2) lines.push('  ' + shuffled[i] + '  +  ' + shuffled[i + 1]);
let tail = '';
if (i < shuffled.length) tail = '\\n\\n' + shuffled[i] + ' is on their own — odd number of names.';
return mzazireply('🤝 *Pairs*\\n\\n' + lines.join('\\n') + tail);`,
  },
  {
    name: 'bingocard',
    aliases: ['bingo'],
    description: 'Generate a random 5x5 bingo card',
    category: 'Generators',
    usage: '.bingocard',
    code: `const columns = [[], [], [], [], []];
const ranges = [[1, 15], [16, 30], [31, 45], [46, 60], [61, 75]];
for (let c = 0; c < 5; c++) {
  const low = ranges[c][0];
  const high = ranges[c][1];
  const pool = [];
  for (let i = low; i <= high; i++) pool.push(i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  columns[c] = pool.slice(0, 5);
}
columns[2][2] = 'FREE';
const rows = ['B   I   N   G   O'];
for (let r = 0; r < 5; r++) {
  const cells = [];
  for (let c = 0; c < 5; c++) cells.push(String(columns[c][r]).padStart(4, ' '));
  rows.push(cells.join(''));
}
return mzazireply('🎰 *Bingo card*\\n\\n' + rows.join('\\n'));`,
  },
  {
    name: 'countdown',
    aliases: ['daysleft', 'daysuntil'],
    description: 'How many days until a date',
    category: 'Generators',
    usage: '.countdown 2026-12-25',
    code: `const raw = (Array.isArray(args) ? args.join('') : '').trim();
if (!raw) return mzazireply('Usage: ' + prefix + 'countdown 2026-12-25');
const when = new Date(raw + 'T00:00:00Z');
if (isNaN(when.getTime())) return mzazireply('❌ I could not read that as a date. Use YYYY-MM-DD.');
const now = new Date();
const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const days = Math.round((when.getTime() - today.getTime()) / 86400000);
const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][when.getUTCDay()];
if (days === 0) return mzazireply('📅 ' + raw + ' is *today* (' + weekday + ').');
if (days > 0) return mzazireply('📅 *' + days + '* day(s) until ' + raw + ' (' + weekday + ')');
return mzazireply('📅 ' + raw + ' was *' + Math.abs(days) + '* day(s) ago (' + weekday + ').');`,
  },

  // ── Identifiers and throwaway values ─────────────────────────────────────
  {
    name: 'serialkey',
    aliases: ['productkey', 'licensekey'],
    description: 'Generate a placeholder serial key, for testing layouts and forms',
    category: 'Generators',
    usage: '.serialkey [groups]',
    code: `const a = Array.isArray(args) ? args : [];
let groups = 5;
if (a.length && /^[0-9]+$/.test(a[0])) groups = parseInt(a[0], 10);
if (groups < 1 || groups > 10) return mzazireply('❌ Between 1 and 10 groups.');
const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const out = [];
for (let g = 0; g < groups; g++) {
  let part = '';
  for (let i = 0; i < 5; i++) part += chars.charAt(Math.floor(Math.random() * chars.length));
  out.push(part);
}
return mzazireply('🔑 ' + out.join('-') + '\\n\\nPlaceholder only — this is not a real licence and unlocks nothing.');`,
  },
  {
    name: 'randomstring',
    aliases: ['randstring', 'randtext'],
    description: 'Generate a random string, with a choice of character set',
    category: 'Generators',
    usage: '.randomstring [length] [hex|letters|digits|alnum]',
    code: `const a = Array.isArray(args) ? args : [];
let length = 16;
let kind = 'alnum';
for (const v of a) {
  if (/^[0-9]+$/.test(v)) length = parseInt(v, 10);
  else if (/^(hex|letters|digits|alnum)$/i.test(v)) kind = v.toLowerCase();
}
if (length < 1 || length > 128) return mzazireply('❌ Length must be between 1 and 128.');
const sets = { hex: '0123456789abcdef', letters: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', digits: '0123456789', alnum: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' };
const set = sets[kind];
let out = '';
for (let i = 0; i < length; i++) out += set.charAt(Math.floor(Math.random() * set.length));
return mzazireply('🎲 ' + out + '\\n\\n(' + length + ' characters, ' + kind + ')');`,
  },
  {
    name: 'randomhex',
    aliases: ['hexcolor', 'randhex'],
    description: 'Generate random hex colours',
    category: 'Generators',
    usage: '.randomhex [count]',
    code: `const a = Array.isArray(args) ? args : [];
let count = 1;
if (a.length && /^[0-9]+$/.test(a[0])) count = parseInt(a[0], 10);
if (count < 1 || count > 20) return mzazireply('❌ Between 1 and 20 colours.');
const out = [];
for (let i = 0; i < count; i++) {
  const n = Math.floor(Math.random() * 16777216);
  out.push('#' + n.toString(16).padStart(6, '0').toUpperCase());
}
return mzazireply('🎨 ' + out.join('\\n'));`,
  },
  {
    name: 'randomip',
    aliases: ['randip', 'fakeip'],
    description: 'Generate a random-looking public IPv4 address',
    category: 'Generators',
    usage: '.randomip [count]',
    code: `const a = Array.isArray(args) ? args : [];
let count = 1;
if (a.length && /^[0-9]+$/.test(a[0])) count = parseInt(a[0], 10);
if (count < 1 || count > 20) return mzazireply('❌ Between 1 and 20 addresses.');
const out = [];
for (let i = 0; i < count; i++) {
  let first = Math.floor(Math.random() * 223) + 1;
  if (first === 10 || first === 127 || first === 172 || first === 192) first = first + 1;
  const parts = [first, Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 254) + 1];
  out.push(parts.join('.'));
}
return mzazireply('🌐 ' + out.join('\\n') + '\\n\\nDocumentation placeholder — not an address I claim exists.');`,
  },
  {
    name: 'randommac',
    aliases: ['randmac'],
    description: 'Generate a random MAC address',
    category: 'Generators',
    usage: '.randommac [count]',
    code: `const a = Array.isArray(args) ? args : [];
let count = 1;
if (a.length && /^[0-9]+$/.test(a[0])) count = parseInt(a[0], 10);
if (count < 1 || count > 20) return mzazireply('❌ Between 1 and 20 addresses.');
const out = [];
for (let i = 0; i < count; i++) {
  const bytes = [];
  for (let b = 0; b < 6; b++) bytes.push(Math.floor(Math.random() * 256));
  bytes[0] = (bytes[0] & 254) | 2;
  out.push(bytes.map(function (v) { return v.toString(16).padStart(2, '0').toUpperCase(); }).join(':'));
}
return mzazireply('🔌 ' + out.join('\\n') + '\\n\\n(First byte marked as locally administered, so it will not collide with a real vendor prefix.)');`,
  },
  {
    name: 'randomdate',
    aliases: ['randdate', 'fakedate'],
    description: 'Generate a random date, optionally between two years',
    category: 'Generators',
    usage: '.randomdate [fromYear] [toYear]',
    code: `const a = Array.isArray(args) ? args : [];
const thisYear = new Date().getFullYear();
let from = 2000;
let to = thisYear;
if (a.length && /^[0-9]{4}$/.test(a[0])) from = parseInt(a[0], 10);
if (a.length > 1 && /^[0-9]{4}$/.test(a[1])) to = parseInt(a[1], 10);
if (from > to) { const tmp = from; from = to; to = tmp; }
if (from < 1900 || to > 2200) return mzazireply('❌ Keep the years between 1900 and 2200.');
const start = Date.UTC(from, 0, 1);
const end = Date.UTC(to, 11, 31);
const day = Math.floor(Math.random() * ((end - start) / 86400000 + 1));
return mzazireply('📅 ' + new Date(start + day * 86400000).toISOString().slice(0, 10) + '\\n\\nRandom between ' + from + ' and ' + to + '.');`,
  },

  // ── Passwords ────────────────────────────────────────────────────────────
  {
    name: 'passstrength',
    aliases: ['passwordstrength', 'strength'],
    description: 'Estimate how strong a password is, and say what would make it better',
    category: 'Generators',
    usage: '.passstrength <password>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'passstrength <password>\\n\\n(Only ever test a password that belongs to you, and consider changing it afterwards.)');
let pool = 0;
if (/[a-z]/.test(t)) pool += 26;
if (/[A-Z]/.test(t)) pool += 26;
if (/[0-9]/.test(t)) pool += 10;
if (/[^A-Za-z0-9]/.test(t)) pool += 33;
if (!pool) return mzazireply('❌ That does not contain any letters, digits or symbols I can measure.');
const entropy = t.length * Math.log2(pool);
let verdict = 'very weak';
if (entropy >= 128) verdict = 'very strong';
else if (entropy >= 80) verdict = 'strong';
else if (entropy >= 60) verdict = 'reasonable';
else if (entropy >= 36) verdict = 'weak';
else if (entropy >= 28) verdict = 'very weak';
const notes = [];
if (t.length < 12) notes.push('• It is short — ' + t.length + ' characters. Length matters more than symbols.');
if (pool < 62) notes.push('• The character set is limited. Mixing case, digits and symbols widens it.');
if (/^[0-9]+$/.test(t)) notes.push('• Digits only — a few hundred million guesses per second covers that space quickly.');
if (/(.)\\1{2,}/.test(t)) notes.push('• It repeats the same character more than twice, which guessing tools try first.');
if (/(012|123|234|345|456|567|678|789|abc|bcd|cde|def|qwerty|password|admin|welcome)/i.test(t)) notes.push('• It contains a common sequence or word that wordlists already include.');
if (notes.length < 2) notes.push('• Add a few more characters before anyone reuses it for anything important.');
return mzazireply('🔐 *Password check*\\n\\nLength: ' + t.length + '\\nCharacter set: ' + pool + ' possible characters\\nRough entropy: ' + Math.round(entropy) + ' bits — ' + verdict + '\\n\\n' + notes.join('\\n') + '\\n\\n⚠️ You just sent this password through WhatsApp. Change it after testing.');`,
  },
  {
    name: 'passphrase',
    aliases: ['diceware', 'wordpass'],
    description: 'Build an easy-to-remember passphrase from random words',
    category: 'Generators',
    usage: '.passphrase [words]',
    code: `const a = Array.isArray(args) ? args : [];
let count = 4;
if (a.length && /^[0-9]+$/.test(a[0])) count = parseInt(a[0], 10);
if (count < 3 || count > 8) return mzazireply('❌ Use between 3 and 8 words.');
const words = ['amber', 'anchor', 'basket', 'beacon', 'bottle', 'bronze', 'cactus', 'candle', 'canvas', 'carpet', 'castle', 'cherry', 'cobalt', 'copper', 'corner', 'cotton', 'dragon', 'engine', 'falcon', 'forest', 'garden', 'granite', 'harbour', 'hollow', 'island', 'jacket', 'jungle', 'kettle', 'lantern', 'lemon', 'magnet', 'marble', 'meadow', 'meteor', 'mirror', 'nectar', 'north', 'ocean', 'orchard', 'pebble', 'pepper', 'planet', 'pocket', 'quartz', 'rabbit', 'ribbon', 'rocket', 'saddle', 'shelter', 'silver', 'socket', 'spider', 'sunset', 'temple', 'thunder', 'timber', 'tunnel', 'velvet', 'walnut', 'willow', 'window', 'winter', 'yellow', 'zephyr', 'zinnia'];
const picked = [];
for (let i = 0; i < count; i++) picked.push(words[Math.floor(Math.random() * words.length)]);
const digit = Math.floor(Math.random() * 90) + 10;
const phrase = picked.join('-') + '-' + digit;
const bits = Math.round(count * Math.log2(words.length) + Math.log2(90));
return mzazireply('🔑 ' + phrase + '\\n\\n' + count + ' words + a number ≈ ' + bits + ' bits from a ' + words.length + '-word list.\\nEasy to type, hard to guess, and different every time you ask.');`,
  },
  {
    name: 'username',
    aliases: ['genusername', 'makeusername'],
    description: 'Generate a random username',
    category: 'Generators',
    usage: '.username [count]',
    code: `const a = Array.isArray(args) ? args : [];
let count = 1;
if (a.length && /^[0-9]+$/.test(a[0])) count = parseInt(a[0], 10);
if (count < 1 || count > 20) return mzazireply('❌ Between 1 and 20 names.');
const first = ['swift', 'quiet', 'bright', 'humble', 'rapid', 'clever', 'bold', 'calm', 'lucky', 'sharp', 'wandering', 'hidden', 'golden', 'silent', 'electric', 'midnight', 'cosmic', 'wild', 'steady', 'brave'];
const second = ['otter', 'falcon', 'panther', 'fox', 'crane', 'gecko', 'ibis', 'heron', 'lynx', 'meerkat', 'raven', 'shark', 'tiger', 'vole', 'wolf', 'dolphin', 'antelope', 'buffalo', 'cheetah', 'duiker'];
const out = [];
for (let i = 0; i < count; i++) {
  const f = first[Math.floor(Math.random() * first.length)];
  const s = second[Math.floor(Math.random() * second.length)];
  out.push(f + '_' + s + (Math.floor(Math.random() * 900) + 100));
}
return mzazireply('👤 ' + out.join('\\n'));`,
  },

  // ── Colour schemes ───────────────────────────────────────────────────────
  {
    name: 'gradient',
    aliases: ['cssgradient'],
    description: 'Build a CSS gradient from two brand colours',
    category: 'Generators',
    usage: '.gradient [hex]',
    code: `const a = Array.isArray(args) ? args : [];
const brand = ['#7C3AED', '#2563EB', '#DB2777', '#A16207', '#0F172A', '#047857'];
let base = brand[Math.floor(Math.random() * brand.length)];
const given = a.join('').replace(/^#/, '');
if (/^[0-9a-fA-F]{6}$/.test(given)) base = '#' + given.toUpperCase();
const others = brand.filter(function (c) { return c !== base; });
const second = others[Math.floor(Math.random() * others.length)];
const angle = [135, 160, 200, 225][Math.floor(Math.random() * 4)];
const stop = Math.floor(Math.random() * 30) + 35;
return mzazireply('🌈 linear-gradient(' + angle + 'deg, ' + base + ' 0%, ' + second + ' ' + stop + '%)' + '\\n\\n' + base + ' → ' + second + '\\n\\n(Paste straight into a CSS background.)');`,
  },
  {
    name: 'colorscheme',
    aliases: ['palette', 'scheme'],
    description: 'Build a five-colour scheme around one base colour',
    category: 'Generators',
    usage: '.colorscheme [#base]',
    code: `const a = Array.isArray(args) ? args : [];
const given = a.join('').replace(/^#/, '');
let baseR = 124;
let baseG = 58;
let baseB = 237;
if (/^[0-9a-fA-F]{6}$/.test(given)) {
  baseR = parseInt(given.substr(0, 2), 16);
  baseG = parseInt(given.substr(2, 2), 16);
  baseB = parseInt(given.substr(4, 2), 16);
}
const toHsl = function (r, g, b) {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rf) h = (gf - bf) / d + (gf < bf ? 6 : 0);
    else if (max === gf) h = (bf - rf) / d + 2;
    else h = (rf - gf) / d + 4;
    h = h * 60;
  }
  return { h: h, s: s, l: l };
};
const toHex = function (h, s, l) {
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
  const conv = function (v) { return Math.round(Math.min(1, Math.max(0, v + m)) * 255).toString(16).padStart(2, '0'); };
  return '#' + (conv(rp) + conv(gp) + conv(bp)).toUpperCase();
};
const base = toHsl(baseR, baseG, baseB);
const shift = function (deg, s, l) { return toHex((base.h + deg + 360) % 360, Math.min(1, Math.max(0, s)), Math.min(1, Math.max(0, l))); };
const rows = [
  '  Brand     ' + toHex(base.h, base.s, base.l) + '   (your base)',
  '  Dark      ' + toHex(base.h, base.s * 0.9, Math.max(0.12, base.l - 0.28)),
  '  Light     ' + shift(0, base.s * 0.8, Math.min(0.94, base.l + 0.3)),
  '  Complement ' + shift(180, base.s * 0.9, base.l),
  '  Accent    ' + shift(40, Math.min(0.9, base.s), Math.min(0.85, base.l + 0.06))
];
return mzazireply('🎨 *Scheme around ' + toHex(base.h, base.s, base.l) + '*\\n\\n' + rows.join('\\n') + '\\n\\n(Complements and accents sit 180 and 40 degrees away on the colour wheel.)');`,
  },

  // ── Conversation ─────────────────────────────────────────────────────────
  {
    name: 'motivation',
    aliases: ['motivationaline', 'inspire'],
    description: 'A short line to start the day',
    category: 'Generators',
    usage: '.motivation',
    code: `const lines = [
  'Start before you feel ready. Ready tends to arrive afterwards.',
  'Small steps on a bad day still count as steps.',
  'Finish one thing today rather than touching five.',
  'The work you avoid is usually the work that matters.',
  'Ask for the thing. The answer is not worse than the not-asking.',
  'Do it badly, then improve it. A draft beats a blank page.',
  'Protect the first hour of your day and it will pay for the rest.',
  'You cannot control the outcome, only the effort you put in today.',
  'Send the message. Most of the fear lives in the composing.',
  'Rest is part of the work, not a reward for finishing it.',
  'Say the difficult thing early, while it is still small.',
  'Consistency beats intensity over a year.'
];
const pick = lines[Math.floor(Math.random() * lines.length)];
return mzazireply('🌱 ' + pick + '\\n\\n(Unattributed on purpose — I do not invent authors.)');`,
  },
  {
    name: 'icebreaker',
    aliases: ['convostarter', 'starter'],
    description: 'A question to get a group talking',
    category: 'Generators',
    usage: '.icebreaker',
    code: `const questions = [
  'What is something you learned this week, however small?',
  'What is the one tool you would keep if you had to drop everything else?',
  'What is a skill you would learn if it took a single weekend?',
  'Which app do you open first each morning, and why that one?',
  'What is the best piece of advice you have actually used?',
  'What is something you are better at than most people assume?',
  'What is the last thing you changed your mind about?',
  'If your workday had one fewer meeting, which would you drop?',
  'What is something on your list that has been there for a year?',
  'What made you laugh this week?',
  'What is a small thing that reliably improves your day?',
  'Who taught you the most, and what did they teach?'
];
const pick = questions[Math.floor(Math.random() * questions.length)];
return mzazireply('💬 ' + pick);`,
  },
  {
    name: 'affirmation',
    aliases: ['affirm'],
    description: 'A short line to steady yourself before something difficult',
    category: 'Generators',
    usage: '.affirmation',
    code: `const lines = [
  'You have handled harder weeks than this one.',
  'The nerves mean it matters. That is not a problem to fix.',
  'You do not need to be the best in the room. You need to be useful in it.',
  'Being new at something is a stage, not a verdict.',
  'You can do it badly and still move forward.',
  'Your pace is not a failure, it is your pace.',
  'One honest conversation can clear a month of worry.',
  'Ask. The worst answer is a no you already have.',
  'You are allowed to change your mind with new information.',
  'Doing your best today, with what you have today, is enough.'
];
const pick = lines[Math.floor(Math.random() * lines.length)];
return mzazireply('💙 ' + pick);`,
  },
  {
    name: 'storyprompt',
    aliases: ['writeprompt', 'writingidea'],
    description: 'A creative writing prompt, optionally built around your subject',
    category: 'Generators',
    usage: '.storyprompt [subject]',
    code: `const a = Array.isArray(args) ? args : [];
const subject = a.join(' ').trim() || 'a market trader in Nairobi';
const openings = ['It started the morning', 'Nobody expected it until', 'The first sign came when', 'Everything changed the week', 'It began quietly, the day'];
const middles = ['the power went out for the third time and', 'a stranger paid with a note nobody recognised and', 'the phone rang twice and stopped and', 'the rain finally came and', 'a delivery arrived with the wrong name on it and'];
const turns = ['someone decided to tell the truth.', 'the plan had to be rebuilt from nothing.', 'the easiest option turned out to be the trap.', 'a promise made years ago came due.', 'two people admitted they wanted the same thing.'];
const pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
const prompt = pick(openings) + ' ' + pick(middles) + ' ' + pick(turns);
return mzazireply('✍️ *Write about:* ' + subject + '\\n\\n' + prompt + '\\n\\n(400 words. No editing until the end.)');`,
  },
  {
    name: 'emoji',
    aliases: ['randomemoji'],
    description: 'A random emoji, or a row of them',
    category: 'Generators',
    usage: '.emoji [count]',
    code: `const a = Array.isArray(args) ? args : [];
let count = 1;
if (a.length && /^[0-9]+$/.test(a[0])) count = parseInt(a[0], 10);
if (count < 1 || count > 30) return mzazireply('❌ Between 1 and 30.');
const list = ['😀','😂','😍','🤩','😎','🤔','🙌','👏','👍','🙏','🔥','✨','🎉','🎯','🚀','💡','📌','📈','💬','✅','❤️','💙','💜','🌈','🌍','🍀','☕','🍕','🎵','🎮','🐦','🐬','🦁','🌟','⚡','🧠','🛠️','📚','🗓️','🏆'];
const out = [];
for (let i = 0; i < count; i++) out.push(list[Math.floor(Math.random() * list.length)]);
return mzazireply('🎲 ' + out.join(' '));`,
  },
  {
    name: 'dadjoke',
    aliases: ['pun', 'groan'],
    description: 'A deliberately terrible joke',
    category: 'Generators',
    usage: '.dadjoke',
    code: `const jokes = [
  'I only know 25 letters of the alphabet. I do not know y.',
  'I told my computer I needed a break. It said: no problem, I will go to sleep.',
  'Why did the developer go broke? Because he used up all his cache.',
  'I would tell you a UDP joke, but you might not get it.',
  'There are two hard things in computing: naming things, cache invalidation, and off-by-one errors.',
  'Why do Java developers wear glasses? Because they do not C sharp.',
  'A SQL query walks into a bar, walks up to two tables and asks: may I join you?',
  'I changed my password to incorrect. Now the computer tells me my password is incorrect.',
  'Why was the phone sad? It had too many missed calls and no answers.',
  'I am reading a book about anti-gravity. It is impossible to put down.',
  'My battery told me a joke. I did not laugh, but it had a good charge.',
  'Why did the bicycle fall over? It was two-tired.'
];
const pick = jokes[Math.floor(Math.random() * jokes.length)];
return mzazireply('😄 ' + pick);`,
  },
];
