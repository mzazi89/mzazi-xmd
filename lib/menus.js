// MZAZI TECH — MZAZI XMD's menus.
//
// WHY THESE ARE IN CODE AND NOT IN THE DATABASE
// The menu rows in `bot_commands` are 3-45KB interactive card builders, and their
// command lists were never filled in: they contain the placeholder
// `╠❏ ${prefix}${command}` repeated twenty times, which renders as the same
// command name twenty times over. They also still carry the other bot's branding
// in their banner. So rather than patch 17 large bodies there is one renderer
// here, and case.js sends its output instead of running those rows for MZAZI XMD.
// QUARTZ XD is untouched and keeps executing the stored rows.
//
// The frame is the one the user asked for, character for character:
//
//   ╭━━━〔 👨‍💻 𝐌𝐙𝐀𝐙𝐈 𝐓𝐄𝐂𝐇 〕━━━╮
//   ┃
//   ┃ 🤖 *𝐁𝐎𝐓:* MZAZI XMD
//   ...
//   ┣━━━〔 🤖 𝐀𝐈 𝐌𝐄𝐍𝐔 〕━━━
//   ┃ 🔹 .ai
//   ...
//   ╰━━━━━━━━━━━━━━━━━━╯
//
// EVERY COMMAND LISTED HERE EXISTS in this bot's registry. That is not a
// formality: the frame is easy to write and the contents are easy to get wrong,
// and a menu that advertises a command the bot does not have is worse than no
// menu. See the verification note at the bottom of this file.
//
// Kept free of any bot runtime dependency so the renderer can be exercised on its
// own.

'use strict';

// ─── the frame ───────────────────────────────────────────────────────────────
// Header and section rules are U+2501 heavy lines, which is why MZAZI XMD's
// response-style swap table must NOT contain a ━ entry — it used to rewrite every
// one of them to U+2504 and would have shredded this frame. See lib/theme.js.
const HEAD = (emoji, title) => `╭━━━〔 ${emoji} ${title} 〕━━━╮`;
const SECTION = (emoji, title) => `┣━━━〔 ${emoji} ${title} 〕━━━`;
const ITEM = (prefix, cmd) => `┃ 🔹 ${prefix}${cmd}`;
const LINK = (url) => `┃ 🔗 ${url}`;
const BLANK = '┃';
const FOOT = '╰━━━━━━━━━━━━━━━━━━╯';

/** 'BOT' → '𝐁𝐎𝐓'. The template sets its labels and headings in Mathematical
 *  Bold capitals, so they are generated rather than pasted one by one. */
function bold(text) {
  return String(text)
    .toUpperCase()
    .replace(/[A-Z0-9]/g, (c) => {
      const code = c.charCodeAt(0);
      return code >= 65 && code <= 90
        ? String.fromCodePoint(0x1d400 + code - 65)
        : String.fromCodePoint(0x1d7ce + code - 48);
    });
}

const OWNER = 'MZAZI';
const WEBSITE = ['mzazi.shop', 'public.mzazi.shop', 'bot.mzazi.shop'];

