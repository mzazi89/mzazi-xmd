// ─────────────────────────────────────────────────────────────────────────────
// MZAZI XMD — PHONE MENU (AIRich)
//
// Renders the bot menu as a native "AI Rich" message (mzazibaileys AIRich),
// styled as a phone screen: status bar, screen frame, spec table, app list.
//
// WhatsApp never renders HTML — it renders *this*: rich primitives (text,
// tables, code, media, footer actions, suggestion pills). So the HTML file in
// this folder is the design source, and this module is the same design rebuilt
// out of primitives the client actually paints.
//
//   .test                → main menu (phone screen + 8 categories)
//   .test 3 | .test ai   → category submenu, page 1
//   .test ai 2           → category submenu, page 2
//   .test all            → every category with counts
//   .test <word>         → search names / aliases / descriptions
//
// Every page is also produced as plain markdown, so a client (or an older
// WhatsApp build) that refuses the rich payload still gets the full menu.
// ─────────────────────────────────────────────────────────────────────────────
"use strict";

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "mzaziMenu.data.json");

/** Per-page command rows. Tables stay readable around 30 rows. */
const PAGE_SIZE = 30;

/** Categories, in the order they are shown. `key` matches the registry. */
const CATEGORIES = [
  { key: "General",   emoji: "⚙️",  label: "General",   tag: "core utilities" },
  { key: "AI",        emoji: "🧠",  label: "AI",        tag: "assistants & models" },
  { key: "Group",     emoji: "👥",  label: "Group",     tag: "admin & moderation" },
  { key: "Downloads", emoji: "⬇️",  label: "Downloads", tag: "media & files" },
  { key: "Fun",       emoji: "🎭",  label: "Fun",       tag: "games & banter" },
  { key: "Games",     emoji: "🎮",  label: "Games",     tag: "play & compete" },
  { key: "Owner",     emoji: "👑",  label: "Owner",     tag: "bot control" },
  { key: "Other",     emoji: "🧪",  label: "Other",     tag: "experimental" },
];

let cache = null;

function data() {
  if (cache) return cache;
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const commands = Array.isArray(raw.commands) ? raw.commands : [];
  const byCategory = new Map();
  for (const c of commands) {
    const key = c.c || "General";
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(c);
  }
  for (const list of byCategory.values()) list.sort((a, b) => a.n.localeCompare(b.n));
  cache = { bot: raw.bot || "MZAZI XMD", total: commands.length, commands, byCategory };
  return cache;
}

// ── helpers ──────────────────────────────────────────────────────────────────

const nf = (n) => Number(n).toLocaleString("en-US");

