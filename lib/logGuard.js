// ─────────────────────────────────────────────────────────────────────────────
// lib/logGuard.js — keeps the console readable when something loops.
//
// A corrupted Signal session makes Baileys throw "Bad MAC" for every inbound
// message from that contact, each with a five-line stack. Without this, the
// console becomes a wall of identical stacks and the one line that matters — the
// message the bot actually received — is somewhere above the fold.
//
// It patches console.error only. First occurrence prints in full with its stack;
// repeats are counted, one is printed every fiftieth, and a single "suppressed"
// line is emitted once the burst stops. No information is lost: the count and the
// time of the first occurrence are always reported.
//
//   LOG_ERROR_WINDOW_MS  quiet period before a burst is summarised (default 12000)
//   LOG_ERROR_SILENT=1   print nothing at all for repeats (counters only)
// ─────────────────────────────────────────────────────────────────────────────

const WINDOW_MS = Math.max(2000, parseInt(process.env.LOG_ERROR_WINDOW_MS || '12000', 10) || 12000);
const SILENT = process.env.LOG_ERROR_SILENT === '1';
const COLOR = process.env.NO_COLOR === undefined && process.env.FORCE_COLOR !== '0';
const grey = (t) => (COLOR ? `\x1b[90m${t}\x1b[0m` : String(t));
const clockFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: process.env.LOG_TIMEZONE || 'Africa/Nairobi',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});
const amber = (t) => (COLOR ? `\x1b[38;2;242;193;78m${t}\x1b[0m` : String(t));

if (!console.__mzaziGuarded) {
  const original = console.error.bind(console);
  const seen = new Map();

  const keyOf = (args) => {
    const first = args
      .map((a) => {
        if (a instanceof Error) return `${a.name}: ${a.message}`;
        if (typeof a === 'object' && a !== null) {
          try { return JSON.stringify(a).slice(0, 200); } catch { return String(a); }
        }
        return String(a);
      })
      .join(' ');
    return first.split('\n')[0].slice(0, 220);
  };

  // Baileys also dumps whole objects to stdout ("Closing session: SessionEntry
  // { _chains: … }" is thirty lines). Our own logger only ever passes strings, so
  // anything object-shaped here is library noise: collapse it the same way.
  const originalLog = console.log.bind(console);
  const seenLogs = new Map();
  console.log = (...args) => {
    const hasObject = args.some((a) => a !== null && typeof a === 'object' && !(a instanceof Error));
    if (!hasObject) { originalLog(...args); return; }

    const head = args.find((a) => typeof a === 'string');
    const label = head ? head.replace(/[\s:{]+$/, '') : args[0]?.constructor?.name || 'object';
    const key = `obj:${String(label).slice(0, 120)}`;
    const now = Date.now();
    const rec = seenLogs.get(key);
    if (!rec) {
      seenLogs.set(key, { count: 1, first: now, last: now });
      originalLog(`${String(label).slice(0, 80)} ${grey('⟪object omitted⟫')}`);
      return;
    }
    rec.count += 1;
    rec.last = now;
    if (rec.count % 25 === 0 && !SILENT) {
      originalLog(amber(`↻ ${rec.count}× objects: `) + grey(String(label).slice(0, 90)));
    }
  };

  console.error = (...args) => {
    const key = keyOf(args);
    if (!key.trim()) return;
    const now = Date.now();
    const rec = seen.get(key);

    if (!rec) {
      seen.set(key, { count: 1, first: now, last: now, stack: args });
      original(...args);
      return;
    }

    rec.count += 1;
    rec.last = now;

    // A fault that never stops still deserves a heartbeat, just not every time.
    if (rec.count % 50 === 0 && !SILENT) {
      original(amber(`↻ ${rec.count}× so far: `) + grey(key));
    }
  };

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, rec] of seen) {
      if (rec.count > 1 && now - rec.last >= WINDOW_MS) {
        if (!SILENT) {
          const since = clockFmt.format(new Date(rec.first));
          original(grey(`↺ ${rec.count}× repeated since ${since} — `) + grey(key));
        }
        seen.delete(key);
      } else if (rec.count === 1 && now - rec.last > 60_000) {
        seen.delete(key);
      }
    }
    for (const [key, rec] of seenLogs) {
      if (rec.count > 1 && now - rec.last >= WINDOW_MS) {
        if (!SILENT) {
          originalLog(grey(`↺ ${rec.count}× object dumps since ${clockFmt.format(new Date(rec.first))} — `) + grey(key.slice(4)));
        }
        seenLogs.delete(key);
      } else if (rec.count === 1 && now - rec.last > 60_000) {
        seenLogs.delete(key);
      }
    }
  }, 5000);

  if (typeof sweep.unref === 'function') sweep.unref();

  console.__mzaziGuarded = true;
}

module.exports = { guarded: true };
