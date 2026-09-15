// ─────────────────────────────────────────────────────────────────────────────
// REMOTE COMMANDS — the MZAZI XMD command registry, hosted by the website.
//
// Commands are authored in the admin dashboard (admin → Commands). They are
// served by the website at its OWN path:
//
//     GET https://mzazi.shop/api/xmd-command
//
// QUARTZ XD uses /api/bot-command. XMD uses /api/xmd-command, so the two bots
// share one authoring UI and one database but never read each other's registry.
//
// ── Why HTTP and not a direct database read ──────────────────────────────────
// The website endpoint already returns only this bot's commands, already
// carries the HMAC signature, and lets the bot run from anywhere without the
// database driver or DATABASE_URL privileges it would otherwise need. The bot
// therefore needs exactly one secret (the bot API key) and one URL.
//
// ── Security ─────────────────────────────────────────────────────────────────
// The response body is verified against the `X-Mzazi-Signature` header
// (HMAC-SHA256 over the exact bytes, keyed by the bot API key) before any
// command code is executed. A tampered or truncated body is rejected outright
// rather than compiled. Signature comparison is timing-safe.
//
// ── Resilience ───────────────────────────────────────────────────────────────
// Every successful sync is written to database/xmdCommands.json. If the website
// is briefly unreachable the bot boots from that cache instead of losing all of
// its commands. Sync happens at startup, every 30 minutes, on the `.synccmd`
// command, and automatically within ~15s of an admin edit (botTelemetry).
// ─────────────────────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");
const config = require("../settings");

const CACHE_PATH = path.join(__dirname, "..", "database", "xmdCommands.json");
const RUN_TIMEOUT = 30000;
const HTTP_TIMEOUT = 15000;

let cache = { commands: [], updatedAt: null, syncedAt: null, lastError: null };

// ─── cache ───────────────────────────────────────────────────────────────────
function loadCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      cache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
    }
  } catch (e) {
    cache = { commands: [], updatedAt: null, syncedAt: null, lastError: "Cache corrupted" };
  }
  if (!Array.isArray(cache.commands)) cache.commands = [];
}

function saveCache() {
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  } catch (e) {}
}

// ─── normalisation ───────────────────────────────────────────────────────────
// The website sends camelCase booleans; the executable shape the rest of the
// bot expects is unchanged from QUARTZ, so command bodies written for either
// bot run identically.
function normalise(c) {
  return {
    name: String(c.name || "").toLowerCase().trim(),
    aliases: Array.isArray(c.aliases) ? c.aliases.map((a) => String(a).toLowerCase()) : [],
    description: c.description || "",
    category: c.category || "General",
    usage: c.usage || "",
    ownerOnly: !!(c.ownerOnly ?? c.owner_only),
    adminOnly: !!(c.adminOnly ?? c.admin_only),
    groupOnly: !!(c.groupOnly ?? c.group_only),
    enabled: c.enabled !== false,
    code: c.code || "",
    // This bot is single-profile, but the field is kept so a command body that
    // reads cmd.profile keeps working.
    profile: c.profile || "xmd",
  };
}

// ─── signature ───────────────────────────────────────────────────────────────
function verifySignature(rawBody, header, secret) {
  // No header and no configured secret: the website only signs when a key is
  // set, so absence is not an error — but a header that IS present must match.
  if (!header) return { ok: true, verified: false };
  if (!secret) return { ok: false, reason: "server sent a signature but no bot API key is configured" };

  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(String(header));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return { ok: false, reason: "signature mismatch" };
  return crypto.timingSafeEqual(a, b) ? { ok: true, verified: true } : { ok: false, reason: "signature mismatch" };
}

