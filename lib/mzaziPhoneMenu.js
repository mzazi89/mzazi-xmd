// ─────────────────────────────────────────────────────────────────────────────
// MZAZI XMD — PHONE MENU (AIRich HTML primitive, zero JavaScript)
//
// Sends one self-contained HTML document through AIRich's
// GenAIaeacdsnwHtmlPrimitive: a smartphone mockup (bezel, dynamic island,
// status bar, home indicator) with a lock screen that unlocks, a home screen
// where each app is a submenu, and an app screen that lists that submenu's
// commands.
//
// Design rules that this file follows on purpose:
//   1. NO <script> anywhere. Sandboxed HTML primitives commonly strip or block
//      inline JS; when that happens a JS-built UI renders as an empty page.
//      Every screen here is server-rendered markup and every interaction is a
//      CSS-only radio/label switch.
//   2. NO viewport-relative sizing. The primitive's iframe height is not
//      guaranteed, so `100vh` / `height:100%` chains collapse to 0 px. The
//      device is a fixed-pixel mockup inside a light page.
//   3. The page behind the device is light, so nothing can look like an empty
//      black box even if only a fraction of the document is painted.
//
// The markup lives in phone-menu.template.html; registry data is injected per
// send, so the menu follows bot_commands. If the client refuses the payload the
// command degrades to lib/mzaziMenu.js and then to text — never to silence.
// ─────────────────────────────────────────────────────────────────────────────
"use strict";

const fs = require("fs");
const path = require("path");

const TEMPLATE = path.join(__dirname, "phone-menu.template.html");
const CONNECT_TEMPLATE = path.join(__dirname, "connect-card.template.html");
const DATA = path.join(__dirname, "mzaziMenu.data.json");

/** Keep the document inside a sane size; it is relayed inside a JSON message. */
const MAX_BYTES = 220 * 1024;

const TZ = "Africa/Nairobi";

/** Submenus = apps. Order is the home-grid order. */
const APPS = [
  {
    name: "General",
    color: "#12a06a",
    icon: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  },
  {
    name: "AI",
    color: "#6d5efc",
    icon: '<path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4"/><circle cx="12" cy="12" r="2.7"/>',
  },
  {
    name: "Group",
    color: "#2f7df6",
    icon: '<circle cx="9" cy="9" r="3.1"/><path d="M3.4 19a5.6 5.6 0 0 1 11.2 0"/><path d="M16.2 6.3a3 3 0 0 1 0 5.5M17.8 19a5.7 5.7 0 0 0-2.1-4"/>',
  },
  {
    name: "Downloads",
    color: "#0f97a6",
    icon: '<path d="M12 4v10M7.8 11.2 12 15.4l4.2-4.2M5 19h14"/>',
  },
  {
    name: "Fun",
    color: "#ef6a3d",
    icon: '<circle cx="12" cy="12" r="8.4"/><path d="M8.8 14.1a4 4 0 0 0 6.4 0"/><circle cx="9.3" cy="10" r=".95" fill="#fff" stroke="none"/><circle cx="14.7" cy="10" r=".95" fill="#fff" stroke="none"/>',
  },
  {
    name: "Games",
    color: "#b23ad6",
    icon: '<rect x="3.4" y="8" width="17.2" height="9.6" rx="4.6"/><path d="M8 11.1v3M6.5 12.6h3M15.6 12h.01M17.7 14h.01"/>',
  },
  {
    name: "Owner",
    color: "#d9a13b",
    icon: '<path d="M4 17.5h16M5.2 17.2 3.9 8.4l4.7 3L12 6l3.4 5.4 4.7-3-1.3 8.8"/>',
  },
  {
    name: "Other",
    color: "#64748b",
    icon: '<path d="M4 8.2 12 4l8 4.2v7.6L12 20l-8-4.2z"/><path d="M4 8.2 12 12.4l8-4.2M12 12.4V20"/>',
  },
];

let tplCache = { mtime: 0, text: null };

/** Re-read when the file changes, so editing the template on the server takes
 *  effect on the next menu without restarting the bot. */
function template() {
  const stamp = fs.statSync(TEMPLATE).mtimeMs;
  if (!tplCache.text || stamp !== tplCache.mtime) {
    tplCache = { mtime: stamp, text: fs.readFileSync(TEMPLATE, "utf8") };
  }
  return tplCache.text;
}

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Descriptions carry emoji; a device font without an emoji face renders them
 *  as tofu boxes, so pictographs are stripped before they reach the menu. */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;
