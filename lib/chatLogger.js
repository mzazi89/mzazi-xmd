// ─────────────────────────────────────────────────────────────────────────────
// lib/chatLogger.js — the console the operator actually watches.
//
// Every inbound message prints a card before it is dispatched: who, which chat,
// what kind, what it said. Content is governed by LOG_MESSAGE_CONTENT:
//
//      preview  (default)  first LOG_PREVIEW_CHARS characters (180)
//      full                the whole thing
//      off                 metadata only — who, where, what kind; no words
//
// `true` is accepted as an alias of `full` for older deployments.
//
// ── why the layout is computed, not hard-coded ───────────────────────────────
//
// The console people actually read is a phone: the Pterodactyl console pane is
// about 52 characters wide. A fixed 62-character box wraps there, which tears the
// right border off every card and turns one message into four lines of rubble.
//
// So the width is resolved once (LOG_WIDTH → stdout.columns → 56), and every
// field is measured in grapheme clusters rather than code points. That matters
// for exactly the strings a WhatsApp bot sees: "🤷🏾‍♂️" is five code points and one
// visible glyph, and counting it as five is what pushed the borders out of line.
//
// Nothing is allowed to wrap except the message body, and nothing is allowed to
// exceed the box: long names, quoted text and group titles are truncated with an
// ellipsis instead.
// ─────────────────────────────────────────────────────────────────────────────

// No dependencies on purpose: this module is required during startup, before
// anything else has had a chance to fail, so it must not be able to throw on a
// missing package. Colours are plain ANSI and are switched off by NO_COLOR or
// FORCE_COLOR=0, which is what CI and piped output want.
const COLOR = process.env.NO_COLOR === undefined && process.env.FORCE_COLOR !== '0';
const tint = (open) => (text) => (COLOR ? `\x1b[${open}m${text}\x1b[0m` : String(text));
const rgb = (r, g, b) => (text) => (COLOR ? `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m` : String(text));

const colors = {
  reset: '\x1b[0m',
  bright: tint('1'),
  dim: tint('2'),
  green: tint('32'),
  red: tint('31'),
  yellow: tint('33'),
  blue: tint('34'),
  magenta: tint('35'),
  cyan: tint('36'),
  white: tint('37'),
  gray: tint('90'),
  whatsapp: tint('36'),
  success: (t) => `${COLOR ? '\x1b[32m' : ''}✓ ${t}${COLOR ? '\x1b[0m' : ''}`,
  error: (t) => `${COLOR ? '\x1b[31m' : ''}✗ ${t}${COLOR ? '\x1b[0m' : ''}`,
  warning: (t) => `${COLOR ? '\x1b[33m' : ''}⚠ ${t}${COLOR ? '\x1b[0m' : ''}`,
  info: (t) => `${COLOR ? '\x1b[34m' : ''}ℹ ${t}${COLOR ? '\x1b[0m' : ''}`,
};

const c = {
  iris: rgb(139, 148, 255),
  mint: rgb(126, 231, 190),
  peach: rgb(255, 190, 130),
  sky: rgb(130, 200, 255),
  rose: rgb(255, 150, 170),
  ash: rgb(130, 136, 150),
  bone: rgb(228, 232, 240),
  gold: rgb(242, 193, 78),
};

let BOT_NAME = 'MZAZI XMD';
const setBotName = (name) => { if (name) BOT_NAME = name; };

// ── policy ───────────────────────────────────────────────────────────────────
const RAW_MODE = String(process.env.LOG_MESSAGE_CONTENT || 'preview').toLowerCase();
const MODE = RAW_MODE === 'true' ? 'full' : ['full', 'preview', 'off'].includes(RAW_MODE) ? RAW_MODE : 'preview';
const PREVIEW_CHARS = Math.max(0, parseInt(process.env.LOG_PREVIEW_CHARS || '180', 10) || 180);
const STYLE = String(process.env.LOG_STYLE || 'card').toLowerCase() === 'compact' ? 'compact' : 'card';
const logContentEnabled = MODE !== 'off';

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
// The pane people actually read this in is a phone: the Pterodactyl console is
// about 45 characters wide there, and a box one cell too wide wraps and tears the
// border off every card. 44 is the largest that fits that pane with a gutter;
// LOG_WIDTH (or a real TTY's columns) overrides it for a desktop console.
const BOX = clamp(
  parseInt(process.env.LOG_WIDTH || '', 10) || Number(process.stdout?.columns) || Number(process.env.COLUMNS) || 44,
  36,
  78
);

