// MZAZI — the name, in the same styling as the brand.
//
// The reply card used to say "𝐌𝐙𝐀𝐙𝐈 𝐗𝐌𝐃" — Mathematical Bold. That is
// a font choice made of code points, not a font: WhatsApp has no rich text, so
// the only way to make a name look like the rest of the brand is to substitute
// the glyphs. This does that for whatever name .setbotname stored.
//
// Anything outside ASCII (digits, punctuation, non-Latin letters) is left alone
// rather than mangled — a partly styled name is better than a broken one.

const UPPER = 0x1d400; // 𝐀  (Mathematical Bold — the glyphs the brand already uses)
const LOWER = 0x1d41a; // 𝐚
const DIGIT = 0x1d7ce; // 𝟎

function stylise(text) {
  const chars = [...String(text || '')];
  return chars
    .map((ch) => {
      const code = ch.codePointAt(0);
      if (code >= 65 && code <= 90) return String.fromCodePoint(UPPER + (code - 65));
      if (code >= 97 && code <= 122) return String.fromCodePoint(LOWER + (code - 97));
      if (code >= 48 && code <= 57) return String.fromCodePoint(DIGIT + (code - 48));
      return ch;
    })
    .join('');
}

/** Upper-cased first, so the card reads as a masthead rather than a username. */
function fancyName(name) {
  return stylise(String(name || '').toUpperCase());
}

module.exports = { stylise, fancyName };