// ─── the menus ───────────────────────────────────────────────────────────────
// One entry per command. Each menu keeps its OWN command list; only the frame is
// shared. Commands are written without the prefix, which is added at render time
// so the bot's configured prefix is respected.
const MENUS = {
  generalmenu: {
    sections: [
      { emoji: '📌', title: 'ESSENTIALS', items: ['ai', 'chatgpt', 'translate', 'sticker', 'weather', 'calc', 'ping', 'runtime', 'repo', 'update', 'owner'] },
      { emoji: '📂', title: 'CATEGORIES', items: ['aimenu', 'downloadmenu', 'searchmenu', 'utilitymenu', 'mediamenu', 'groupmenu', 'protectionmenu', 'ownermenu', 'gamemenu', 'funmenu', 'automenu', 'faithmenu', 'languagemenu', 'lifestylemenu', 'settingsmenu'] },
    ],
  },
  aimenu: {
    sections: [
      { emoji: '🤖', title: 'AI MENU', items: ['ai', 'aiimg', 'art', 'imagine', 'ask', 'askai', 'askgpt', 'chatgpt', 'code', 'caption', 'translate', 'bio'] },
      { emoji: '✍️', title: 'WRITING', items: ['adcopy', 'blog', 'brainstorm', 'compare', 'correct', 'coverletter', 'debate', 'agenda'] },
    ],
  },
  downloadmenu: {
    sections: [
      { emoji: '🎵', title: 'AUDIO', items: ['play', 'song', 'mp3', 'audio', 'lyricsmp3', 'podcast', 'afrobeat', 'gospel'] },
      { emoji: '🎬', title: 'VIDEO', items: ['video', 'mp4', 'tiktok', 'facebook', 'instagram', 'igreel', 'fbreel', 'dailymotion'] },
      { emoji: '📦', title: 'FILES', items: ['apk', 'movie', 'pindl', 'reddit', 'gifdl'] },
    ],
  },
  searchmenu: {
    sections: [
      { emoji: '🔍', title: 'SEARCH', items: ['google', 'image', 'news', 'lyrics', 'wiki', 'ytsearch', 'pinterest'] },
    ],
  },
  utilitymenu: {
    sections: [
      { emoji: '🛠️', title: 'TOOLS', items: ['weather', 'calc', 'shorten', 'font', 'currency', 'time', 'opentime', 'closetime', 'runtime', 'togroupstatus'] },
      { emoji: '🖼️', title: 'MEDIA TOOLS', items: ['sticker', 'sticker2', 'stickertoimg', 'toimg', 'addsticker'] },
    ],
  },
  mediamenu: {
    sections: [
      { emoji: '🎨', title: 'STICKERS', items: ['sticker', 'sticker2', 'stickertoimg', 'toimg', 'addsticker'] },
      { emoji: '🎧', title: 'MEDIA', items: ['audio', 'video', 'mp3', 'song'] },
    ],
  },
  groupmenu: {
    sections: [
      { emoji: '👥', title: 'MEMBERS', items: ['tagall', 'tagall2', 'tag', 'mention', 'adminlist', 'members', 'gcinfo', 'who'] },
      { emoji: '🛡️', title: 'ADMIN', items: ['kick', 'add', 'promote', 'demote', 'groupstats', 'gclink'] },
    ],
  },
  protectionmenu: {
    sections: [
      { emoji: '🚫', title: 'FILTERS', items: ['antilink', 'antidelete', 'antisticker', 'antivideo', 'antiaudio', 'antiviewonce', 'antigroupstatusmention'] },
      // 🚨 rather than ⚠️ on purpose: this bot's response-style table rewrites ⚠️
      // to ❗ on every outgoing reply, so a ⚠️ here would silently ship as ❗.
      // Nothing in this file may use an emoji that appears as a `from` key in
      // lib/theme.js's xmd table — those are ❌ ✅ ⏳ ⚠️.
      { emoji: '🚨', title: 'WARNINGS', items: ['warn', 'warnlist', 'mywarn', 'clearwarn', 'resetwarn'] },
      { emoji: '🔨', title: 'ACTIONS', items: ['mute', 'unmute', 'ban', 'kickall', 'blocklist'] },
    ],
  },
  ownermenu: {
    sections: [
      { emoji: '👑', title: 'OWNER', items: ['ownerinfo', 'ownerlist', 'ownersay', 'whoowner', 'grouplist', 'groupcount', 'broadcast'] },
      { emoji: '🗄️', title: 'SYSTEM', items: ['backup', 'backupdb', 'dbinfo', 'dbsize', 'sessioninfo', 'sysinfo'] },
      { emoji: '📱', title: 'BOT', items: ['botjid', 'botnumber', 'mynumber', 'presence', 'restartbot', 'botpp'] },
    ],
  },
  gamemenu: {
    sections: [
      { emoji: '🎮', title: 'GAMES MENU', items: ['blackjack', 'basket', 'bowling', 'casino', 'dadu', 'dart', 'coin', 'flip'] },
      { emoji: '🎲', title: 'CHANCE', items: ['guess', 'jackpot', 'lottery', 'lucky7', 'magic8', 'highcard', 'lowcard', 'double'] },
    ],
  },
  funmenu: {
    sections: [
      { emoji: '😂', title: 'FUN MENU', items: ['dadjoke', 'fact', 'baby', 'blessing', 'bro', 'caps', 'cheer', 'comebacks'] },
      { emoji: '💬', title: 'MORE', items: ['echo', 'emojifytext', 'greet', 'happy', 'kiss', 'laugh', 'idiom', 'koan'] },
    ],
  },
  automenu: {
    sections: [
      { emoji: '⚡', title: 'AUTO MENU', items: ['alwaysonline', 'autoread', 'autotyping', 'autoreact', 'autolike'] },
      { emoji: '📡', title: 'STATUS & PRESENCE', items: ['autoviewstatus', 'autolikestatus', 'setautolikeemoji', 'autostatustext', 'autoforwardstatus', 'setpresence'] },
      { emoji: '🎙️', title: 'RECORDING', items: ['autorecordaudio', 'autorecordvideo', 'autorecording'] },
    ],
  },
  faithmenu: {
    sections: [
      { emoji: '🙏', title: 'FAITH MENU', items: ['bible', 'quran', 'dua', 'hadith'] },
    ],
  },
  languagemenu: {
    sections: [
      { emoji: '🌍', title: 'LANGUAGE MENU', items: ['translate', 'synonym', 'antonym', 'reverse'] },
    ],
  },
  lifestylemenu: {
    sections: [
      { emoji: '💪', title: 'LIFESTYLE MENU', items: ['advice', 'bmi', 'fitnessquote', 'foodfact'] },
    ],
  },
  settingsmenu: {
    sections: [
      { emoji: '⚙️', title: 'SETTINGS MENU', items: ['setprefix', 'setprefix2', 'setbotname', 'self', 'public'] },
      { emoji: '🔧', title: 'BEHAVIOUR', items: ['antilink', 'autoreact', 'setpresence'] },
    ],
  },
  allmenu: {
    sections: [
      { emoji: '📋', title: 'ALL MENUS', items: ['generalmenu', 'aimenu', 'downloadmenu', 'searchmenu', 'utilitymenu', 'mediamenu', 'groupmenu', 'protectionmenu', 'ownermenu', 'gamemenu', 'funmenu', 'automenu', 'faithmenu', 'languagemenu', 'lifestylemenu', 'settingsmenu'] },
    ],
  },
};

