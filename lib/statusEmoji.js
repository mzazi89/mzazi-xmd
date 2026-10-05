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

module.exports = { isSingleEmoji, DEFAULT_EMOJI };