// ── counters (feed the rate in the card footer) ──────────────────────────────
const stats = { total: 0, bySession: new Map(), started: Date.now(), lastAt: 0 };
const rates = [];

function note(stamp) {
  stats.total += 1;
  stats.lastAt = stamp;
  rates.push(stamp);
  while (rates.length > 12) rates.shift();
}
function rate() {
  if (rates.length < 2) return 'first';
  const span = Math.max(1, (rates[rates.length - 1] - rates[0]) / 1000);
  return `${(rates.length / span * 60).toFixed(1)}/min`;
}

// ── text measurement ─────────────────────────────────────────────────────────
const ANSI = /\x1b\[[0-9;]*m/g;
const strip = (s) => String(s).replace(ANSI, '');

const segmenter = (() => {
  try { return new Intl.Segmenter('en', { granularity: 'grapheme' }); } catch { return null; }
})();

/** Grapheme clusters: "🤷🏾‍♂️" is one, not five. */
function clusters(text) {
  const s = strip(text);
  if (segmenter) return [...segmenter.segment(s)].map((x) => x.segment);
  return Array.from(s);
}

const PICTO = /\p{Extended_Pictographic}/u;
const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/;

/** Terminal cells for one cluster. */
function clusterWidth(g) {
  if (!g) return 0;
  if (PICTO.test(g)) return 2;          // emoji, or a ZWJ/flag/skin-tone sequence
  if (WIDE.test(g)) return 2;           // CJK and fullwidth forms
  if (g === '\u200d' || g === '\ufe0f') return 0;
  return 1;
}

const width = (text) => clusters(text).reduce((n, g) => n + clusterWidth(g), 0);

/** Hard-truncate to `n` cells, with an ellipsis when something was cut. */
function fit(text, n) {
  if (n <= 1) return '';
  if (width(text) <= n) return String(text);
  let out = '';
  let used = 0;
  for (const g of clusters(text)) {
    const w = clusterWidth(g);
    if (used + w > n - 1) break;
    out += g;
    used += w;
  }
  return `${out}…`;
}

/** Wrap on spaces, never past `n` cells, never emitting an empty line. */
function wrap(text, n) {
  const out = [];
  if (n <= 2) return out;
  for (const paragraph of String(text).split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (width(candidate) <= n) { line = candidate; continue; }
      if (line) out.push(line);
      if (width(word) <= n) { line = word; continue; }
      // A single unbroken token (a URL, a long number): cut it across lines.
      let rest = word;
      while (width(rest) > n) {
        let piece = '';
        let used = 0;
        for (const g of clusters(rest)) {
          const w = clusterWidth(g);
          if (used + w > n) break;
          piece += g;
          used += w;
        }
        out.push(piece);
        rest = rest.slice(piece.length);
      }
      line = rest;
    }
    if (line) out.push(line);
  }
  return out;
}

const clockFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: process.env.LOG_TIMEZONE || 'Africa/Nairobi',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});
const clock = () => clockFmt.format(new Date());
const shortJid = (jid) => String(jid || '').split('@')[0];

/**
 * Phone numbers get spaced, ids do not.
 *
 * WhatsApp's newer identifiers are not phone numbers — group ids begin 120363…,
 * a LID is an opaque handle — and formatting those as "+120 363 419 213 983 105"
 * invents a country code and overflows the card.
 */
const prettyNumber = (n) => {
  const raw = String(n || '').trim();
  if (!raw) return 'unknown';
  if (raw.length > 13 || raw.startsWith('120363') || /@(lid|g\.us)$/.test(raw)) {
    return `id ${raw.replace(/@.*$/, '')}`;
  }
  const d = raw.replace(/\D/g, '');
  if (d.length < 9) return d || 'unknown';
  return `+${d.slice(0, 3)} ${d.slice(3).replace(/(\d{3})(?=\d)/g, '$1 ')}`.trim();
};

// ── message shape ────────────────────────────────────────────────────────────
const unwrap = (message) => {
  if (!message) return {};
  if (message.ephemeralMessage) return unwrap(message.ephemeralMessage.message);
  if (message.viewOnceMessage) return unwrap(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2) return unwrap(message.viewOnceMessageV2.message);
  if (message.documentWithCaptionMessage) return unwrap(message.documentWithCaptionMessage.message);
  return message;
};

