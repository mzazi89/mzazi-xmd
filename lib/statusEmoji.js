// ─────────────────────────────────────────────────────────────────────────────
// lib/statusEmoji.js — the one-emoji rule for status reactions.
//
// WhatsApp accepts exactly one emoji per reaction. A reaction it will not take is
// rejected silently, so `setautolikeemoji` refuses anything else at the point of
// entry instead: a message the user can see beats a reaction that quietly never
// happens. Kept dependency-free so it can be tested directly, like lib/groupLock.js.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_EMOJI = "❤️";

/**
 * True when `value` is exactly one emoji — no text, no spaces, no second emoji.
 *
 * Accepts: ❤️ 🔥 👍🏽 (skin tone) 👨‍👩‍👧 (ZWJ sequence) 🇰🇪 (flag) 1️⃣ (keycap).
 * Rejects: "❤️❤️", "love ❤️", "ab", "", "🔥🔥", ".menu".
 */
function isSingleEmoji(value) {
  if (typeof value !== "string") return false;
  const raw = value.trim();
  if (!raw) return false;

  // Variation selectors (U+FE0E / U+FE0F) and skin-tone modifiers are part of one
  // emoji, not emoji of their own — strip them before testing the shape.
  const cleaned = raw.replace(/[\uFE0E\uFE0F]/g, "").replace(/\p{Emoji_Modifier}/gu, "");

  // A flag (two regional indicators), a keycap (digit/#/* + U+20E3), or a single
  // code point — including a ZWJ sequence such as 🧑‍💻.
  return /^(?:\p{Regional_Indicator}{2}|[0-9#*]\u20E3|\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic})*)$/u.test(cleaned);
}

// ─── the rotation ────────────────────────────────────────────────────────────
// One fixed emoji on every status is the tell that a bot is watching: the same
// ❤️ on forty posts in a row reads as automation. So the reaction rotates
// through a set instead, never landing on the same emoji twice in a row.
//
// The set is per session, stored as `emojis` in statusSettings.json. A legacy
// `emoji` value still works and is honoured as a one-item set — someone who
// picked 🔥 on purpose gets 🔥, not a surprise rotation. `.setautolikeemoji
// reset` restores the default set.
const DEFAULT_EMOJI_SET = ["❤️", "🔥", "😍", "👏", "💯", "🙌", "😮", "🎉"];
const MAX_EMOJIS = 12;

/** Grapheme segmentation: "🔥❤️😍" → ["🔥","❤️","😍"], ZWJ sequences intact. */
function splitEmojis(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  if (typeof Intl === "object" && typeof Intl.Segmenter === "function") {
    return [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(raw)]
      .map((s) => String(s.segment).trim())
      .filter(Boolean);
  }
  return Array.from(raw).map((c) => c.trim()).filter(Boolean);
}

/** "🔥 ❤️😍" → ["🔥","❤️","😍"] — deduped, single emojis only, capped. */
function parseEmojiList(text) {
  const out = [];
  for (const part of splitEmojis(text)) {
    if (!isSingleEmoji(part)) continue;
    if (out.includes(part)) continue;
    out.push(part);
    if (out.length >= MAX_EMOJIS) break;
  }
  return out;
}

/** The set a session should rotate through. */
function resolveEmojiList(settings) {
  const cfg = settings || {};
  if (Array.isArray(cfg.emojis)) {
    const list = parseEmojiList(cfg.emojis.join(""));
    if (list.length) return list;
  }
  if (typeof cfg.emoji === "string" && isSingleEmoji(cfg.emoji)) return [cfg.emoji];
  return DEFAULT_EMOJI_SET.slice();
}

// Last emoji handed out per session. In memory only: after a restart the first
// reaction may repeat the last one, which nobody can see.
const lastPicked = new Map();

/** Pick the next emoji, never the one used last time in this session. */
function pickEmoji(list, key = "") {
  const emojis = Array.isArray(list) && list.length ? list : DEFAULT_EMOJI_SET;
  if (emojis.length === 1) return emojis[0];
  const last = lastPicked.get(key);
  let pick = emojis[Math.floor(Math.random() * emojis.length)];
  if (pick === last) {
    // Step to the neighbour instead of re-rolling: with two emojis, re-rolling
    // would keep landing on the excluded one.
    pick = emojis[(emojis.indexOf(pick) + 1) % emojis.length];
  }
  lastPicked.set(key, pick);
  return pick;
}

module.exports = {
  isSingleEmoji,
  DEFAULT_EMOJI,
  DEFAULT_EMOJI_SET,
  MAX_EMOJIS,
  splitEmojis,
  parseEmojiList,
  resolveEmojiList,
  pickEmoji,
};