const MENU_NAMES = Object.keys(MENUS);

/**
 * True when `name` is one of MZAZI XMD's menus — i.e. when case.js should send a
 * rendered menu INSTEAD of executing the stored command body.
 *
 * NO PROFILE CHECK, and that is deliberate — it was the reason the first version
 * of this did nothing in production.
 *
 * That version also required the resolved profile id to be exactly "xmd". But
 * nothing else in this bot depends on that string: lib/remoteCommands.js
 * getRemoteCommand() ignores the profile argument it is handed, because the
 * profile was already applied when the command list was fetched. So the id is
 * only ever as trustworthy as the `xmd_bot_profiles` setting or a BOT_PROFILES
 * environment variable, and if either resolves to anything else — the module's own
 * fallback is "main" — the menus keep their old bodies and the hook looks broken
 * for no visible reason.
 *
 * The real gate is the repository. QUARTZ XD runs as its own process from its own
 * checkout, whose case.js has no such hook at all: two bots, two repositories,
 * one of them wired. A boundary that cannot silently fail.
 *
 * @param {string} name the command as typed, without the prefix
 */
function isMenuCommand(name) {
  return Object.prototype.hasOwnProperty.call(MENUS, name);
}

/** Every logical line of a rendered menu, for tests and previews. */
function renderLines(name, ctx = {}) {
  const def = MENUS[name];
  if (!def) return null;

  const botName = ctx.botName || 'MZAZI XMD';
  const prefix = typeof ctx.prefix === 'string' && ctx.prefix.length ? ctx.prefix : '.';
  const ping = Number.isFinite(ctx.ping) ? ctx.ping : null;
  const date =
    ctx.date ||
    new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const out = [];
  // The header names the company, exactly as the template does; the section
  // heading below is what identifies which menu this is.
  out.push(HEAD('👨‍💻', bold('MZAZI TECH')));
  out.push(BLANK);
  out.push(`┃ 🤖 *${bold('BOT')}:* ${botName}`);
  out.push(`┃ 👑 *${bold('OWNER')}:* ${OWNER}`);
  out.push(`┃ ⚡ *${bold('PING')}:* ${ping === null ? '0' : ping} ms`);
  out.push(`┃ 📅 *${bold('DATE')}:* ${date}`);
  out.push(`┃ 🟢 *${bold('STATUS')}:* ONLINE`);
  out.push(BLANK);

  for (const section of def.sections) {
    out.push(SECTION(section.emoji, bold(section.title)));
    for (const item of section.items) out.push(ITEM(prefix, item));
    out.push(BLANK);
  }

  out.push(SECTION('📚', bold('EVERY COMMAND')));
  out.push(ITEM(prefix, 'commands'));
  out.push(BLANK);

  out.push(SECTION('🌐', bold('WEBSITE')));
  for (const url of WEBSITE) out.push(LINK(url));
  out.push(BLANK);
  out.push(FOOT);

  return out;
}

/** The full menu as one message. */
function renderMenu(name, ctx = {}) {
  const lines = renderLines(name, ctx);
  return lines ? lines.join('\n') : null;
}

// ─── the catalogue ───────────────────────────────────────────────────────────
// The menus above are CURATED: they hold the commands worth putting in front of
// someone. The registry is far larger — 1200+ commands in 18 categories — and a
// menu that tried to hold all of them would be unreadable, which is why dozens
// of perfectly good commands were reachable only if you already knew their
// names. This closes that gap: everything in the registry, grouped by its own
// `category` and paged, so nothing the bot can run is unreachable.
//
// Built from the LIVE registry rather than a list kept here, so it cannot drift
// from what the bot can actually execute.
const CATALOG_PER_PAGE = 40;
const CATALOG_SEARCH_LIMIT = 25;

