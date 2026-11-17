// ─────────────────────────────────────────────────────────────────────────────
// lib/chatLogger.js — the console the operator actually watches.
//
// Two things were wrong with the old logger:
//
//   1. Incoming messages were gated behind LOG_MESSAGE_CONTENT and therefore
//      never printed. The console showed connections and errors, so "is the bot
//      receiving anything?" could not be answered from it.
//   2. What it did print was a pile of unaligned emoji lines with no structure,
//      so a busy group was unreadable.
//
// This version always prints every incoming message as a card: who, where, what
// kind, and what it said. Content is governed by LOG_MESSAGE_CONTENT:
//
//      preview  (default)  first LOG_PREVIEW_CHARS characters (180)
//      full                the whole thing
//      off                 metadata only — who, where, what kind; no words
//
// `true` is accepted as an alias of `full` for the old deployments.
//
// The words belong to real people, and this console is readable by whoever runs
// the server; `off` is the switch for a deployment where that matters.
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
  if (rates.length < 2) return 'first message';
  const span = Math.max(1, (rates[rates.length - 1] - rates[0]) / 1000);
  return `${(rates.length / span * 60).toFixed(1)}/min`;
}

// ── text helpers ─────────────────────────────────────────────────────────────
const visible = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '');

function width(s) {
  let w = 0;
  for (const ch of visible(s)) {
    const cp = ch.codePointAt(0);
    if ((cp >= 0xFE00 && cp <= 0xFE0F) || cp === 0x200D) continue;
    if (
      (cp >= 0x1100 && cp <= 0x115F) || (cp >= 0x2E80 && cp <= 0xA4CF) ||
      (cp >= 0xAC00 && cp <= 0xD7A3) || (cp >= 0xF900 && cp <= 0xFAFF) ||
      (cp >= 0xFE30 && cp <= 0xFE4F) || (cp >= 0xFF00 && cp <= 0xFF60) ||
      (cp >= 0x2600 && cp <= 0x27BF) || (cp >= 0x1F000 && cp <= 0x1FAFF)
    ) w += 2;
    else w += 1;
  }
  return w;
}

const pad = (s, n) => s + ' '.repeat(Math.max(0, n - width(s)));

/** Greedy wrap that keeps breaking on spaces and never loses characters. */
function wrap(text, cols) {
  const out = [];
  for (const paragraph of String(text).split(/\r?\n/)) {
    if (!paragraph.trim()) { out.push(''); continue; }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (width(candidate) <= cols) { line = candidate; continue; }
      if (line) out.push(line);
      let rest = word;
      while (width(rest) > cols) {
        let cut = 0;
        let w = 0;
        for (const ch of rest) {
          const cw = width(ch);
          if (w + cw > cols) break;
          w += cw;
          cut += 1;
        }
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    if (line) out.push(line);
  }
  return out;
}

const TZ = process.env.LOG_TIMEZONE || 'Africa/Nairobi';
const clockFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});
const clock = () => clockFmt.format(new Date());
const shortJid = (jid) => String(jid || '').split('@')[0];
const prettyNumber = (n) => {
  const raw = String(n || '').trim();
  if (!raw) return 'unknown';
  // WhatsApp's newer ids are not phone numbers: group ids start 120363…, and a
  // LID is an opaque 15-digit handle. Formatting those as +120 363 … 105 is a
  // lie that also wraps the card onto a second line.
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
  pttMessage: { icon: '🎙️', label: 'voice note', tint: c.peach },
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
  protocolMessage: { icon: '🧩', label: 'system', tint: c.ash },
  buttonsResponseMessage: { icon: '🔘', label: 'button reply', tint: c.sky },
  listResponseMessage: { icon: '📋', label: 'list reply', tint: c.sky },
  templateButtonReplyMessage: { icon: '🔘', label: 'button reply', tint: c.sky },
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
    if (node.jpegThumbnail) bits.push('thumb');
    extra = bits.join(' · ');
  }
  if (key === 'audioMessage' || key === 'pttMessage') {
    const bits = [];
    if (node.seconds) bits.push(`${Number(node.seconds)}s`);
    if (node.ptt || key === 'pttMessage') bits.push('push-to-talk');
    if (node.mimetype) bits.push(String(node.mimetype).split('/').pop());
    extra = bits.join(' · ');
  }
  if (key === 'stickerMessage') {
    extra = [node.isAnimated ? 'animated' : 'static', node.width && `${node.width}×${node.height}`].filter(Boolean).join(' · ');
  }
  if (key === 'documentMessage') {
    extra = [node.fileName, node.fileLength && `${Math.round(Number(node.fileLength) / 1024)} KB`].filter(Boolean).join(' · ');
    if (!text) text = node.fileName || '';
  }
  if (key === 'locationMessage') {
    extra = [node.degreesLatitude?.toFixed(3), node.degreesLongitude?.toFixed(3)].filter(Boolean).join(', ');
    if (node.name) text = node.name;
  }
  if (key.startsWith('pollCreation')) {
    const opts = (node.options || []).map((o) => o.optionName).filter(Boolean);
    extra = `${opts.length} option${opts.length === 1 ? '' : 's'}`;
    if (opts.length) text = `${node.name || 'poll'} → ${opts.join(' / ')}`;
    else text = node.name || '';
  }
  if (key === 'reactionMessage') {
    text = `${node.text || ''} on ${shortJid(node.key?.id || '')}`.trim();
  }
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
    quoted: quotedKey ? { key: quotedKey, text: String(quotedText || '').trim().slice(0, 80) } : null,
    mentions,
  };
}

