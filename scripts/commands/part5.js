// ─────────────────────────────────────────────────────────────────────────────
// MZAZI XMD — command pack, part 5 of 8: TEXT (extended)
//
// Part 1 already covers the basics: case conversion, reversal, counting,
// sorting, trimming, replacing. None of that is repeated here. These are the
// text tools a person reaches for next — measuring, padding, reshaping,
// comparing and styling.
//
// Same conventions as part 1:
//   • only wired context values (mzazireply, args, prefix, text)
//   • string concatenation rather than nested template literals
//   • every command guards its arguments and answers with its usage rather
//     than throwing, because a thrown error reaches the customer as text
//   • output is capped so a careless argument cannot produce a 60,000
//     character message that WhatsApp refuses to deliver
//
// Nothing here touches the network, the filesystem or a system binary, so
// these are the commands least likely to fail for an environmental reason.
//
// Why alignment commands print a leading '|' — WhatsApp does not render
// messages in a monospace font, so leading spaces are invisible. The marker
// makes the padding visible, and a copy of the text in a plain editor keeps
// the spacing intact.
// ─────────────────────────────────────────────────────────────────────────────

module.exports = [
  // ── Length, repetition and padding ────────────────────────────────────────
  {
    name: 'repeat',
    aliases: ['reptext', 'duptext'],
    description: 'Repeat text a number of times, one copy per line',
    category: 'Text',
    usage: '.repeat <times> <text>',
    code: `const a = Array.isArray(args) ? args : [];
const n = parseInt(a[0], 10);
const t = a.slice(1).join(' ').trim();
if (!n || n < 1 || !t) return mzazireply('Usage: ' + prefix + 'repeat <times> <text>');
if (n > 100) return mzazireply('❌ Keep the repeat count at 100 or less.');
if (n * (t.length + 1) > 4000) return mzazireply('❌ That would be too long for one message.');
return mzazireply(new Array(n + 1).join(t + '\\n'));`,
  },
  {
    name: 'truncate',
    aliases: ['cuttext', 'limitchars'],
    description: 'Cut text to a maximum number of characters',
    category: 'Text',
    usage: '.truncate <characters> <text>',
    code: `const a = Array.isArray(args) ? args : [];
const n = parseInt(a[0], 10);
const t = a.slice(1).join(' ').trim();
if (!n || n < 1 || !t) return mzazireply('Usage: ' + prefix + 'truncate <characters> <text>');
if (n > 4000) return mzazireply('❌ Keep it to 4000 characters or less.');
const cut = t.length <= n ? t : t.slice(0, n).trim() + '…';
return mzazireply(cut + '\\n\\n(' + t.length + ' characters, showing ' + Math.min(n, t.length) + ')');`,
  },
  {
    name: 'padtext',
    aliases: ['padstart', 'rightpad'],
    description: 'Pad text with spaces to a fixed width, for aligned copying',
    category: 'Text',
    usage: '.padtext <width> <text>',
    code: `const a = Array.isArray(args) ? args : [];
const n = parseInt(a[0], 10);
const t = a.slice(1).join(' ').trim();
if (!n || n < 1 || !t) return mzazireply('Usage: ' + prefix + 'padtext <width> <text>');
if (n > 200) return mzazireply('❌ Width must be 200 or less.');
const spaces = Math.max(0, n - t.length);
return mzazireply('|' + t + new Array(spaces + 1).join(' ') + '|\\n\\n' + (spaces ? spaces + ' space(s) added.' : 'Already ' + t.length + ' wide.'));`,
  },
  {
    name: 'separator',
    aliases: ['divider', 'drawline'],
    description: 'Draw a line of any character, useful for separating sections',
    category: 'Text',
    usage: '.separator [count] [character]',
    code: `const a = Array.isArray(args) ? args : [];
let ch = '-';
let n = 24;
for (const v of a) {
  if (/^[0-9]+$/.test(v)) n = parseInt(v, 10);
  else if (v.length) ch = v.charAt(0);
}
if (n < 1) n = 1;
if (n > 200) return mzazireply('❌ Keep the length between 1 and 200.');
return mzazireply(new Array(n + 1).join(ch));`,
  },

  // ── Measuring text ───────────────────────────────────────────────────────
  {
    name: 'charfreq',
    aliases: ['chartally', 'charcounts'],
    description: 'Show the most common characters in text',
    category: 'Text',
    usage: '.charfreq <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'charfreq <text>');
const counts = {};
for (const ch of t) {
  if (ch === '\\n') continue;
  counts[ch] = (counts[ch] || 0) + 1;
}
const top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 15);
const lines = top.map(function (c) { return '  ' + JSON.stringify(c) + '  ×' + counts[c]; });
return mzazireply('📊 *Most common characters*\\n\\n' + lines.join('\\n') + '\\n\\nUnique: ' + Object.keys(counts).length + '\\nTotal: ' + t.length);`,
  },
  {
    name: 'wordfreq',
    aliases: ['wordtally', 'topwords'],
    description: 'Show the most repeated words in text',
    category: 'Text',
    usage: '.wordfreq <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim().toLowerCase();
if (!t) return mzazireply('Usage: ' + prefix + 'wordfreq <text>');
const words = t.split(/[^a-z0-9']+/).filter(Boolean);
if (!words.length) return mzazireply('❌ No words found in that text.');
const counts = {};
for (const w of words) counts[w] = (counts[w] || 0) + 1;
const top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 12);
const lines = top.map(function (w) { return '  ' + w + ' — ' + counts[w]; });
return mzazireply('📊 *Most repeated words*\\n\\n' + lines.join('\\n') + '\\n\\nUnique: ' + Object.keys(counts).length + '\\nTotal words: ' + words.length);`,
  },
  {
    name: 'longestword',
    aliases: ['wordlengths', 'longest'],
    description: 'Show the longest and shortest word, plus the average length',
    category: 'Text',
    usage: '.longestword <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'longestword <text>');
const words = t.split(/\\s+/).filter(Boolean);
if (!words.length) return mzazireply('❌ No words found.');
let best = words[0];
let worst = words[0];
for (const w of words) {
  if (w.length > best.length) best = w;
  if (w.length < worst.length) worst = w;
}
const total = words.join('').length;
return mzazireply('📏 *Word lengths*\\n\\nLongest: ' + best + ' (' + best.length + ')\\nShortest: ' + worst + ' (' + worst.length + ')\\nWords: ' + words.length + '\\nAverage: ' + Math.round(total / words.length));`,
  },
  {
    name: 'squeeze',
    aliases: ['collapsespace', 'singlespace'],
    description: 'Collapse runs of spaces and tabs into single spaces',
    category: 'Text',
    usage: '.squeeze <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'squeeze <text>');
const out = t.replace(/[ \\t]{2,}/g, ' ').trim();
return mzazireply('🧹 ' + out + '\\n\\n(' + (t.length - out.length) + ' character(s) removed)');`,
  },

  // ── Reshaping text ───────────────────────────────────────────────────────
  {
    name: 'wrap',
    aliases: ['foldtext', 'wrapcols'],
    description: 'Wrap long text at a chosen column width',
    category: 'Text',
    usage: '.wrap [width] <text>',
    code: `const a = Array.isArray(args) ? args : [];
let width = 40;
let rest = a.slice();
if (rest.length && /^[0-9]+$/.test(rest[0])) { width = parseInt(rest[0], 10); rest = rest.slice(1); }
const t = rest.join(' ').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'wrap [width] <text>');
if (width < 10 || width > 200) return mzazireply('❌ Width must be between 10 and 200.');
const words = t.split(/\\s+/);
const out = [];
let line = '';
for (const w of words) {
  if (!line.length) { line = w; continue; }
  if (line.length + 1 + w.length <= width) { line = line + ' ' + w; continue; }
  out.push(line);
  line = w;
}
if (line.length) out.push(line);
return mzazireply(out.join('\\n') + '\\n\\n(' + out.length + ' line(s), width ' + width + ')');`,
  },
  {
    name: 'indent',
    aliases: ['indentlines', 'addindent'],
    description: 'Add leading spaces to every line of text',
    category: 'Text',
    usage: '.indent [spaces] <text>',
    code: `const a = Array.isArray(args) ? args : [];
let n = 4;
let rest = a.slice();
if (rest.length && /^[0-9]+$/.test(rest[0])) { n = parseInt(rest[0], 10); rest = rest.slice(1); }
const t = rest.join(' ').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'indent [spaces] <text>');
if (n < 1 || n > 40) return mzazireply('❌ Indent must be between 1 and 40 spaces.');
const pad = new Array(n + 1).join(' ');
const out = t.split('\\n').map(function (l) { return '|' + pad + l; }).join('\\n');
return mzazireply(out + '\\n\\n(' + n + ' space(s) per line — the | marks where the text starts)');`,
  },
  {
    name: 'dedent',
    aliases: ['outdent', 'unindent'],
    description: 'Remove the shared leading spaces from every line',
    category: 'Text',
    usage: '.dedent <text>',
    // Indentation is the whole point here, and `args` cannot carry it: the
    // runtime splits arguments on runs of spaces, so four leading spaces arrive
    // as one. `body` is the raw message text, where the exact spacing survives.
    // So this reads body, and falls back to args only if body is empty.
    code: `let t = '';
if (typeof body === 'string' && body.length) t = body.replace(/^[^\\s]+[ \\t]*/, '');
if (!t) t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t.trim()) return mzazireply('Usage: ' + prefix + 'dedent <text, one line per line>');
const lines = t.split('\\n').filter(function (l) { return l.trim().length; });
if (!lines.length) return mzazireply('❌ Nothing to dedent.');
let min = 1000000;
for (const l of lines) {
  const lead = l.length - l.replace(/^[ \\t]+/, '').length;
  if (lead < min) min = lead;
}
const out = lines.map(function (l) { return l.slice(min); }).join('\\n');
return mzazireply('🧹 Removed ' + min + ' leading character(s) from each line:\\n\\n' + out);`,
  },
  {
    name: 'bulletlist',
    aliases: ['bullets', 'listify'],
    description: 'Turn each line into a bullet point',
    category: 'Text',
    usage: '.bulletlist <one item per line>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'bulletlist <one item per line>');
const lines = t.split('\\n').map(function (l) { return l.trim(); }).filter(Boolean);
if (!lines.length) return mzazireply('❌ Nothing to list.');
if (lines.length > 100) return mzazireply('❌ Keep it to 100 items.');
return mzazireply(lines.map(function (l) { return '• ' + l; }).join('\\n'));`,
  },
  {
    name: 'numberedlist',
    aliases: ['numlist', 'numberlines'],
    description: 'Number each line from 1 upwards',
    category: 'Text',
    usage: '.numberedlist <one item per line>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'numberedlist <one item per line>');
const lines = t.split('\\n').map(function (l) { return l.trim(); }).filter(Boolean);
if (!lines.length) return mzazireply('❌ Nothing to number.');
if (lines.length > 100) return mzazireply('❌ Keep it to 100 items.');
return mzazireply(lines.map(function (l, i) { return (i + 1) + '. ' + l; }).join('\\n'));`,
  },
  {
    name: 'uniquelines',
    aliases: ['dedupe', 'dedup'],
    description: 'Remove duplicate lines, keeping the first of each',
    category: 'Text',
    usage: '.uniquelines <one item per line>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'uniquelines <one item per line>');
const lines = t.split('\\n').map(function (l) { return l.trim(); }).filter(Boolean);
if (!lines.length) return mzazireply('❌ Nothing to clean.');
const seen = new Set();
const out = [];
for (const l of lines) {
  if (!seen.has(l)) { seen.add(l); out.push(l); }
}
const removed = lines.length - out.length;
return mzazireply('🧹 Removed ' + removed + ' duplicate(s)\\n' + out.length + ' unique line(s)\\n\\n' + out.join('\\n'));`,
  },
  {
    name: 'blockquote',
    aliases: ['quotelines', 'quoteall'],
    description: 'Prefix every line with the WhatsApp quote marker',
    category: 'Text',
    usage: '.blockquote <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'blockquote <text>');
return mzazireply(t.split('\\n').map(function (l) { return '> ' + l; }).join('\\n'));`,
  },
  {
    name: 'centertext',
    aliases: ['centretext', 'centeralign'],
    description: 'Centre each line inside the width of the longest line',
    category: 'Text',
    usage: '.centertext <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'centertext <text>');
const lines = t.split('\\n');
let w = 0;
for (const l of lines) if (l.length > w) w = l.length;
const out = lines.map(function (l) {
  const pad = Math.floor((w - l.length) / 2);
  return '|' + new Array(pad + 1).join(' ') + l;
}).join('\\n');
return mzazireply(out + '\\n\\n(centred inside ' + w + ' characters — the | marks the left edge)');`,
  },
  {
    name: 'alignright',
    aliases: ['rightalign', 'flushright'],
    description: 'Push each line to the right edge of the longest line',
    category: 'Text',
    usage: '.alignright <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'alignright <text>');
const lines = t.split('\\n');
let w = 0;
for (const l of lines) if (l.length > w) w = l.length;
const out = lines.map(function (l) { return new Array(w - l.length + 1).join(' ') + '|' + l; }).join('\\n');
return mzazireply(out + '\\n\\n(right aligned to ' + w + ' characters — the | marks the right edge)');`,
  },
  {
    name: 'textbox',
    aliases: ['boxtext', 'frametext'],
    description: 'Draw a box around text',
    category: 'Text',
    usage: '.textbox <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'textbox <text>');
const lines = t.split('\\n');
let w = 0;
for (const l of lines) if (l.length > w) w = l.length;
if (w > 80) return mzazireply('❌ Keep each line to 80 characters or less.');
const bar = new Array(w + 3).join('─');
const body = lines.map(function (l) { return '│ ' + l + new Array(w - l.length + 1).join(' ') + '│'; }).join('\\n');
return mzazireply('┌' + bar + '┐\\n' + body + '\\n└' + bar + '┘');`,
  },
  {
    name: 'acronym',
    aliases: ['abbr'],
    description: 'Turn a phrase into an acronym',
    category: 'Text',
    usage: '.acronym <phrase>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'acronym <phrase>');
const parts = t.split(/\\s+/).filter(Boolean);
const out = parts.map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
return mzazireply('🔤 ' + out + '\\n\\n(from ' + parts.length + ' word(s))');`,
  },
  {
    name: 'initials',
    aliases: ['firstletters'],
    description: 'Turn a full name into initials',
    category: 'Text',
    usage: '.initials <full name>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'initials <full name>');
const parts = t.split(/\\s+/).filter(Boolean);
if (!parts.length) return mzazireply('❌ No name found.');
const dots = parts.map(function (w) { return w.charAt(0).toUpperCase() + '.'; }).join(' ');
const tight = parts.map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
return mzazireply('🔤 ' + tight + '\\n' + dots + '\\n\\n(' + parts.length + ' part(s))');`,
  },
  {
    name: 'redact',
    aliases: ['masktext', 'censor'],
    description: 'Hide email addresses and long numbers in text before sharing',
    category: 'Text',
    usage: '.redact <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'redact <text>');
const noMail = t.replace(/[^\\s@]+@[^\\s@]+\\.[^\\s@]+/g, '[email hidden]');
const noNum = noMail.replace(/\\d{4,}/g, function (d) { return d.slice(0, 2) + new Array(d.length - 1).join('*'); });
return mzazireply('🕵️ *Redacted*\\n\\n' + noNum + '\\n\\n(emails hidden, long numbers partly masked)');`,
  },

  // ── Case and word shape ──────────────────────────────────────────────────
  {
    name: 'camelcase',
    aliases: ['camel', 'cameltext'],
    description: 'Join words as camelCase',
    category: 'Text',
    usage: '.camelcase <words>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'camelcase <words>');
const words = t.split(/[^A-Za-z0-9]+/).filter(Boolean);
if (!words.length) return mzazireply('❌ No words found.');
const out = words.map(function (w, i) {
  const lw = w.toLowerCase();
  return i === 0 ? lw : lw.charAt(0).toUpperCase() + lw.slice(1);
}).join('');
return mzazireply('🐫 ' + out);`,
  },
  {
    name: 'snakecase',
    aliases: ['snaketext', 'underscoretext'],
    description: 'Join words with underscores in lower case',
    category: 'Text',
    usage: '.snakecase <words>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'snakecase <words>');
const words = t.split(/[^A-Za-z0-9]+/).filter(Boolean);
if (!words.length) return mzazireply('❌ No words found.');
return mzazireply('🐍 ' + words.map(function (w) { return w.toLowerCase(); }).join('_'));`,
  },
  {
    name: 'kebabcase',
    aliases: ['kebab', 'dashcase'],
    description: 'Join words with dashes in lower case',
    category: 'Text',
    usage: '.kebabcase <words>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'kebabcase <words>');
const words = t.split(/[^A-Za-z0-9]+/).filter(Boolean);
if (!words.length) return mzazireply('❌ No words found.');
return mzazireply('🥙 ' + words.map(function (w) { return w.toLowerCase(); }).join('-'));`,
  },
  {
    name: 'constantcase',
    aliases: ['screamcase', 'envcase'],
    description: 'Join words with underscores in UPPER CASE, the way constants are named',
    category: 'Text',
    usage: '.constantcase <words>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'constantcase <words>');
const words = t.split(/[^A-Za-z0-9]+/).filter(Boolean);
if (!words.length) return mzazireply('❌ No words found.');
return mzazireply(words.map(function (w) { return w.toUpperCase(); }).join('_'));`,
  },
  {
    name: 'removevowels',
    aliases: ['novowels', 'unvowel'],
    description: 'Remove every vowel from text',
    category: 'Text',
    usage: '.removevowels <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'removevowels <text>');
return mzazireply(t.replace(/[aeiouAEIOU]/g, ''));`,
  },
  {
    name: 'sortwords',
    aliases: ['wordsort', 'alphabetizewords'],
    description: 'Sort the words in a line alphabetically',
    category: 'Text',
    usage: '.sortwords <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'sortwords <text>');
const words = t.split(/\\s+/).filter(Boolean);
if (words.length < 2) return mzazireply('❌ Give me at least two words to sort.');
const sorted = words.slice().sort(function (x, y) { return x.toLowerCase().localeCompare(y.toLowerCase()); });
return mzazireply(sorted.join(' '));`,
  },
  {
    name: 'stripaccents',
    aliases: ['deaccent', 'noaccents'],
    description: 'Remove accents and diacritics, leaving plain letters',
    category: 'Text',
    usage: '.stripaccents <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'stripaccents <text>');
try {
  const out = t.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
  return mzazireply(out + (out === t ? '\\n\\n(no accents found)' : ''));
} catch (e) { return mzazireply('❌ Could not normalise that text: ' + e.message); }`,
  },
  {
    name: 'striphtml',
    aliases: ['nohtml', 'htmlstrip'],
    description: 'Strip HTML tags and entities, leaving readable text',
    category: 'Text',
    usage: '.striphtml <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'striphtml <text>');
const noTags = t.replace(/<[^>]*>/g, ' ').replace(/[ \\t]{2,}/g, ' ').trim();
const decoded = noTags
  .replace(/&nbsp;/g, ' ')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');
return mzazireply(decoded);`,
  },

  // ── Styling with Unicode look-alikes ─────────────────────────────────────
  {
    name: 'vaporwave',
    aliases: ['fullwidth', 'widestyle'],
    description: 'Convert text to full width characters',
    category: 'Text',
    usage: '.vaporwave <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'vaporwave <text>');
const out = t.split('').map(function (c) {
  const code = c.charCodeAt(0);
  if (c === ' ') return '　';
  if (code >= 33 && code <= 126) return String.fromCharCode(code + 0xFEE0);
  return c;
}).join('');
return mzazireply(out);`,
  },
  {
    name: 'circledtext',
    aliases: ['circled', 'roundtext'],
    description: 'Turn letters and digits into circled characters',
    category: 'Text',
    usage: '.circledtext <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'circledtext <text>');
const out = t.split('').map(function (c) {
  const code = c.charCodeAt(0);
  if (c >= 'a' && c <= 'z') return String.fromCharCode(0x24D0 + code - 97);
  if (c >= 'A' && c <= 'Z') return String.fromCharCode(0x24B6 + code - 65);
  if (c === '0') return '⓪';
  if (code >= 49 && code <= 57) return String.fromCharCode(0x2460 + code - 49);
  return c;
}).join('');
return mzazireply(out);`,
  },
  {
    name: 'superscript',
    aliases: ['supertext', 'raisedtext'],
    description: 'Raise text into superscript characters',
    category: 'Text',
    usage: '.superscript <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'superscript <text>');
const map = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ', 'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'i': 'ⁱ', 'j': 'ʲ', 'k': 'ᵏ', 'l': 'ˡ',
  'm': 'ᵐ', 'n': 'ⁿ', 'o': 'ᵒ', 'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ', 'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ' };