const KINDS = {
  conversation: { icon: '💬', label: 'text', tint: c.sky },
  extendedTextMessage: { icon: '💬', label: 'text', tint: c.sky },
  imageMessage: { icon: '🖼️', label: 'image', tint: c.mint },
  videoMessage: { icon: '🎬', label: 'video', tint: c.rose },
  audioMessage: { icon: '🎙️', label: 'audio', tint: c.peach },
  pttMessage: { icon: '🎙️', label: 'voice', tint: c.peach },
  stickerMessage: { icon: '🧸', label: 'sticker', tint: c.peach },
  documentMessage: { icon: '📎', label: 'document', tint: c.iris },
  locationMessage: { icon: '📍', label: 'location', tint: c.gold },
  liveLocationMessage: { icon: '📡', label: 'live location', tint: c.gold },
  contactMessage: { icon: '👤', label: 'contact', tint: c.iris },
  contactsArrayMessage: { icon: '👥', label: 'contacts', tint: c.iris },
  pollCreationMessage: { icon: '📊', label: 'poll', tint: c.mint },
  pollCreationMessageV2: { icon: '📊', label: 'poll', tint: c.mint },
  pollCreationMessageV3: { icon: '📊', label: 'poll', tint: c.mint },
  reactionMessage: { icon: '✨', label: 'reaction', tint: c.gold },
  buttonsResponseMessage: { icon: '🔘', label: 'button', tint: c.sky },
  listResponseMessage: { icon: '📋', label: 'list', tint: c.sky },
  templateButtonReplyMessage: { icon: '🔘', label: 'button', tint: c.sky },
};

function describe(m) {
  const msg = unwrap(m?.message);
  const key = Object.keys(msg)[0] || 'unknown';
  const node = msg[key] || {};
  const kind = KINDS[key] || { icon: '📦', label: key, tint: c.ash };

  let text = '';
  let extra = '';

  if (key === 'conversation') text = msg.conversation || '';
  else if (msg.extendedTextMessage?.text) text = msg.extendedTextMessage.text;
  else if (node.caption) text = node.caption;

  if (key === 'imageMessage' || key === 'videoMessage') {
    const bits = [];
    if (node.width && node.height) bits.push(`${node.width}×${node.height}`);
    if (node.fileLength) bits.push(`${Math.round(Number(node.fileLength) / 1024)} KB`);
    if (key === 'videoMessage' && node.seconds) bits.push(`${node.seconds}s`);
    extra = bits.join(' · ');
  }
  if (key === 'audioMessage' || key === 'pttMessage') {
    const bits = [];
    if (node.seconds) bits.push(`${Number(node.seconds)}s`);
    if (node.ptt || key === 'pttMessage') bits.push('ptt');
    if (node.mimetype) bits.push(String(node.mimetype).split('/').pop());
    extra = bits.join(' · ');
  }
  if (key === 'stickerMessage') {
    extra = [node.isAnimated ? 'animated' : 'static', node.width && `${node.width}×${node.height}`].filter(Boolean).join(' · ');
  }
  if (key === 'documentMessage') {
    extra = [node.fileLength && `${Math.round(Number(node.fileLength) / 1024)} KB`].filter(Boolean).join(' · ');
    if (!text) text = node.fileName || '';
  }
  if (key === 'locationMessage') {
    extra = [node.degreesLatitude?.toFixed(3), node.degreesLongitude?.toFixed(3)].filter(Boolean).join(', ');
    if (node.name) text = node.name;
  }
  if (key.startsWith('pollCreation')) {
    const opts = (node.options || []).map((o) => o.optionName).filter(Boolean);
    extra = `${opts.length} option${opts.length === 1 ? '' : 's'}`;
    text = opts.length ? `${node.name || 'poll'} → ${opts.join(' / ')}` : node.name || '';
  }
  if (key === 'reactionMessage') text = String(node.text || '');
  if (key === 'contactMessage') text = node.displayName || '';
  if (key.endsWith('ResponseMessage')) {
    text = node.selectedButtonId || node.selectedRowId || node.singleSelectReply?.selectedRowId || '';
  }

  const ctx = node.contextInfo || msg.extendedTextMessage?.contextInfo;
  const quoted = ctx?.quotedMessage ? unwrap(ctx.quotedMessage) : null;
  const quotedKey = quoted ? Object.keys(quoted)[0] : null;
  const quotedText = quoted
    ? (quoted.conversation || quoted.extendedTextMessage?.text || quoted[quotedKey]?.caption
      || (quotedKey === 'stickerMessage' ? 'sticker' : quotedKey === 'audioMessage' ? 'voice note'
        : quotedKey === 'imageMessage' ? 'photo' : ''))
    : '';
  const mentions = Array.isArray(ctx?.mentionedJid) ? ctx.mentionedJid.length : 0;

  return {
    key,
    icon: kind.icon,
    label: kind.label,
    tint: kind.tint,
    text: String(text || '').trim(),
    extra,
    quoted: quotedKey ? { key: quotedKey, text: String(quotedText || '').trim() } : null,
    mentions,
  };
}