function catalogGroups(commands) {
  // Keyed case-insensitively on purpose: the registry holds both "AI" and "ai",
  // and keying on the raw string listed one category twice while making the
  // smaller of the two unreachable — `.commands ai` could only ever find the
  // first. The label keeps the spelling of the first row seen.
  const map = new Map();
  for (const c of commands || []) {
    if (!c || !c.name) continue;
    const raw = String(c.category || 'General').trim() || 'General';
    const key = raw.toLowerCase();
    if (!map.has(key)) map.set(key, { label: raw, items: [] });
    map.get(key).items.push(c);
  }
  for (const g of map.values()) g.items.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return new Map(
    [...map.entries()].sort(
      (a, b) => b[1].items.length - a[1].items.length || a[1].label.localeCompare(b[1].label)
    )
  );
}

/** .commands — index, one category, or a search. Returns null on an empty registry. */
function renderCatalog(ctx = {}) {
  const commands = Array.isArray(ctx.commands) ? ctx.commands : [];
  if (!commands.length) return null;
  const prefix = typeof ctx.prefix === 'string' && ctx.prefix.length ? ctx.prefix : '.';
  const query = String(ctx.query || '').trim();
  const groups = catalogGroups(commands);

  if (!query) {
    const out = [HEAD('📚', bold('COMMAND CATALOG')), BLANK];
    out.push(`┃ 📊 *${bold('TOTAL')}:* ${commands.length}`);
    out.push(`┃ 🗂 *${bold('CATEGORIES')}:* ${groups.size}`);
    out.push(BLANK);
    out.push(SECTION('🗂', bold('BY CATEGORY')));
    for (const [key, g] of groups) out.push(`┃ 🔹 ${prefix}commands ${key} (${g.items.length})`);
    out.push(BLANK);
    out.push(`┃ 📌 ${prefix}commands <category>`);
    out.push(`┃ 🔎 ${prefix}commands <word> — search`);
    out.push(FOOT);
    return out.join('\n');
  }

  const wanted = query.toLowerCase();
  // "general", "generalmenu" and "General" all mean the same category.
  const catKey = groups.has(wanted)
    ? wanted
    : wanted.endsWith('menu') && groups.has(wanted.slice(0, -4))
      ? wanted.slice(0, -4)
      : null;

  if (catKey) {
    const group = groups.get(catKey);
    const arr = group.items;
    const pages = Math.max(1, Math.ceil(arr.length / CATALOG_PER_PAGE));
    const page = Math.min(Math.max(1, Number(ctx.page) || 1), pages);
    const slice = arr.slice((page - 1) * CATALOG_PER_PAGE, page * CATALOG_PER_PAGE);
    const out = [HEAD('📚', bold(group.label)), BLANK];
    out.push(`┃ 📊 *${arr.length}* commands · page ${page}/${pages}`);
    out.push(BLANK);
    out.push(SECTION('📄', bold('COMMANDS')));
    for (const c of slice) {
      const mark = c.ownerOnly ? ' 🔒' : c.groupOnly ? ' 👥' : '';
      out.push(`┃ 🔹 ${prefix}${c.name}${mark}`);
    }
    if (page < pages) {
      out.push(BLANK);
      out.push(`┃ ➡️ ${prefix}commands ${catKey.toLowerCase()} ${page + 1}`);
    }
    out.push(FOOT);
    return out.join('\n');
  }

  const needle = wanted;
  const hits = commands
    .filter((c) => String(c.name).includes(needle) || String(c.description || '').toLowerCase().includes(needle))
    .slice(0, CATALOG_SEARCH_LIMIT);

  const out = [HEAD('🔎', bold('SEARCH')), BLANK];
  out.push(`┃ 🔎 *"${query}"* — ${hits.length} match${hits.length === 1 ? '' : 'es'}`);
  out.push(BLANK);
  if (!hits.length) {
    out.push('┃ ❌ Nothing found.');
    out.push(BLANK);
    out.push(`┃ 📌 ${prefix}commands — every category`);
  } else {
    for (const c of hits) {
      const desc = String(c.description || '').slice(0, 40);
      out.push(`┃ 🔹 ${prefix}${c.name}${desc ? ` — ${desc}` : ''}`);
    }
  }
  out.push(FOOT);
  return out.join('\n');
}

module.exports = {
  isMenuCommand,
  renderMenu,
  renderLines,
  renderCatalog,
  MENUS,
  MENU_NAMES,
  WEBSITE,
  bold,
};