const out = t.toLowerCase().split('').map(function (c) { return map[c] || c; }).join('');
return mzazireply(out + '\\n\\n(letters with no superscript form are kept as they are)');`,
  },
  {
    name: 'subscript',
    aliases: ['subtext', 'loweredtext'],
    description: 'Sink text into subscript characters',
    category: 'Text',
    usage: '.subscript <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'subscript <text>');
const map = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ', 'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ', 'p': 'ₚ',
  'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ', 'v': 'ᵥ', 'x': 'ₓ' };
const out = t.toLowerCase().split('').map(function (c) { return map[c] || c; }).join('');
return mzazireply(out + '\\n\\n(only some letters have a subscript form — the rest are kept)');`,
  },
  {
    name: 'strikethrough',
    aliases: ['striketext', 'crossed'],
    description: 'Strike a line through text using combining characters',
    category: 'Text',
    usage: '.strikethrough <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'strikethrough <text>');
if (t.length > 200) return mzazireply('❌ Keep it to 200 characters.');
const mark = '\\u0336';
return mzazireply(t.split('').join(mark) + mark);`,
  },
  {
    name: 'underlinetext',
    aliases: ['underline', 'uline'],
    description: 'Underline text using combining characters',
    category: 'Text',
    usage: '.underlinetext <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'underlinetext <text>');
if (t.length > 200) return mzazireply('❌ Keep it to 200 characters.');
const mark = '\\u0332';
return mzazireply(t.split('').join(mark) + mark);`,
  },
  {
    name: 'spacedletters',
    aliases: ['spaceletters', 'letterbyletter'],
    description: 'Separate every letter of a word with spaces',
    category: 'Text',
    usage: '.spacedletters <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'spacedletters <text>');
if (t.length > 300) return mzazireply('❌ Keep it to 300 characters.');
return mzazireply(t.split('').join(' '));`,
  },
  {
    name: 'dotsep',
    aliases: ['dotjoin', 'spacedots'],
    description: 'Separate the letters of each word with dots',
    category: 'Text',
    usage: '.dotsep <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'dotsep <text>');
if (t.length > 200) return mzazireply('❌ Keep it to 200 characters.');
const words = t.split(/\\s+/).filter(Boolean);
return mzazireply(words.map(function (w) { return w.split('').join('·'); }).join('  '));`,
  },
  {
    name: 'clap',
    aliases: ['claptext', 'applause'],
    description: 'Put a clap between every word',
    category: 'Text',
    usage: '.clap <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'clap <text>');
const words = t.split(/\\s+/).filter(Boolean);
if (words.length > 40) return mzazireply('❌ Keep it to 40 words.');
return mzazireply(words.join(' 👏 '));`,
  },

  // ── Comparing text ───────────────────────────────────────────────────────
  {
    name: 'levenshtein',
    aliases: ['editdistance', 'distance'],
    description: 'How many edits separate two strings',
    category: 'Text',
    usage: '.levenshtein first | second',
    code: `const raw = (Array.isArray(args) ? args.join(' ') : '');
const parts = raw.split('|');
if (parts.length < 2) return mzazireply('Usage: ' + prefix + 'levenshtein first | second');
const a = parts[0].trim();
const b = parts.slice(1).join('|').trim();
if (a.length > 400 || b.length > 400) return mzazireply('❌ Keep each side to 400 characters or less.');
const m = a.length;
const n = b.length;
let prev = [];
for (let j = 0; j <= n; j++) prev[j] = j;
for (let i = 1; i <= m; i++) {
  const cur = [i];
  for (let j = 1; j <= n; j++) {
    const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
    cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
  }
  prev = cur;
}
return mzazireply('📐 Edit distance: ' + prev[n] + '\\n\\n"' + a + '" → "' + b + '"');`,
  },
  {
    name: 'similarity',
    aliases: ['simscore', 'similarityscore'],
    description: 'How alike two strings are, as a percentage',
    category: 'Text',
    usage: '.similarity first | second',
    code: `const raw = (Array.isArray(args) ? args.join(' ') : '');
const parts = raw.split('|');
if (parts.length < 2) return mzazireply('Usage: ' + prefix + 'similarity first | second');
const a = parts[0].trim();
const b = parts.slice(1).join('|').trim();
if (a.length > 400 || b.length > 400) return mzazireply('❌ Keep each side to 400 characters or less.');
const m = a.length;
const n = b.length;
if (!m && !n) return mzazireply('❌ Both sides are empty.');
let prev = [];
for (let j = 0; j <= n; j++) prev[j] = j;
for (let i = 1; i <= m; i++) {
  const cur = [i];
  for (let j = 1; j <= n; j++) {
    const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
    cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
  }
  prev = cur;
}
const pct = Math.round((1 - prev[n] / Math.max(m, n)) * 100);
return mzazireply('📐 Similarity: ' + pct + '%\\n\\n"' + a + '" vs "' + b + '"');`,
  },
  {
    name: 'palindrome',
    aliases: ['ispalindrome'],
    description: 'Check whether text reads the same backwards',
    category: 'Text',
    usage: '.palindrome <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'palindrome <text>');
const clean = t.toLowerCase().replace(/[^a-z0-9]/g, '');
if (!clean) return mzazireply('❌ Nothing left to check after removing punctuation.');
const rev = clean.split('').reverse().join('');
if (clean === rev) return mzazireply('✅ Yes — "' + t + '" is a palindrome.');
return mzazireply('❌ No — "' + t + '" backwards is "' + t.split('').reverse().join('') + '".');`,
  },
  {
    name: 'piglatin',
    aliases: ['pig'],
    description: 'Translate text into Pig Latin',
    category: 'Text',
    usage: '.piglatin <text>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'piglatin <text>');
const vowels = 'aeiouAEIOU';
const out = t.split(/\\s+/).filter(Boolean).map(function (w) {
  if (vowels.indexOf(w.charAt(0)) !== -1) return w + 'way';
  let i = 0;
  while (i < w.length && vowels.indexOf(w.charAt(i)) === -1) i++;
  if (i === w.length) return w + 'ay';
  return w.slice(i) + w.slice(0, i) + 'ay';
}).join(' ');
return mzazireply('🐷 ' + out);`,
  },
  {
    name: 'nato',
    aliases: ['phonetic', 'spellout'],
    description: 'Spell text with the NATO phonetic alphabet',
    category: 'Text',
    usage: '.nato <word or phrase>',
    code: `const t = (Array.isArray(args) ? args.join(' ') : '').trim();
if (!t) return mzazireply('Usage: ' + prefix + 'nato <word or phrase>');
const map = { A: 'Alfa', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot', G: 'Golf',
  H: 'Hotel', I: 'India', J: 'Juliett', K: 'Kilo', L: 'Lima', M: 'Mike', N: 'November', O: 'Oscar',
  P: 'Papa', Q: 'Quebec', R: 'Romeo', S: 'Sierra', T: 'Tango', U: 'Uniform', V: 'Victor',
  W: 'Whiskey', X: 'X-ray', Y: 'Yankee', Z: 'Zulu', '0': 'Zero', '1': 'One', '2': 'Two',
  '3': 'Three', '4': 'Four', '5': 'Five', '6': 'Six', '7': 'Seven', '8': 'Eight', '9': 'Niner' };
const chars = t.toUpperCase().replace(/[^A-Z0-9]/g, '').split('');
if (!chars.length) return mzazireply('❌ Nothing to spell after removing punctuation.');
if (chars.length > 120) return mzazireply('❌ Keep it to 120 letters or digits.');
return mzazireply('📻 ' + chars.map(function (c) { return map[c]; }).join(' '));`,
  },
];