// ── card renderer ────────────────────────────────────────────────────────────
function card({ head, rows, footer, tint, width: boxWidth = 62 }) {
  const inner = boxWidth - 4;
  const line = (content) => `${tint('│')} ${pad(content, inner)} ${tint('│')}`;
  const top = `${tint('╭─')} ${head} ${tint('─'.repeat(Math.max(2, inner - width(head) - 1)))}${tint('╮')}`;

  const body = [];
  for (const row of rows) {
    if (!row) continue;
    for (const [i, piece] of wrap(row, inner).entries()) {
      body.push(line(i === 0 ? piece : piece));
    }
  }

  const foot = `${tint('╰─')} ${footer} ${tint('─'.repeat(Math.max(2, inner - width(footer) - 1)))}${tint('╯')}`;
  return [top, ...body, foot].join('\n');
}

// ── the main entry point ─────────────────────────────────────────────────────
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
  note(stamp);
  stats.bySession.set(session, (stats.bySession.get(session) || 0) + 1);

  // The raw Baileys message is the richest source, but callers that only have a
  // parsed body still get a card.
  const info = m && m.message
    ? describe(m)
    : {
        icon: '💬', label: messageType || 'message', tint: c.sky,
        text: text || '', extra: '', quoted: null, mentions: 0,
      };
  if (!info.text && text) info.text = String(text);

  // Key distribution, receipts and protocol envelopes are transport, not
  // conversation. A card each would bury the messages the operator is watching for.
  const NOISE = new Set([
    'protocolMessage', 'senderKeyDistributionMessage', 'messageContextInfo',
    'peerDataOperationRequestMessage', 'keepInChatMessage', 'stickerPackMessage',
    'deviceSentMessage', 'unknown',
  ]);
  if (NOISE.has(info.key)) {
    console.log(`${c.ash(clock())} ${c.ash('·')} ${c.ash(info.key)} ${c.ash('from')} ${c.ash(String(senderNumber || '').replace(/@.*$/, ''))}`);
    return;
  }

  const who = senderName || 'Unknown';
  const number = prettyNumber(senderNumber);
  const where = isGroup ? (groupName || 'group') : 'direct message';
  const whereTag = isGroup ? c.peach(`${where}${memberCount ? ` (${memberCount})` : ''}`) : c.mint(where);
  const nameTag = c.bone(who);
  const numTag = c.ash(number);

  if (STYLE === 'compact') {
    const preview = MODE === 'off' || !info.text
      ? ''
      : `  ${c.bone(`“${clip(info.text, MODE === 'full' ? 400 : PREVIEW_CHARS)}”`)}`;
    console.log(
      `${c.ash(clock())} ${info.tint(info.icon)} ${info.tint(info.label.padEnd(10))} `
      + `${nameTag} ${numTag} ${c.ash('·')} ${whereTag}${command ? ` ${c.gold(`⚡${command}`)}` : ''}${preview}`
    );
    return;
  }

  const rows = [];
  rows.push(`${c.ash('👤')} ${nameTag} ${c.ash('·')} ${numTag}`);
  rows.push(`${isGroup ? '📍' : '✉️'} ${whereTag}${command ? `   ${c.gold(`⚡ ${command}`)}` : ''}`);

  if (MODE !== 'off' && info.text) {
    const shown = MODE === 'full' ? info.text : clip(info.text, PREVIEW_CHARS);
    const trimmed = MODE === 'full' || shown === info.text ? shown : `${shown}…`;
    for (const piece of wrap(trimmed, 54)) rows.push(`${c.ash('❝')} ${c.bone(piece)}`);
  } else if (MODE === 'off') {
    rows.push(`${c.ash('🔒')} ${c.ash('content hidden — LOG_MESSAGE_CONTENT=off')}`);
  }

  if (info.extra) rows.push(`${c.ash('⚙️')} ${c.ash(info.extra)}`);
  if (info.quoted) {
    rows.push(`${c.ash('↪')} ${c.ash(`re ${info.quoted.key.replace('Message', '')}: “${clip(info.quoted.text, 60)}”`)}`);
  }
  if (info.mentions) rows.push(`${c.ash('＠')} ${c.ash(`${info.mentions} mentioned`)}`);

  const footerBits = [`📱 ${session || 'session'}`, rate()];
  if (isOwner) footerBits.push('owner');

  const head = `${info.icon} ${info.label.toUpperCase()} ${c.ash(`#${stats.total}`)} ${c.ash('·')} ${c.ash(clock())}`;

  console.log(`\n${card({
    head,
    rows,
    footer: c.ash(footerBits.join(' · ')),
    tint: info.tint,
  })}`);
}