// ── card renderer ────────────────────────────────────────────────────────────
/**
 * Draw one card at exactly BOX cells.
 *
 *   ╭─ 💬 TEXT #38 · 20:12:59 ────╮
 *   │ 👤 Lydia Rimpem              │
 *   │ ❝ Naado                      │
 *   ╰─ 📱 254797904974 · 12/min ───╯
 *
 * `rows` are already-coloured strings; each is truncated to the inner width, so
 * a row can never wrap and push the border onto the next line. `wrapped` is the
 * one thing allowed to take more than one line (the message body).
 */
function card({ head, rows = [], wrapped = [], footer }) {
  const inner = BOX - 4;
  const line = (content) => `${c.ash('│')} ${content}${' '.repeat(Math.max(0, inner - width(content)))} ${c.ash('│')}`;
  // "╭─" + " label " + dashes + "╮" must total BOX, same as a body line.
  const rule = (label, left, right) => {
    const room = Math.max(2, BOX - 5 - width(label));
    return `${c.ash(left)} ${label} ${c.ash('─'.repeat(room))}${c.ash(right)}`;
  };

  const out = [rule(head, '╭─', '╮')];
  for (const row of rows) {
    if (row) out.push(line(fit(row, inner)));
  }
  for (const block of wrapped) {
    for (const piece of wrap(block, inner - 2)) {
      out.push(line(fit(`${c.ash('❝')} ${c.bone(piece)}`, inner)));
    }
  }
  out.push(rule(footer, '╰─', '╯'));
  return out.join('\n');
}

// ── the main entry point ─────────────────────────────────────────────────────
const NOISE = new Set([
  'protocolMessage', 'senderKeyDistributionMessage', 'messageContextInfo',
  'peerDataOperationRequestMessage', 'keepInChatMessage', 'stickerPackMessage',
  'deviceSentMessage', 'unknown',
]);

function logIncomingMessage({
  senderName,
  senderNumber,
  isGroup,
  groupName,
  messageType,
  text,
  command,
  session,
  memberCount,
  isOwner,
  m,
}) {
  const stamp = Date.now();
  const info = m && m.message
    ? describe(m)
    : {
        key: messageType || 'unknown', icon: '💬', label: messageType || 'message',
        tint: c.sky, text: text || '', extra: '', quoted: null, mentions: 0,
      };
  if (!info.text && text) info.text = String(text);

  // Transport envelopes are not conversation. One dim line, no card, and they do
  // not inflate the message counter.
  if (NOISE.has(info.key)) {
    console.log(
      `${c.ash(clock())} ${c.ash('·')} ${c.ash(info.key)} ${c.ash('from')} ${c.ash(prettyNumber(senderNumber))}`
    );
    return;
  }

  note(stamp);
  stats.bySession.set(session, (stats.bySession.get(session) || 0) + 1);

  const who = fit(senderName || 'Unknown', BOX - 10);
  const number = prettyNumber(senderNumber);
  const where = isGroup ? (groupName || 'group') : 'direct message';
  const whereTag = isGroup ? c.peach(fit(where, BOX - 14)) : c.mint(where);
  const nameTag = c.bone(who);
  const numTag = c.ash(number);

  if (STYLE === 'compact') {
    const preview = MODE === 'off' || !info.text
      ? ''
      : `  ${c.bone(`“${fit(info.text, MODE === 'full' ? 300 : Math.min(PREVIEW_CHARS, 120))}”`)}`;
    console.log(
      `${c.ash(clock())} ${info.tint(info.icon)} ${info.tint(fit(info.label, 9).padEnd(9))} `
      + `${nameTag} ${numTag} ${c.ash('·')} ${whereTag}${command ? ` ${c.gold(`⚡${fit(command, 24)}`)}` : ''}${preview}`
    );
    return;
  }

  const rows = [];
  rows.push(`${c.ash('👤')} ${nameTag}`);
  // The number is its own line only when the name and number cannot share one.
  if (width(`${who} ${number}`) <= BOX - 8) rows[0] = `${c.ash('👤')} ${nameTag} ${c.ash('·')} ${numTag}`;
  else rows.push(`   ${numTag}`);

  rows.push(`${isGroup ? '📍' : '✉️'} ${whereTag}${memberCount ? c.ash(` (${memberCount})`) : ''}`);
  if (command) rows.push(`${c.gold('⚡')} ${c.gold(fit(command, BOX - 8))}`);

  const wrapped = [];
  if (MODE !== 'off' && info.text) {
    wrapped.push(MODE === 'full' ? info.text : fit(info.text, PREVIEW_CHARS));
  } else if (MODE === 'off') {
    rows.push(`${c.ash('🔒')} ${c.ash('content hidden')}`);
  }

  if (info.extra) rows.push(`${c.ash('⚙️')} ${c.ash(fit(info.extra, BOX - 8))}`);
  if (info.quoted) {
    rows.push(`${c.ash('↪')} ${c.ash(`re: “${fit(info.quoted.text || info.quoted.key.replace('Message', ''), BOX - 12)}”`)}`);
  }
  if (info.mentions) rows.push(`${c.ash('＠')} ${c.ash(`${info.mentions} mentioned`)}`);

  const footerBits = [`📱 ${session || 'session'}`, rate()];
  if (isOwner) footerBits.push('owner');

  const head = `${info.icon} ${info.label.toUpperCase()} ${c.ash(`#${stats.total}`)} ${c.ash('·')} ${c.ash(clock())}`;
  console.log(`\n${card({ head, rows, wrapped, footer: c.ash(footerBits.join(' · ')) })}`);
}