/** A CSS string literal, for `content:var(--pf)`. */
const cssString = (s) => "'" + String(s == null ? "." : s).replace(/[\\']/g, "\\$&").replace(/</g, "\\3c ") + "'";

const clean = (s) => String(s == null ? "" : s)
  .replace(EMOJI, " ")
  .replace(/\s+/g, " ")
  .trim();
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);

function commands() {
  const raw = JSON.parse(fs.readFileSync(DATA, "utf8"));
  return Array.isArray(raw.commands) ? raw.commands : [];
}

/** Old compact shape, kept for anything that still imports it. */
function rows(slim = false) {
  const cats = APPS.map((a) => a.name);
  return commands().map((c) => {
    const idx = cats.indexOf(c.c);
    return [
      c.n,
      idx < 0 ? 0 : idx,
      slim ? String(c.d || "").slice(0, 34) : String(c.d || "").slice(0, 72),
      slim ? "" : String(c.u || "").slice(0, 60),
      c.o ? 1 : c.g ? 2 : 0,
    ];
  });
}

function clockNow() {
  try {
    const time = new Date().toLocaleTimeString("en-GB", {
      timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const date = new Date().toLocaleDateString("en-GB", {
      timeZone: TZ, weekday: "long", day: "numeric", month: "long",
    });
    return { time, date };
  } catch {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return { time: `${p(d.getHours())}:${p(d.getMinutes())}`, date: d.toDateString() };
  }
}

/** Commands per screen. The list never scrolls: a sandboxed HTML primitive
 *  swallows inner scroll gestures, so the pages slide sideways instead. */
const PER_PAGE = 15;

/** Descriptions are a single clipped line, so only the short ones are worth
 *  carrying — every byte here goes through the client as one JSON message. */
const DESC_MAX = 0;

const chunk = (list, n) => {
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out.length ? out : [[]];
};

/** One <li> per command: name, then a single clipped description line. */
function rowHtml(c, slim) {
  // The registry repeats the category in front of many descriptions
  // ("AI: Write short ad copy…"), and some only repeat the command name.
  // The line stays a bare name — the description rides in data-d so the tap
  // sheet can show it without costing 299 visible rows of height.
  let d = clean(c.d).replace(/^[A-Za-z]{2,12}:\s*/, "");
  if (d.toLowerCase() === String(c.n).toLowerCase()) d = "";
  if (slim) d = "";
  if (d.length > 110) d = d.slice(0, 109).trimEnd() + "\u2026";
  const tag = c.o ? "\u2605" : c.g ? "\u25c6" : "";
  const u = slim ? "" : esc(String(c.u || "").trim());
  const attrs = (d ? ` data-d="${esc(d)}"` : "") + (u ? ` data-u="${u}"` : "") + (c.o ? ` data-f="owner"` : c.g ? ` data-f="group"` : "");
  return `<li${attrs}>${esc(c.n)}${tag}</li>`;
}

/** Build the app screens: one <section> per submenu, a sliding strip inside. */
function pagesFor(groups, pageCounts, { slim = false, apps = APPS } = {}) {
  return apps.map((app, i) => {
    const list = groups[app.name] || [];
    const pages = chunk(list, PER_PAGE);
    const total = pages.length;

    const slides = pages.map((rows, p) => {
      const rowsHtml = rows.map((c) => rowHtml(c, slim)).join("");
      const prevFor = p === 0 ? "s-home" : `s-a${i}p${p - 1}`;
      const nextFor = p === total - 1 ? `s-a${i}p0` : `s-a${i}p${p + 1}`;
      const nextOff = total === 1 ? " off" : "";
      return (
        `<div class="pg"><ul>${rowsHtml}</ul>` +
        `<div class="b">` +
        `<label class="n" for="${prevFor}">\u2039</label>` +
        `<span class="c"><b>${p + 1}</b>/${total}</span>` +
        `<label class="n nx${nextOff}" for="${nextFor}">\u203a</label>` +
        `</div></div>`
      );
    }).join("");

    pageCounts[i] = total;

    return (
      `<section class="page p-app p-a${i}">` +
      `<header class="ah" style="--c:${app.color}">` +
      `<label class="back" for="s-home" aria-label="Back">&#8249;</label>` +
      `<div><h2>${esc(app.name)}</h2><p>${list.length} COMMAND${list.length === 1 ? "" : "S"} \u00b7 ${total} PAGE${total === 1 ? "" : "S"}</p></div>` +
      `<span class="sq"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${app.icon}</svg></span>` +
      `</header>` +
      `<div class="abody"><div class="strip s${i}">${slides}</div></div>` +
      `</section>`
    );
  }).join("");
}

function tilesFor(groups, apps = APPS) {
  return apps.map((app, i) => {
    const n = (groups[app.name] || []).length;
    return (
      `<label class="tile" for="s-a${i}p0">` +
      `<span class="ic" style="--c:${app.color}">` +
      `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${app.icon}</svg>` +
      `</span><b>${esc(app.name)}</b><i>${n}</i></label>`
    );
  }).join("");
}

function radiosFor(pageCounts, apps = APPS) {
  const out = [];
  apps.forEach((_, i) => {
    for (let p = 0; p < pageCounts[i]; p++) {
      out.push(`<input class="sw" type="radio" name="sc" id="s-a${i}p${p}">`);
    }
  });
  return out.join("");
}

/** The CSS that wires radios to screens and slides each app's strip. */
function pageCss(pageCounts, apps = APPS) {
  const parts = [];
  apps.forEach((_, i) => {
    const vis = [];
    for (let p = 0; p < pageCounts[i]; p++) {
      vis.push(`#s-a${i}p${p}:checked ~ .screen .p-a${i}`);
      if (p) parts.push(`#s-a${i}p${p}:checked ~ .screen .p-a${i} .s${i}{transform:translateX(-${p * 100}%)}`);
    }
    parts.push(`${vis.join(",")}{opacity:1;transform:none;pointer-events:auto;z-index:3}`);
  });
  return parts.join("");
}

function buildHtml({ prefix = ".", botName = "MZAZI XMD", slim = false } = {}) {
  const all = commands();
  const groups = {};
  for (const app of APPS) groups[app.name] = [];
  for (const c of all) {
    const key = APPS.some((a) => a.name === c.c) ? c.c : "Other";
    groups[key].push(c);
  }

  const { time, date } = clockNow();
  const total = all.length;
  const count = total.toLocaleString("en-US");

  // A category that lost every row (e.g. the misc "Other" bucket) must not keep
  // an empty app tile or page behind.
  const apps = APPS.filter((a) => (groups[a.name] || []).length > 0);
  const pageCounts = apps.map(() => 1);
  const pages = pagesFor(groups, pageCounts, { slim, apps });
  const radios = radiosFor(pageCounts, apps);
  const tiles = tilesFor(groups, apps);

  const html = template()
    .replace("__TIME__", esc(time))
    .replace(/__TIME__/g, esc(time))
    .replace(/__DATE__/g, esc(date))
    .replace(/__BOT__/g, esc(botName))
    .replace(/__PREFIX__/g, esc(prefix))
    .replace(/__COUNT__/g, count)
    .replace(/__APPCOUNT__/g, String(apps.length))
    .replace(/__ICONS__/g, String(apps.length + 5))
    .replace(/__PF__/g, cssString(prefix))
    .replace("__APP_RADIOS__", radios)
    .replace("__APP_TILES__", tiles)
    .replace("__PAGE_CSS__", pageCss(pageCounts, apps))
    .replace("__APP_PAGES__", pages);

  return html
    .replace(/<style>([\s\S]*?)<\/style>/g, (m, css) => `<style>${minify(css)}</style>`)
    .replace(/<script>([\s\S]*?)<\/script>/g, (m, js) => `<script>${minifyJs(js)}</script>`);
}

/** The games script is inlined, so it gets the same treatment as the CSS. */
const minifyJs = (js) => js
  .replace(/\/\*(?!\*)[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "")
  .replace(/\n\s*/g, " ")
  .replace(/\s{2,}/g, " ")
  .trim();

/** Whitespace and comments are pure payload weight here. */
const minify = (css) => css
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\s*\n\s*/g, "")
  .replace(/\s{2,}/g, " ")
  .trim();

function getAIRich() {
  for (const id of ["mzazibaileys", "@whiskeysockets/baileys"]) {
    try {
      const mod = require(id);
      const B = mod && (mod.AIRich ? mod : mod.MessageBuilders);
      if (B && B.AIRich) return B.AIRich;
    } catch { /* next candidate */ }
  }
  return null;
}

/**
 * Send the phone menu.
 *
 * ctx: { client, jid, prefix, botName }
 * Returns { ok, mode, bytes?, error? }.
 */
async function handle(ctx = {}) {
  const client = ctx.client;
  const jid = ctx.jid;
  const prefix = typeof ctx.prefix === "string" && ctx.prefix ? ctx.prefix : ".";
  const botName = ctx.botName || "MZAZI XMD";

  if (!client || !jid) return { ok: false, mode: "failed", error: "missing client or jid" };

  let html;
  try {
    html = buildHtml({ prefix, botName });
  } catch (e) {
    return fallback(ctx, `template: ${e.message}`);
  }

  const AIRich = getAIRich();
  if (!AIRich) return fallback(ctx, "AIRich unavailable");
  if (Buffer.byteLength(html, "utf8") > MAX_BYTES) return fallback(ctx, "payload too large");

  const send = async (doc) => {
    const rich = new AIRich(client, { dynamic: true, unsupportedTypeAlert: false });
    rich.addSection({
      view_model: {
        primitive: {
          __typename: "GenAIaeacdsnwHtmlPrimitive",
          payload: doc,
          trusted_sources: ["mzazi.shop"],
        },
        __typename: "GenAISingleLayoutViewModel",
      },
    });
    await rich.send(jid, { includesUnifiedResponse: true });
  };

  try {
    await send(html);
    return { ok: true, mode: "html", bytes: Buffer.byteLength(html, "utf8") };
  } catch (e) {
    const first = String((e && e.message) || e);
    // A refusal is often a size limit: one retry with a leaner document.
    try {
      const slim = buildHtml({ prefix, botName, slim: true });
      await send(slim);
      return { ok: true, mode: "html-slim", bytes: Buffer.byteLength(slim, "utf8"), error: first };
    } catch (e2) {
      return fallback(ctx, first);
    }
  }
}

/** Native AIRich menu, then plain text — the two paths that already worked. */
async function fallback(ctx, reason) {
  try {
    const native = require("./mzaziMenu");
    const res = await native.handle({ ...ctx, jid: ctx.jid, client: ctx.client, mode: ctx.mode });
    if (res && res.ok) return { ok: true, mode: `fallback:${res.mode}`, error: reason };
  } catch { /* fall through to text */ }

  try {
    const { plainText } = require("./mzaziMenu");
    if (typeof plainText === "function") {
      await ctx.client.sendMessage(ctx.jid, { text: plainText({ prefix: ctx.prefix, botName: ctx.botName }) });
      return { ok: true, mode: "fallback:text", error: reason };
    }
  } catch { /* nothing left */ }

  return { ok: false, mode: "failed", error: reason };
}

// ── connection card ─────────────────────────────────────────────────────────
// The "connected" message that goes to the owner when a session comes up. Same
// primitive as the menu, so it renders as a phone screen instead of a text wall.

function buildConnect({ botName = "MZAZI XMD", owner = "", device = "", version = "3.0.0", prefix = "." } = {}) {
  const tpl = fs.readFileSync(CONNECT_TEMPLATE, "utf8");
  const now = new Date();
  const time = now.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleString("en-GB", {
    timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
  return tpl
    .replace(/\{\{TIME\}\}/g, esc(time))
    .replace(/\{\{BOT\}\}/g, esc(botName))
    .replace(/\{\{OWNER\}\}/g, esc(owner ? "@" + String(owner).replace(/^@/, "") : "owner"))
    .replace(/\{\{DEVICE\}\}/g, esc(device || "this device"))
    .replace(/\{\{VERSION\}\}/g, esc(version))
    .replace(/\{\{DATE\}\}/g, esc(date))
    .replace(/\{\{PREFIX\}\}/g, esc(prefix));
}

/** Sends the connection card. Returns { ok, mode, bytes } — never throws. */
async function sendConnect(client, jid, data = {}) {
  if (!client || !jid) return { ok: false, error: "missing client or jid" };
  const AIRich = getAIRich();
  if (!AIRich) return { ok: false, error: "AIRich unavailable" };
  let html;
  try {
    html = buildConnect(data);
  } catch (e) {
    return { ok: false, error: `template: ${e.message}` };
  }
  try {
    const rich = new AIRich(client, { dynamic: true, unsupportedTypeAlert: false });
    rich.addSection({
      view_model: {
        primitive: {
          __typename: "GenAIaeacdsnwHtmlPrimitive",
          payload: html,
          trusted_sources: ["mzazi.shop"],
        },
        __typename: "GenAISingleLayoutViewModel",
      },
    });
    await rich.send(jid, { includesUnifiedResponse: true });
    return { ok: true, mode: "html", bytes: Buffer.byteLength(html, "utf8") };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

module.exports = { handle, buildHtml, rows, MAX_BYTES, APPS, buildConnect, sendConnect };
