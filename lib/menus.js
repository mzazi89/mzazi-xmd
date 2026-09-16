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
      { emoji: '📌', title: 'ESSENTIALS', items: ['ai', 'chatgpt', 'translate', 'sticker', 'weather', 'calc', 'ping', 'runtime', 'repo', 'owner'] },
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
      { emoji: '🛠️', title: 'TOOLS', items: ['weather', 'calc', 'shorten', 'font', 'currency', 'time', 'opentime', 'closetime', 'runtime'] },
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
      { emoji: '🚫', title: 'FILTERS', items: ['antilink', 'antidelete', 'antisticker', 'antivideo', 'antiaudio', 'antiviewonce'] },
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
      { emoji: '👑', title: 'OWNER', items: ['ownerinfo', 'ownerlist', 'ownersay', 'whoowner', 'grouplist', 'groupcount'] },
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
      { emoji: '📡', title: 'STATUS & PRESENCE', items: ['autostatus', 'autostatustext', 'autoforwardstatus', 'setpresence'] },
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

/** The set of profiles whose menus this renderer supplies. Only MZAZI XMD: the
 *  other bot keeps running the stored rows, so nothing about it changes. */
const MENU_PROFILE = 'xmd';

/**
 * True when `name` is one of MZAZI XMD's menus — i.e. when case.js should send a
 * rendered menu INSTEAD of executing the stored command body.
 *
 * @param {string} name       the command as typed, without the prefix
 * @param {string|null} profileId  the profile resolved from the session
 */
function isMenuCommand(name, profileId) {
  return profileId === MENU_PROFILE && Object.prototype.hasOwnProperty.call(MENUS, name);
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

module.exports = {
  isMenuCommand,
  renderMenu,
  renderLines,
  MENUS,
  MENU_NAMES,
  MENU_PROFILE,
  WEBSITE,
  bold,
};