// ── group command (kept for compatibility, now a compact line) ───────────────
function logGroupCommand({ groupName, senderName, senderNumber, command }) {
  if (MODE === 'off') return;
  console.log(
    `   ${c.gold('⚡')} ${c.gold(command)} ${c.ash('by')} ${c.bone(senderName || 'Unknown')} `
    + `${c.ash(prettyNumber(senderNumber))} ${c.ash('in')} ${c.peach(fit(groupName || 'group', 22))}`
  );
}

// ── system events ────────────────────────────────────────────────────────────
function logEvent(type, message, data = null) {
  const prefix = c.ash(`[${clock()}]`);
  const map = {
    info: ['ℹ', colors.blue],
    success: ['✓', colors.green],
    warning: ['⚠', colors.yellow],
    error: ['✗', colors.red],
    debug: ['·', colors.gray],
  };
  const [mark, tone] = map[type] || map.info;
  console.log(`${prefix} ${tone(mark)} ${type === 'error' ? colors.red(message) : message}`);
  if (data && process.env.LOG_DEBUG_STACK === '1') console.error(data);
}

const logSystem = (message, type = 'info') => logEvent(type, message);
const logWhatsApp = (message, type = 'info') => logEvent(type, `[WhatsApp] ${message}`);

const divider = () => console.log(colors.whatsapp('─'.repeat(BOX)));

// ── snapshot (used by .stats / shutdown) ─────────────────────────────────────
function logStats() {
  const uptime = Math.round((Date.now() - stats.started) / 1000);
  const perSession = [...stats.bySession.entries()].map(([s, n]) => `${s}:${n}`).join(' ');
  console.log(`\n${card({
    head: `${c.mint('📊')} ${colors.bright('SESSION')}`,
    rows: [
      `${c.ash('messages')} ${c.bone(String(stats.total))} ${c.ash('·')} ${c.ash(rate())}`,
      `${c.ash('uptime')} ${c.bone(`${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`)}`,
      perSession ? `${c.ash('sessions')} ${c.bone(fit(perSession, BOX - 12))}` : '',
    ],
    footer: c.ash('mzazi xmd'),
  })}\n`);
}

// ── logger object + exports ──────────────────────────────────────────────────
const logger = {
  info: (msg) => logEvent('info', msg),
  success: (msg) => logEvent('success', msg),
  warn: (msg) => logEvent('warning', msg),
  error: (msg, data) => logEvent('error', msg, data),
  debug: (msg, data) => logEvent('debug', msg, data),
  system: (msg, type) => logSystem(msg, type),
  whatsapp: (msg, type) => logWhatsApp(msg, type),
  setBotName,
  stats: () => ({ ...stats, bySession: Object.fromEntries(stats.bySession) }),
};

module.exports = {
  colors,
  logContentEnabled,
  logContentMode: MODE,
  logStyle: STYLE,
  logWidth: BOX,
  logger,
  setBotName,
  logIncomingMessage,
  logGroupCommand,
  logEvent,
  logSystem,
  logWhatsApp,
  typeLabel: (messageType) => (KINDS[messageType]?.label || messageType || 'unknown'),
  divider,
  logStats,
  describe,
};