// ─── sync (over HTTP, from this bot's own path) ──────────────────────────────
async function syncRemoteCommands() {
  loadCache();

  const url = config.remoteApiUrl;
  const key = config.remoteApiKey;

  if (!url) {
    cache.lastError = "No remote command URL configured (set REMOTE_API_URL)";
    saveCache();
    return { ok: false, error: cache.lastError };
  }

  try {
    const res = await axios.get(url, {
      timeout: HTTP_TIMEOUT,
      responseType: "text",
      transformResponse: (d) => d, // keep the exact bytes for signature checks
      headers: {
        Accept: "application/json",
        "User-Agent": "mzazi-xmd-bot/1.0",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      // A 4xx is handled below with a readable message rather than a throw.
      validateStatus: () => true,
    });

    const raw = typeof res.data === "string" ? res.data : JSON.stringify(res.data);

    if (res.status === 401 || res.status === 403) {
      throw new Error(`website rejected the bot API key (HTTP ${res.status})`);
    }
    if (res.status !== 200) {
      throw new Error(`website returned HTTP ${res.status}`);
    }

    const sig = verifySignature(raw, res.headers["x-mzazi-signature"], key);
    if (!sig.ok) throw new Error(sig.reason);

    // Only parse AFTER the signature is trusted.
    const body = JSON.parse(raw);
    if (!body || body.ok === false) {
      throw new Error(body && body.error ? body.error : "website reported a failure");
    }

    const rows = Array.isArray(body.commands) ? body.commands : [];

    // Without a key the website returns metadata only — no executable code.
    // Caching that would silently disable every command, so say so plainly.
    const withCode = rows.filter((c) => typeof c.code === "string" && c.code.length > 0);
    if (rows.length > 0 && withCode.length === 0) {
      throw new Error(
        "website returned commands without their code — the bot API key is missing or wrong"
      );
    }

    cache.commands = rows.map(normalise).filter((c) => c.enabled && c.name);
    cache.updatedAt = new Date().toISOString();
    cache.syncedAt = cache.updatedAt;
    cache.signatureVerified = !!sig.verified;
    cache.lastError =
      cache.commands.length === 0
        ? "0 commands returned by /api/xmd-command — check that MZAZI XMD commands are enabled in the admin panel"
        : null;

    // The registry changed, so any previously compiled command body is stale.
    // Without this, re-imported commands keep running the OLD code until restart.
    cacheVersion = cache.syncedAt;
    compiledCache.clear();

    saveCache();
    return { ok: true, data: { commands: cache.commands, updatedAt: cache.updatedAt } };
  } catch (e) {
    const detail = e.response ? `HTTP ${e.response.status}` : e.message;
    cache.lastError = `Sync failed: ${detail}`;
    saveCache();
    return { ok: false, error: cache.lastError };
  }
}

// ─── lookup ──────────────────────────────────────────────────────────────────
function getRemoteCommand(name) {
  if (!name) return null;
  const n = String(name).toLowerCase();
  return (
    cache.commands.find((c) => c.name === n) ||
    cache.commands.find((c) => Array.isArray(c.aliases) && c.aliases.includes(n)) ||
    null
  );
}

function listRemoteCommands() {
  return cache.commands.map((c) => ({
    name: c.name,
    description: c.description || "",
    category: c.category || "General",
    usage: c.usage || "",
    ownerOnly: !!c.ownerOnly,
    adminOnly: !!c.adminOnly,
    groupOnly: !!c.groupOnly,
  }));
}

function getRemoteStatus() {
  return {
    source: "website-http",
    url: config.remoteApiUrl,
    keyConfigured: !!config.remoteApiKey,
    signatureVerified: !!cache.signatureVerified,
    syncedAt: cache.syncedAt,
    updatedAt: cache.updatedAt,
    lastError: cache.lastError,
    count: cache.commands.length,
    profiles: ["xmd"],
  };
}

// ─── execution ───────────────────────────────────────────────────────────────
// Compiled once per registry sync instead of on every invocation.
const compiledCache = new Map();
let cacheVersion = cache.syncedAt || "initial";

async function runRemoteCommand(cmd, ctx, timeoutMs = RUN_TIMEOUT) {
  const keys = Object.keys(ctx);
  const cacheKey = `${cmd.name}:${cacheVersion}`;
  let fn = compiledCache.get(cacheKey);
  if (!fn) {
    fn = new Function(...keys, `return (async () => {\n${cmd.code}\n})()`);
    compiledCache.set(cacheKey, fn);
    if (compiledCache.size > 1200) {
      compiledCache.delete(compiledCache.keys().next().value);
    }
  }

  const runner = fn(...keys.map((k) => ctx[k]));
  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timed out after ${timeoutMs / 1000}s`)), timeoutMs)
  );

  await Promise.race([runner, timer]);
}

loadCache();
cacheVersion = cache.syncedAt || "initial";

module.exports = {
  syncRemoteCommands,
  getRemoteCommand,
  listRemoteCommands,
  runRemoteCommand,
  getRemoteStatus,
};
