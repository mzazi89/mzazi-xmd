#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Seed the MZAZI XMD command pack into the shared `bot_commands` table.
//
//   node scripts/seed-commands.js            # dry run, validates only
//   node scripts/seed-commands.js --apply    # writes to the database
//
// Every row is written with profile = 'xmd', so the pack is served only to the
// MZAZI XMD bot at /api/xmd-command and is invisible to QUARTZ XD.
//
// ── Why this validates before it writes ──────────────────────────────────────
// A command's `code` is compiled with `new Function` at run time and only then
// does a syntax error appear — on a live bot, in front of a customer, as
// "Command error: Unexpected token". Compiling every body here turns that into a
// build-time failure instead. It is the single most valuable check in this file.
//
// It also refuses duplicates BY NAME within this pack, because a name may only
// appear once per profile: `bot_commands` is unique on (profile, name), so two
// entries of the same name would silently overwrite one another. A same-named
// command owned by another bot (a different profile) is fine.
//
// Three further checks, each one for a mistake that is otherwise invisible
// until it reaches a customer:
//   1. duplicate aliases — the runtime resolves an alias to whichever command
//      it meets first, so a second claim on the same alias never fires
//   2. an alias that is also another command's name — names outrank aliases, so
//      that alias is reachable only through the other command
//   3. single backslashes in the part files — see validateRawFiles below; the
//      escape is eaten by the template literal and the body quietly changes
//      meaning while still compiling
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const PARTS_DIR = path.join(__dirname, 'commands');
const PROFILE = 'xmd';
const APPLY = process.argv.includes('--apply');

// The same parameter names the runtime passes, so a body that references one
// compiles here exactly as it will there. Only the names are needed for a syntax
// check — the values are irrelevant at this stage.
const CONTEXT_KEYS = [
  'mzazireply', 'reply', 'mzazi', 'args', 'command', 'prefix', 'text', 'body', 'm',
  'message', 'type', 'sender', 'senderNumber', 'senderNum', 'sendnumb', 'msgSender',
  'isOwner', 'isAdmin', 'isGroup', 'isBotAdmin', 'isGroupOwner', 'groupAdmins',
  'participants', 'botName', 'getBotName', 'setBotName', 'botPhoneNum', 'botJid', 'botLid',
  'axios', 'fetch', 'fs', 'path', 'os', 'exec', 'require', 'module', '__dirname', '__filename',
  'logger', 'logSystem', 'runtime', 'version', 'startTime', 'formatBytes',
  'db', 'loadJSON', 'saveJSON', 'saveDB', 'config', 'currentSettings', 'getSetting', 'settingsPath',
  'downloadMediaMessage', 'generateWAMessageFromContent', 'prepareWAMessageMedia', 'proto',
  'baileys', 'pino', 'PassThrough', 'ffmpeg', 'yts', 'crypto',
  'sendButtons', 'sendInteractiveMessage', 'getMzaziApiKey', 'mzaziSiteUrl', 'mzaziApiKey',
  'addWarn', 'getWarns', 'resetWarn', 'addOwner', 'delOwner', 'getOwners', 'owners', 'ownersList', 'ownerNumbers',
  'getGroupSettings', 'setGroupSetting', 'getToggle', 'setToggle', 'getChatbotStatus', 'setChatbotStatus',
  'isPaid', 'paidUsers', 'sessionPaidUsers', 'saveSessionPaid',
  'normalizeJid', 'jidToNumber', 'resolveJid', 'lidToPn', 'sessionFile',
];

const VALID_CATEGORIES = [
  'Downloads', 'Audio', 'Images', 'Stickers', 'Documents', 'Codes',
  'Text', 'Encoding', 'Links', 'Network', 'Files', 'Generators',
];

function partFiles() {
  if (!fs.existsSync(PARTS_DIR)) return [];
  return fs.readdirSync(PARTS_DIR).filter((f) => f.endsWith('.js')).sort();
}

function loadParts() {
  const all = [];
  for (const file of partFiles()) {
    const full = path.join(PARTS_DIR, file);
    let mod;
    try {
      mod = require(full);
    } catch (err) {
      throw new Error(`could not load ${file}: ${err.message}`);
    }
    if (!Array.isArray(mod)) throw new Error(`${file} does not export an array`);
    for (const cmd of mod) all.push({ ...cmd, __file: file });
  }
  return all;
}

/**
 * A backslash in these files is not a backslash yet — it is a backslash on its
 * way through a template literal into a command body.
 *
 * `code: \`x.replace(/\\s+/g, '')\`` in the file becomes `x.replace(/\s+/g, '')`
 * in the body. But `code: \`x.replace(/\s+/g, '')\`` (one backslash) becomes
 * `x.replace(/s+/g, '')` — because an unknown escape inside a template literal
 * collapses to the bare character. That version still compiles, so the body
 * check above stays silent, and the command ships matching the letter "s"
 * instead of whitespace. The same applies to \\d, \\w and friends.
 *
 * So: inside these files every backslash must be doubled. This is the only
 * place that mistake can be caught.
 */
function validateRawFiles() {
  const problems = [];
  for (const file of partFiles()) {
    const lines = fs.readFileSync(path.join(PARTS_DIR, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (line.trim().startsWith('//')) return;
      // Collapse every doubled backslash, then see what is left over.
      if (line.replace(/\\\\/g, '').includes('\\')) {
        problems.push(
          `${file}:${i + 1}: single backslash — inside a body it must be doubled (write \\\\s, \\\\n, \\\\d …) or the escape is lost when the template literal is evaluated`
        );
      }
    });
  }
  return problems;
}

