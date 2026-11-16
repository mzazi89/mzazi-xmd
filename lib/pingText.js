// MZAZI — the .ping reply, as text.
//
// Pulled out of case.js so it can be tested without a WhatsApp connection: a
// reply that only ever runs in production is a reply nobody has measured. Fixed
// three-line shape, so the message never jumps around between calls.
//
//   🏓 pong! ⚡ quick as a flash
//   ⏱️ `42 ms` · up 2h 14m
//   MZAZI TECH · still here 👋

const MOODS = [
  { max: 150, e: '⚡', w: 'quick as a flash' },
  { max: 500, e: '🙂', w: 'all good' },
  { max: Infinity, e: '🐢', w: 'a little sleepy' },
];

function uptimeLabel(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  // Empty units are dropped — "3d 4m", never "3d 0h 4m" — and anything under a
  // minute says so instead of claiming "0m".
  const units = [d ? `${d}d` : '', h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean);
  return units.length ? `up ${units.join(' ')}` : 'just up';
}

// Sub-second reads in milliseconds, anything slower in seconds — "1.2 s" is a
// measurement a person can feel, "1200 ms" is a number they have to convert.
function latencyLabel(latency) {
  if (latency < 1000) return `${latency} ms`;
  return `${(latency / 1000).toFixed(latency < 10000 ? 1 : 0)} s`;
}

function pingText({ ms, uptimeSeconds, brand = 'MZAZI TECH' }) {
  const latency = Math.max(1, Math.round(Number(ms) || 0));
  const mood = MOODS.find((bucket) => latency < bucket.max) || MOODS[MOODS.length - 1];

  return [
    `🏓 *pong!* ${mood.e} _${mood.w}_`,
    `⏱️ \`${latencyLabel(latency)}\` · ${uptimeLabel(uptimeSeconds)}`,
    `_${brand} · still here_ 👋`,
  ].join('\n');
}

module.exports = { pingText, uptimeLabel };