const clip = (text, n) => (String(text).length > n ? String(text).slice(0, n) : String(text));

// ── group command (kept for compatibility, now a compact line) ───────────────
function logGroupCommand({ groupName, senderName, senderNumber, command }) {
  if (MODE === 'off') return;
  console.log(
    `   ${c.gold('⚡')} ${c.gold(command)} ${c.ash('by')} ${c.bone(senderName || 'Unknown')} `
    + `${c.ash(prettyNumber(senderNumber))} ${c.ash('in')} ${c.peach(groupName || 'group')}`
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
  const [mark, tint] = map[type] || map.info;
  console.log(`${prefix} ${tint(mark)} ${type === 'error' ? colors.red(message) : message}`);
  if (data && process.env.LOG_DEBUG_STACK === '1') console.error(data);
}

const logSystem = (message, type = 'info') => logEvent(type, message);
const logWhatsApp = (message, type = 'info') => logEvent(type, `[WhatsApp] ${message}`);

const divider = () => console.log(colors.whatsapp('─'.repeat(63)));

// ── snapshot (used by .stats / shutdown) ─────────────────────────────────────
function logStats() {
  const uptime = Math.round((Date.now() - stats.started) / 1000);
  const perSession = [...stats.bySession.entries()]
    .map(([s, n]) => `${s}:${n}`)
    .join(' ');
  console.log(`\n${card({
    head: `${c.mint('📊')} ${colors.bright('SESSION')}`,
    rows: [
      `${c.ash('messages')} ${c.bone(String(stats.total))} ${c.ash('·')} ${c.ash(rate())}`,
      `${c.ash('uptime')} ${c.bone(`${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`)}`,
      perSession ? `${c.ash('sessions')} ${c.bone(perSession)}` : '',
    ],
    footer: c.ash('mzazi xmd'),
    tint: c.mint,
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