function validate(commands) {
  const problems = [];
  const seen = new Map();
  const seenAlias = new Map();

  for (const c of commands) {
    const where = `${c.__file} → ${c.name || '(no name)'}`;

    if (!c.name || typeof c.name !== 'string') problems.push(`${where}: missing name`);
    else if (!/^[a-z0-9_]{1,64}$/.test(c.name)) problems.push(`${where}: name must be lowercase letters, digits or underscore`);

    if (typeof c.code !== 'string' || !c.code.trim()) problems.push(`${where}: missing code`);

    if (c.name) {
      if (seen.has(c.name)) problems.push(`${where}: duplicate name, already defined in ${seen.get(c.name)}`);
      else seen.set(c.name, c.__file);
    }

    // Aliases are matched first-wins at run time (getRemoteCommand scans the
    // synced list in order and returns the first hit), so a second command
    // claiming an alias that is already taken is simply unreachable through that
    // alias — and nothing anywhere reports it.
    if (Array.isArray(c.aliases)) {
      for (const a of c.aliases) {
        const alias = String(a);
        if (!/^[a-z0-9_]{1,64}$/.test(alias)) problems.push(`${where}: bad alias "${a}"`);
        if (alias === c.name) problems.push(`${where}: alias duplicates its own name`);
        if (seenAlias.has(alias)) problems.push(`${where}: duplicate alias "${alias}", already used by ${seenAlias.get(alias)}`);
        else seenAlias.set(alias, c.name || c.__file);
      }
    }

    if (c.category && !VALID_CATEGORIES.includes(c.category)) {
      problems.push(`${where}: unknown category "${c.category}"`);
    }

    // The one that matters: a body that will not compile is a command that
    // fails in front of a customer and nowhere else.
    if (typeof c.code === 'string' && c.code.trim()) {
      try {
        // eslint-disable-next-line no-new-func
        new Function(...CONTEXT_KEYS, `return (async () => {\n${c.code}\n})()`);
      } catch (err) {
        problems.push(`${where}: CODE DOES NOT COMPILE — ${err.message}`);
      }
    }
  }

  // A name outranks every alias in the runtime lookup, so an alias that collides
  // with another command's NAME is dead too.
  for (const [alias, owner] of seenAlias) {
    if (seen.has(alias)) {
      problems.push(
        `alias "${alias}" (defined by ${owner}) is also a command name — the name wins, so the alias can never fire`
      );
    }
  }

  problems.push(...validateRawFiles());

  return problems;
}

function summarise(commands) {
  const byCategory = {};
  for (const c of commands) {
    const k = c.category || 'General';
    byCategory[k] = (byCategory[k] || 0) + 1;
  }
  return byCategory;
}

async function main() {
  const commands = loadParts();

  if (commands.length === 0) {
    console.error('No command parts found in', PARTS_DIR);
    process.exitCode = 1;
    return;
  }

  console.log(`Loaded ${commands.length} command(s) from ${PARTS_DIR}`);

  const problems = validate(commands);
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):`);
    for (const p of problems) console.error('  ✗ ' + p);
    console.error('\nNothing was written.');
    process.exitCode = 1;
    return;
  }

  console.log('Every body compiles. No duplicate names, no duplicate aliases, no lost escapes.\n');
  for (const [cat, n] of Object.entries(summarise(commands))) {
    console.log(`  ${cat.padEnd(12)} ${n}`);
  }

  if (!APPLY) {
    console.log('\nDry run — pass --apply to write these to the database.');
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error('\nDATABASE_URL is not set, so there is nowhere to write.');
    process.exitCode = 1;
    return;
  }

  // Required lazily so a dry run works with no database and no dependencies.
  const { prisma, ensureTables } = require('../lib/botDb.js');
  await ensureTables();

  let written = 0;

  for (const c of commands) {
    const aliases = JSON.stringify(Array.isArray(c.aliases) ? c.aliases : []);

    // Upsert scoped to (profile, name): `name` is no longer unique on its own,
    // so re-running this over an existing database updates the xmd row in place
    // instead of failing. A same-named row under a DIFFERENT profile is a
    // separate command and is never touched.
    await prisma.$executeRawUnsafe(
      `INSERT INTO bot_commands
         (name, aliases, description, category, usage, owner_only, admin_only, group_only, enabled, code, profile)
       VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, true, $9, $10)
       ON CONFLICT (profile, name) DO UPDATE SET
         aliases = EXCLUDED.aliases,
         description = EXCLUDED.description,
         category = EXCLUDED.category,
         usage = EXCLUDED.usage,
         owner_only = EXCLUDED.owner_only,
         admin_only = EXCLUDED.admin_only,
         group_only = EXCLUDED.group_only,
         code = EXCLUDED.code,
         updated_at = CURRENT_TIMESTAMP`,
      c.name, aliases, c.description || '', c.category || 'General', c.usage || '',
      !!c.ownerOnly, !!c.adminOnly, !!c.groupOnly, c.code, PROFILE
    );
    written++;
  }

  console.log(`\nDone. ${written} command(s) upserted under profile "${PROFILE}".`);
  console.log('\nThe bot syncs automatically within ~15s, or run .synccmd to force it.');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exitCode = 1;
});