/** Human label for a command: `play` → `Play`, keeps digits/underscores. */
function title(name) {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

/** One line of what a command does, from the registry or its name. */
function describe(c) {
  const d = (c.d || "").trim();
  if (d) return d.replace(/\s+/g, " ");
  const u = (c.u || "").trim();
  if (u) return u.replace(/\s+/g, " ");
  const alias = Array.isArray(c.a) && c.a.length ? ` (${c.a.slice(0, 3).join(", ")})` : "";
  return `${title(c.n)}${alias}`;
}

/** Native rich text truncates poorly — keep cells short. */
function clip(s, max) {
  s = String(s || "");
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

function findCategory(token) {
  const t = String(token || "").trim().toLowerCase();
  if (!t) return null;
  const idx = Number(t);
  if (Number.isInteger(idx) && idx >= 1 && idx <= CATEGORIES.length) return CATEGORIES[idx - 1];
  return CATEGORIES.find((c) => c.key.toLowerCase() === t || c.label.toLowerCase() === t) || null;
}

function categoriesWithCount() {
  const d = data();
  return CATEGORIES.map((c) => ({ ...c, count: (d.byCategory.get(c.key) || []).length }))
    .filter((c) => c.count > 0);
}

/** The phone "screen" — top and bottom rules only, so proportional fonts
 *  cannot break a right border that isn't there. */
function screen(botName, subtitle, right) {
  return [
    "▛▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▜",
    `   📱  ${botName}${right ? "   " + right : ""}`,
    `   ${subtitle}`,
    "▙▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▟",
  ].join("\n");
}

/** Suggestion pills double as the submenu buttons — tapping one sends the
 *  command text, which the bot then resolves like any other message. */
const QUICK = [
  { label: "⚙️ General", cmd: "test general" },
  { label: "🧠 AI", cmd: "test ai" },
  { label: "⬇️ Downloads", cmd: "test downloads" },
  { label: "👑 Owner", cmd: "test owner" },
];

// ── sections ─────────────────────────────────────────────────────────────────

function mainSections(rich, opts) {
  const d = data();
  const cats = categoriesWithCount();
  const botName = opts.botName || d.bot;
  const mode = opts.isGroup ? "GROUP" : opts.isOwner ? "OWNER DM" : "PRIVATE DM";

  rich.addText(
    `*${botName}*  ·  _phone menu_\n` +
    `Hey ${opts.name || "there"} — everything the bot can do, one screen.`
  );

  rich.addFOAText(
    screen(botName, `🟢 ${mode}   ·   ⚡ ${opts.ping ? opts.ping + " ms" : "live"}`, "🔋 100%")
  );

  rich.addTable([
    ["SPEC", "VALUE"],
    ["Commands", nf(d.total)],
    ["Categories", String(cats.length)],
    ["Prefix", opts.prefix || "."],
    ["Profile", "xmd"],
  ]);

  // The app list: number, emoji, label, count. Numbers are the shortcut args.
  const rows = cats.map((c, i) => [
    String(i + 1),
    `${c.emoji} ${c.label}`,
    nf(c.count),
  ]);
  rich.addTable([["#", "MENU", "CMDS"], ...rows]);

  rich.addText(
    `*Open a submenu*\n` +
    cats.map((c, i) => `${i + 1}. ${c.emoji} *${c.label}* — _${c.tag}_`).join("\n") +
    `\n\nTap ▸ \`${opts.prefix || "."}test 1\` … \`${opts.prefix || "."}test ${cats.length}\`, or type a word: \`${opts.prefix || "."}test sticker\``
  );

  try { rich.addSuggest(QUICK.map((q) => `${opts.prefix || "."}${q.cmd}`)); } catch { /* older clients */ }
  try { rich.addFooterAction({ text: "🌐 mzazi.shop", type: "OPEN_URL", url: "https://mzazi.shop" }); } catch { /* optional */ }
  try {
    rich.addSource(["https://mzazi.shop/favicon.ico", "https://mzazi.shop", "MZAZI XMD", "Website & dashboard"]);
  } catch { /* optional */ }
}

function categorySections(rich, opts, category, page) {
  const d = data();
  const all = d.byCategory.get(category.key) || [];
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const p = Math.min(Math.max(1, page), pages);
  const slice = all.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  const botName = opts.botName || d.bot;
  const prefix = opts.prefix || ".";

  rich.addText(
    `*${category.emoji} ${category.label.toUpperCase()}*  ·  _${category.tag}_\n` +
    `${nf(all.length)} commands  ·  page *${p}/${pages}*`
  );

  rich.addFOAText(screen(botName, `📂 ${category.label}   ·   ${nf(all.length)} cmds`, `📄 ${p}/${pages}`));

  rich.addTable([
    ["COMMAND", "WHAT IT DOES"],
    ...slice.map((c) => [`${prefix}${c.n}`, clip(describe(c), 58)]),
  ]);

  const nav = [];
  if (p < pages) nav.push(`${prefix}test ${category.key.toLowerCase()} ${p + 1}`);
  nav.push(`${prefix}test`);
  rich.addText(
    (p < pages
      ? `▸ Next page: \`${prefix}test ${category.key.toLowerCase()} ${p + 1}\`\n`
      : `▸ That's all ${nf(all.length)} ${category.label} commands.\n`) +
    `▸ Back to the phone menu: \`${prefix}test\``
  );

  try { rich.addSuggest(nav); } catch { /* older clients */ }
  try { rich.addFooterAction({ text: "🌐 mzazi.shop", type: "OPEN_URL", url: "https://mzazi.shop" }); } catch { /* optional */ }
}

function allSections(rich, opts) {
  const d = data();
  const cats = categoriesWithCount();
  const prefix = opts.prefix || ".";

  rich.addText(`*ALL MENUS*  ·  ${nf(d.total)} commands in ${cats.length} categories`);
  rich.addFOAText(screen(opts.botName || d.bot, "📚 all commands", `Σ ${nf(d.total)}`));
  rich.addTable([
    ["MENU", "CMDS", "OPEN"],
    ...cats.map((c) => [`${c.emoji} ${c.label}`, nf(c.count), `${prefix}test ${c.key.toLowerCase()}`]),
  ]);
  rich.addText(`▸ Every command, searchable: \`${prefix}test <word>\``);
  try { rich.addSuggest(cats.slice(0, 4).map((c) => `${prefix}test ${c.key.toLowerCase()}`)); } catch { /* optional */ }
}

function searchSections(rich, opts, query) {
  const d = data();
  const q = query.toLowerCase();
  const hits = d.commands.filter((c) => {
    if (c.n.toLowerCase().includes(q)) return true;
    if ((c.a || []).some((a) => String(a).toLowerCase().includes(q))) return true;
    return describe(c).toLowerCase().includes(q);
  });
  const shown = hits.slice(0, PAGE_SIZE);
  const prefix = opts.prefix || ".";

  rich.addText(
    `*SEARCH*  ·  \`${query}\`  ·  ${hits.length ? nf(hits.length) + " match" + (hits.length === 1 ? "" : "es") : "nothing found"}`
  );
  if (!hits.length) {
    rich.addFOAText(screen(opts.botName || d.bot, "🔎 no match", "0"));
    rich.addText(`Try a shorter word, or open the menu with \`${prefix}test\`.`);
    return;
  }
  rich.addTable([
    ["COMMAND", "WHAT IT DOES"],
    ...shown.map((c) => [`${prefix}${c.n}`, clip(describe(c), 58)]),
  ]);
  if (hits.length > shown.length) {
    rich.addText(`_…and ${nf(hits.length - shown.length)} more. Narrow it down with a longer word._`);
  }
  try { rich.addSuggest([`${prefix}test`, `${prefix}test all`]); } catch { /* optional */ }
}

// ── plain-text twin (fallback + tests) ───────────────────────────────────────

function plainMain(opts) {
  const d = data();
  const cats = categoriesWithCount();
  const prefix = opts.prefix || ".";
  return (
    `📱 *${opts.botName || d.bot}*\n` +
    `▛▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▜\n` +
    `   🟢 ${opts.isGroup ? "GROUP" : "PRIVATE"}   ·   ⚡ ${opts.ping || 0} ms\n` +
    `   📦 ${nf(d.total)} commands   ·   ${cats.length} menus\n` +
    `▙▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▟\n\n` +
    cats.map((c, i) => `${i + 1}. ${c.emoji} *${c.label}* — ${nf(c.count)} cmds`).join("\n") +
    `\n\n▸ \`${prefix}test 1\` … \`${prefix}test ${cats.length}\`\n▸ \`${prefix}test <word>\` to search`
  );
}

function plainCategory(opts, category, page) {
  const d = data();
  const all = d.byCategory.get(category.key) || [];
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const p = Math.min(Math.max(1, page), pages);
  const slice = all.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  const prefix = opts.prefix || ".";
  return (
    `${category.emoji} *${category.label.toUpperCase()}* — ${nf(all.length)} cmds (page ${p}/${pages})\n\n` +
    slice.map((c) => `• \`${prefix}${c.n}\` — ${clip(describe(c), 60)}`).join("\n") +
    (p < pages ? `\n\n▸ Next: \`${prefix}test ${category.key.toLowerCase()} ${p + 1}\`` : "") +
    `\n▸ Menu: \`${prefix}test\``
  );
}

// ── entry point ──────────────────────────────────────────────────────────────

function getAIRich() {
  const tries = ["mzazibaileys", "@whiskeysockets/baileys"];
  for (const id of tries) {
    try {
      const mod = require(id);
      const B = mod && (mod.AIRich ? mod : mod.MessageBuilders);
      if (B && B.AIRich) return B.AIRich;
    } catch { /* next */ }
  }
  return null;
}

/**
 * Handle `.test [category|number] [page] | all | <search>`.
 *
 * ctx: { client, jid, args, prefix, botName, name, isGroup, isOwner, ping, quoted }
 * Returns { ok, mode, sections } — never throws, so the caller can just reply.
 */
async function handle(ctx = {}) {
  const { client, jid } = ctx;
  const args = Array.isArray(ctx.args) ? ctx.args.filter(Boolean) : [];
  const opts = {
    prefix: ctx.prefix || ".",
    botName: ctx.botName || data().bot,
    name: ctx.name || "",
    isGroup: !!ctx.isGroup,
    isOwner: !!ctx.isOwner,
    ping: ctx.ping || 0,
  };

  const first = String(args[0] || "").toLowerCase();
  const second = String(args[1] || "");
  const isTextOnly = String(ctx.mode || "").toLowerCase() === "text";

  // ── route ────────────────────────────────────────────────────────────────
  let build, plain, kind;
  const cat = args.length ? findCategory(first) : null;

  if (args.length && cat) {
    const page = Number(second) > 0 ? Number(second) : 1;
    build = (rich) => categorySections(rich, opts, cat, page);
    plain = plainCategory(opts, cat, page);
    kind = `category:${cat.key}:${page}`;
  } else if (first === "all") {
    build = (rich) => allSections(rich, opts);
    plain = allSections2Text(opts);
    kind = "all";
  } else if (args.length && !cat) {
    const query = args.join(" ").trim();
    build = (rich) => searchSections(rich, opts, query);
    plain = searchText(opts, query);
    kind = `search:${query}`;
  } else {
    build = (rich) => mainSections(rich, opts);
    plain = plainMain(opts);
    kind = "main";
  }

  // ── plain path (explicit, or no rich builder available) ──────────────────
  const AIRich = isTextOnly ? null : getAIRich();
  if (!AIRich || !client || !jid) {
    if (client && jid) await client.sendMessage(jid, { text: plain }, ctx.quoted ? { quoted: ctx.quoted } : {});
    return { ok: true, mode: "text", kind };
  }

  // ── rich path ────────────────────────────────────────────────────────────
  const rich = new AIRich(client, { dynamic: true, unsupportedTypeAlert: false });
  build(rich);
  const head = `MZAZI XMD — ${kind}`;

  try {
    // Banner first, when the deployment ships one. A missing or unreadable
    // image must never cost the whole menu, so it is stripped and retried.
    const banner = path.join(__dirname, "..", "media", "menu.jpg");
    if (fs.existsSync(banner)) {
      try {
        const withBanner = new AIRich(client, { dynamic: true, unsupportedTypeAlert: false });
        withBanner.addImage(fs.readFileSync(banner), { width: 1280, height: 720 });
        build(withBanner);
        await withBanner.send(jid, { quoted: ctx.quoted });
        return { ok: true, mode: "rich", kind: head, sections: withBanner.sections.length };
      } catch (e) {
        // fall through to the no-banner build
      }
    }
    await rich.send(jid, { quoted: ctx.quoted });
    return { ok: true, mode: "rich", kind, sections: rich.sections.length };
  } catch (e) {
    // Rich payloads are still rolling out; a refusal must degrade, not fail.
    try {
      await client.sendMessage(jid, { text: plain }, ctx.quoted ? { quoted: ctx.quoted } : {});
      return { ok: true, mode: "text-fallback", kind, error: String(e.message || e) };
    } catch (e2) {
      return { ok: false, mode: "failed", kind, error: String(e2.message || e2) };
    }
  }
}

function allSections2Text(opts) {
  const d = data();
  const cats = categoriesWithCount();
  const prefix = opts.prefix || ".";
  return (
    `📚 *ALL MENUS* — ${nf(d.total)} commands\n\n` +
    cats.map((c) => `${c.emoji} *${c.label}* — ${nf(c.count)}  →  \`${prefix}test ${c.key.toLowerCase()}\``).join("\n")
  );
}

function searchText(opts, query) {
  const d = data();
  const q = query.toLowerCase();
  const hits = d.commands.filter((c) =>
    c.n.toLowerCase().includes(q) ||
    (c.a || []).some((a) => String(a).toLowerCase().includes(q)) ||
    describe(c).toLowerCase().includes(q)
  );
  const prefix = opts.prefix || ".";
  if (!hits.length) return `🔎 No command matches *${query}*.\nTry a shorter word, or \`${prefix}test\`.`;
  return (
    `🔎 *${query}* — ${nf(hits.length)} match${hits.length === 1 ? "" : "es"}\n\n` +
    hits.slice(0, PAGE_SIZE).map((c) => `• \`${prefix}${c.n}\` — ${clip(describe(c), 60)}`).join("\n") +
    (hits.length > PAGE_SIZE ? `\n\n_…and ${nf(hits.length - PAGE_SIZE)} more._` : "")
  );
}

module.exports = { handle, CATEGORIES, PAGE_SIZE, stats: () => ({ total: data().total }) };
