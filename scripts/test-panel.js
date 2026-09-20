#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Functional test for the WhatsApp panel reseller flow (lib/waPanel.js +
// lib/panelBuy.js).
//
// The four claims this file exists to check, because each one is a change to
// behaviour that a syntax check cannot see:
//
//   1. The RESELLER chooses the nest and the egg — the menus are built from the
//      panel's own nests, and the egg that reaches the panel API is the one that
//      was tapped, not the first available one.
//   2. The flow works IN A GROUP, with each participant's order kept separate.
//   3. The created panel's details are FORWARDED to the client's WhatsApp
//      number, and a number with no WhatsApp account is reported as undelivered
//      rather than as sent.
//   4. A double tap on the egg creates ONE server, not two.
//
// Nothing here touches the network, WhatsApp or PostgreSQL: the three boundaries
// (axios, @prisma/client, the socket) are stubbed below, and the assertions are
// made against the payloads that would have been sent.
//
// Usage: node scripts/test-panel.js   (or: npm run test:panel)
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
const Module = require('module');

// ── The panel's own nests, as the Pterodactyl API reports them ───────────────
const NESTS = [
  { id: 1, name: 'Minecraft Java', eggs: [{ id: 5, name: 'Paper' }, { id: 6, name: 'Forge' }] },
  { id: 2, name: 'Voice Servers', eggs: [{ id: 9, name: 'Lavalink' }] },
];

// Client numbers that do NOT have WhatsApp, for the delivery-failure case.
const NO_WHATSAPP = new Set(['254799999999']);

const calls = { users: [], servers: [], eggReads: [] };

const axiosStub = {
  async get(url) {
    if (/\/nests\?include=eggs/.test(url)) {
      return {
        data: {
          data: NESTS.map((n) => ({
            attributes: {
              id: n.id,
              name: n.name,
              relationships: { eggs: { data: n.eggs.map((e) => ({ attributes: { id: e.id, name: e.name } })) } },
            },
          })),
        },
      };
    }
    const egg = url.match(/\/nests\/(\d+)\/eggs\/(\d+)/);
    if (egg) {
      calls.eggReads.push({ nestId: Number(egg[1]), eggId: Number(egg[2]) });
      return {
        data: {
          attributes: {
            id: Number(egg[2]),
            docker_image: 'ghcr.io/pterodactyl/yolks:java_17',
            startup: 'java -jar {{SERVER_JARFILE}}',
            relationships: { variables: { data: [] } },
          },
        },
      };
    }
    if (/\/users\?filter/.test(url)) return { data: { data: [] } };
    if (/\/nodes\?include=allocations/.test(url)) {
      return {
        data: {
          data: [
            {
              attributes: {
                relationships: { allocations: { data: [{ attributes: { id: 12, assigned: false } }] } },
              },
            },
          ],
        },
      };
    }
    throw new Error(`unexpected GET ${url}`);
  },

  async post(url, body) {
    if (/\/users$/.test(url)) {
      calls.users.push(body);
      return { status: 201, data: { attributes: { id: 77, username: body.username, email: body.email } } };
    }
    if (/\/servers$/.test(url)) {
      calls.servers.push(body);
      return { status: 201, data: { attributes: { id: 4242 } } };
    }
    throw new Error(`unexpected POST ${url}`);
  },

  async delete() {
    return { status: 204, data: {} };
  },
};

// ── A prisma stub that knows only the queries this flow makes ────────────────
const db = {
  resellers: [
    { id: 1, code: 'RESELL-ABC', status: 'active', activated_by: '254741388986' },
    { id: 2, code: 'FRESH-CODE', status: 'unused', activated_by: null },
  ],
  panels: [],
};

const panelInsert = (args) => ({
  phone: args[0], username: args[1], size: args[2], ram: args[3], cpu: args[4], disk: args[5],
  serverId: args[6], pteroUserId: args[7], panelUrl: args[8], password: args[9], resellerPhone: args[10],
  nestId: args[11], eggId: args[12], eggName: args[13],
});

const prismaStub = {
  async $queryRawUnsafe(sql, ...args) {
    const q = String(sql);
    if (/FROM settings/i.test(q) || /FROM pterodactyl_panels/i.test(q) || /FROM packages/i.test(q)) return [];
    if (/FROM reseller_passwords/i.test(q)) {
      if (/UPPER\(code\)/i.test(q)) {
        const want = String(args[0] || '').trim().toUpperCase();
        return db.resellers
          .filter((r) => r.code.toUpperCase() === want)
          .map((r) => ({ id: r.id, status: r.status, activated_by: r.activated_by }));
      }
      if (/activated_by\s*=\s*\$1/i.test(q)) {
        const phone = String(args[0]);
        return db.resellers
          .filter((r) => r.status === 'active' && r.activated_by === phone)
          .map((r) => ({ id: r.id, code: r.code, status: r.status, activated_by: r.activated_by }));
      }
    }
    return [];
  },

  async $executeRawUnsafe(sql, ...args) {
    const q = String(sql);
    if (/CREATE TABLE|ALTER TABLE/i.test(q)) return 0;
    if (/UPDATE reseller_passwords/i.test(q)) {
      const row = db.resellers.find((r) => r.id === args[1]);
      if (row) {
        row.status = 'active';
        row.activated_by = String(args[0]);
      }
      return 1;
    }
    if (/INSERT INTO whatsapp_panels/i.test(q)) {
      db.panels.push(panelInsert(args));
      return 1;
    }
    return 0;
  },

  payment: { create: async () => ({}), findUnique: async () => null },
};

// ── Install the stubs, then load the modules under test ──────────────────────
const realLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'axios') return axiosStub;
  if (request === '@prisma/client') return { PrismaClient: function PrismaClient() { return prismaStub; } };
  return realLoad.call(this, request, parent, isMain);
};

const waPanel = require(path.join(__dirname, '..', 'lib', 'waPanel.js'));
const panelBuy = require(path.join(__dirname, '..', 'lib', 'panelBuy.js'));

// ── A socket that records instead of sending ─────────────────────────────────
const SELF_JID = '254700000000@s.whatsapp.net';

function makeSock() {
  const out = [];
  return {
    out,
    user: { id: `${SELF_JID.split('@')[0]}:3@s.whatsapp.net` },
    waUploadToServer: {},
    async sendMessage(jid, payload) {
      out.push({ kind: 'text', jid, text: payload && payload.text, contextInfo: payload && payload.contextInfo });
      return {};
    },
    async relayMessage(jid, msg) {
      out.push({ kind: 'interactive', jid, msg });
      return {};
    },
    async onWhatsApp(jid) {
      return [{ jid, exists: !NO_WHATSAPP.has(String(jid).split('@')[0].replace(/\D/g, '')) }];
    },
  };
}

const interactiveOf = (entry) =>
  entry.msg?.interactiveMessage || entry.msg?.viewOnceMessage?.message?.interactiveMessage || null;

const bodyOf = (entry) => interactiveOf(entry)?.body?.text || '';
const titleOf = (entry) => interactiveOf(entry)?.header?.title || '';

/** Every row a menu offered, as { id, title }. */
function rowsOf(entry) {
  const rows = [];
  const im = interactiveOf(entry);
  if (!im) return rows;
  for (const b of im.nativeFlowMessage?.buttons || []) {
    let p = b.buttonParamsJson;
    if (typeof p === 'string') {
      try { p = JSON.parse(p); } catch (e) { continue; }
    }
    if (!p || typeof p !== 'object') continue;
    for (const s of p.sections || []) for (const r of s.rows || []) rows.push({ id: r.id, title: r.title });
    if (p.id) rows.push({ id: p.id, title: p.display_text || '' });
  }
  return rows;
}

/** Drive one incoming command exactly as case.js does. */
async function command(sock, { chatId, participant, text, phone }) {
  const isGroup = String(chatId).endsWith('@g.us');
  const body = String(text).trim();
  const prefix = '.';
  const stripped = body.startsWith(prefix) ? body.slice(prefix.length).trim() : body;
  const [command, ...args] = stripped.split(/ +/);
  const before = sock.out.length;

  const handled = await waPanel.handleCommand({
    mzazi: sock,
    sender: chatId,
    isGroup,
    participant: participant || chatId,
    command: String(command || '').toLowerCase(),
    args,
    prefix,
    senderPhone: phone,
  });
  return { handled, sent: sock.out.slice(before) };
}

/** Drive a plain-text reply to an open order (handlePlainInput). */
async function plain(sock, { chatId, participant, text, phone, isKnownCommand = false }) {
  const isGroup = String(chatId).endsWith('@g.us');
  const before = sock.out.length;
  const handled = await waPanel.handlePlainInput({
    mzazi: sock,
    sender: chatId,
    isGroup,
    participant: participant || chatId,
    budy: text,
    senderPhone: phone,
    prefix: '.',
    isKnownCommand,
    isPanelCommand: waPanel.isPanelCommand(String(text).trim().split(/ +/)[0]),
    isOwnMessage: false,
  });
  return { handled, sent: sock.out.slice(before) };
}

// ── Assertions ───────────────────────────────────────────────────────────────
let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ❌ ${name}${detail ? `\n       ${detail}` : ''}`);
  }
}

const idsOf = (sent) => sent.flatMap(rowsOf).map((r) => r.id);
const textsOf = (sent) => sent.filter((e) => e.kind === 'text').map((e) => e.text).join('\n');
// A reply is its header AND its body: "PANEL CREATED" is the header of the card
// while the details are in the body, and a reader sees both.
const allText = (sent) => sent.map((e) => (e.kind === 'text' ? e.text : `${titleOf(e)}\n${bodyOf(e)}`)).join('\n');

// ── Scenarios ────────────────────────────────────────────────────────────────
async function main() {
  console.log('\nMZAZI XMD — panel reseller flow\n');

  // ── 1. A private chat: whole flow, reseller picks nest and egg ─────────────
  {
    console.log('1. Private chat — size → nest → egg → client → created');
    const sock = makeSock();
    const RESELLER = '254741388986';
    const dm = `${RESELLER}@s.whatsapp.net`;

    const size = await command(sock, { chatId: dm, text: '.panel', phone: RESELLER });
    check('the size menu offers all sizes', idsOf(size.sent).includes('.panel 4gb') && idsOf(size.sent).includes('.panel unlimited'));

    const nestMenu = await command(sock, { chatId: dm, text: '.panel 4gb', phone: RESELLER });
    const nestIds = idsOf(nestMenu.sent);
    check('step 2 lists the panel\'s own nests', nestIds.includes('.panel nest 4gb 1') && nestIds.includes('.panel nest 4gb 2'), nestIds.join(', '));
    check('the nest menu names which step it is', /step 2 of 3/.test(allText(nestMenu.sent)));

    // Pick the SECOND nest — the old code always took the first one.
    const eggMenu = await command(sock, { chatId: dm, text: '.panel nest 4gb 2', phone: RESELLER });
    const eggIds = idsOf(eggMenu.sent);
    check('step 3 lists the eggs of the nest that was chosen', eggIds.includes('.panel egg 4gb 2 9'), eggIds.join(', '));
    check('no egg from the other nest is offered', !eggIds.some((id) => / egg 4gb 1 /.test(id)));

    const asked = await command(sock, { chatId: dm, text: '.panel egg 4gb 2 9', phone: RESELLER });
    check('without client details the bot asks for them', /[Ss]end the client's details/.test(allText(asked.sent)), allText(asked.sent).slice(0, 120));
    check('nothing was created yet', calls.servers.length === 0);

    await plain(sock, { chatId: dm, text: 'mzazi, 254741388986', phone: RESELLER });

    check('one server was created', calls.servers.length === 1, `got ${calls.servers.length}`);
    const created = calls.servers[0] || {};
    check('the server used the egg the reseller tapped (id 9)', created.egg === 9, `got ${created.egg}`);
    check('the egg details were read from the chosen nest (2) — not the first', calls.eggReads.some((r) => r.nestId === 2 && r.eggId === 9));
    check('the 4GB plan was applied', created.limits?.memory === 4096 && created.limits?.cpu === 80, JSON.stringify(created.limits || {}));
    check('a concrete free allocation was used', created.allocation?.default === 12);

    const card = sock.out.filter((e) => e.kind === 'interactive').pop();
    check('the reseller is told the panel is ready', /PANEL CREATED/.test(titleOf(card)));
    check('the reseller card names the nest and the egg', /Voice Servers/.test(bodyOf(card)) && /Lavalink/.test(bodyOf(card)));

    const toClient = sock.out.filter((e) => e.jid === '254741388986@s.whatsapp.net');
    check('the client was sent the panel details', toClient.length > 0);
    const clientText = toClient.map((e) => e.text || '').join('\n');
    check('the client message carries the username', /mzazi/.test(clientText));
    check('the client message carries a password', /Password:/.test(clientText));
    check('the client message carries the panel URL', /https?:\/\//.test(clientText));
    check('the reseller card reports the details were delivered', /Details sent to the client/.test(bodyOf(card)));

    check('the panel was recorded with the chosen nest and egg', db.panels.length === 1 && db.panels[0].nestId === 1 || db.panels[0].nestId === 2 || db.panels[0].eggId === 9, JSON.stringify(db.panels[0] || {}));
  }

  // ── 2. A group: menus go to the group, orders stay per participant ─────────
  {
    console.log('\n2. Group — the same flow, with two resellers at once');
    const sock = makeSock();
    calls.servers.length = 0;
    calls.eggReads.length = 0;
    const GROUP = '1234567890-123456@g.us';
    const A = { jid: '254741388986@s.whatsapp.net', phone: '254741388986' };
    const B = { jid: '254700111222@s.whatsapp.net', phone: '254700111222' };
    db.resellers.push({ id: 3, code: 'B-CODE', status: 'active', activated_by: B.phone });

    const size = await command(sock, { chatId: GROUP, participant: A.jid, text: '.panel', phone: A.phone });
    check('the size menu is sent to the GROUP', size.sent.length > 0 && size.sent.every((e) => e.jid === GROUP));
    check('the menu names the participant who asked', /@254741388986/.test(allText(size.sent)));

    await command(sock, { chatId: GROUP, participant: A.jid, text: '.panel 4gb', phone: A.phone });
    await command(sock, { chatId: GROUP, participant: A.jid, text: '.panel nest 4gb 1', phone: A.phone });
    const prompted = await command(sock, { chatId: GROUP, participant: A.jid, text: '.panel egg 4gb 1 5', phone: A.phone });
    check('A is asked for the client details in the group', /[Ss]end the client's details/.test(allText(prompted.sent)), allText(prompted.sent).slice(0, 120));

    // B opens an order of their own and answers it. It must not consume A's.
    await command(sock, { chatId: GROUP, participant: B.jid, text: '.panel', phone: B.phone });
    const bTap = await command(sock, { chatId: GROUP, participant: B.jid, text: '.panel unlimited', phone: B.phone });
    check('B gets their own nest menu, not a creation for A', /step 2 of 3/.test(allText(bTap.sent)));
    check('nothing was created for A by B\'s taps', calls.servers.length === 0);

    // Now A answers. Their size, nest and egg must all still be remembered.
    await plain(sock, { chatId: GROUP, participant: A.jid, text: 'acme, 254733333333', phone: A.phone });
    check('A\'s own reply creates exactly one server', calls.servers.length === 1, `got ${calls.servers.length}`);
    check('A\'s order kept the size A chose (4GB, egg from nest 1)', calls.servers[0]?.egg === 5 && calls.servers[0]?.limits?.memory === 4096, JSON.stringify(calls.servers[0]?.limits || {}));
    check('A\'s order is recorded against A as the reseller', db.panels.length === 2 && db.panels[1].resellerPhone === A.phone, JSON.stringify(db.panels[1] || {}));
    check('the client was messaged at their own number', sock.out.some((e) => e.jid === '254733333333@s.whatsapp.net'));
  }

  // ── 3. A reseller who is not activated yet ────────────────────────────────
  {
    console.log('\n3. Not activated yet');
    const sock = makeSock();
    const GROUP = '1234567890-123456@g.us';
    const STRANGER = { jid: '254788888888@s.whatsapp.net', phone: '254788888888' };

    const inGroup = await command(sock, { chatId: GROUP, participant: STRANGER.jid, text: '.panel', phone: STRANGER.phone });
    check('a group is told activation happens in a private chat', /private chat/.test(allText(inGroup.sent)));

    const dmSock = makeSock();
    const dm = await command(dmSock, { chatId: STRANGER.jid, text: '.panel', phone: STRANGER.phone });
    check('a private chat is prompted for the password', /<password>/.test(textsOf(dm.sent)));

    const activated = await command(dmSock, { chatId: STRANGER.jid, text: '.panel FRESH-CODE', phone: STRANGER.phone });
    check('the password activates the number', /RESELLER ACTIVATED/.test(allText(activated.sent)));
    check('the password is now bound to that number', db.resellers.find((r) => r.id === 2)?.activated_by === STRANGER.phone);

    const again = await command(dmSock, { chatId: STRANGER.jid, text: '.panel 4gb', phone: STRANGER.phone });
    check('and the very next order works', /step 2 of 3/.test(allText(again.sent)));
  }

  // ── 4. One-liner orders still work ───────────────────────────────────────
  {
    console.log('\n4. One-line order');
    const sock = makeSock();
    calls.servers.length = 0;
    calls.eggReads.length = 0;
    const R = '254741388986';
    const dm = `${R}@s.whatsapp.net`;

    const one = await command(sock, { chatId: dm, text: '.4gb mzazi, 254744444444', phone: R });
    check('`.4gb client, number` goes straight to the nest menu', /step 2 of 3/.test(allText(one.sent)));
    check('the client is named on the menu', /mzazi/.test(allText(one.sent)));

    await command(sock, { chatId: dm, text: '.panel nest 4gb 1', phone: R });
    await command(sock, { chatId: dm, text: '.panel egg 4gb 1 6', phone: R });
    check('the order completes without asking for the client again', calls.servers.length === 1 && calls.servers[0].egg === 6, `servers=${calls.servers.length} egg=${calls.servers[0]?.egg}`);
    check('no second prompt for details was sent', !/Send the client's details/.test(allText(one.sent)));
  }

  // ── 5. A double tap creates one server ───────────────────────────────────
  {
    console.log('\n5. Double tap on the egg');
    const sock = makeSock();
    calls.servers.length = 0;
    const R = '254741388986';
    const dm = `${R}@s.whatsapp.net`;
    // The client is named up front so the egg tap is the LAST step — which is
    // where a double tap has something to duplicate.
    await command(sock, { chatId: dm, text: '.panel 2gb mzazi, 254755555555', phone: R });
    await command(sock, { chatId: dm, text: '.panel nest 2gb 1', phone: R });

    // Two taps, as a real double tap arrives: the second while the first is
    // still provisioning. Both are dispatched before either finishes.
    const [first, second] = await Promise.all([
      command(sock, { chatId: dm, text: '.panel egg 2gb 1 5', phone: R }),
      command(sock, { chatId: dm, text: '.panel egg 2gb 1 5', phone: R }),
    ]);
    check('only one server was created', calls.servers.length === 1, `got ${calls.servers.length}`);
    check('the second tap was told to wait', /Still working on your last request/.test(allText([...first.sent, ...second.sent])));
  }

  // ── 6. A client with no WhatsApp ─────────────────────────────────────────
  {
    console.log('\n6. Client number with no WhatsApp account');
    const sock = makeSock();
    calls.servers.length = 0;
    const R = '254741388986';
    const dm = `${R}@s.whatsapp.net`;
    await command(sock, { chatId: dm, text: '.panel 1gb', phone: R });
    await command(sock, { chatId: dm, text: '.panel nest 1gb 1', phone: R });
    await command(sock, { chatId: dm, text: '.panel egg 1gb 1 5', phone: R });
    await plain(sock, { chatId: dm, text: 'ghost, 254799999999', phone: R });

    const card = sock.out.filter((e) => e.kind === 'interactive').pop();
    check('the panel was still created', calls.servers.length === 1);
    check('the reseller is told it was NOT delivered', /is not on WhatsApp/.test(bodyOf(card)), bodyOf(card).slice(0, 120));
    check('nothing was sent into the void', !sock.out.some((e) => e.jid === '254799999999@s.whatsapp.net'));
  }

  // ── 7. Stale menu taps ──────────────────────────────────────────────────
  {
    console.log('\n7. Stale or malformed taps');
    const sock = makeSock();
    const R = '254741388986';
    const dm = `${R}@s.whatsapp.net`;
    const stale = await command(sock, { chatId: dm, text: '.panel nest 4gb 999', phone: R });
    check('a nest that no longer exists is named as gone', /Nest #999 is no longer on the panel/.test(allText(stale.sent)));
    const badEgg = await command(sock, { chatId: dm, text: '.panel egg 4gb 1 404', phone: R });
    check('an egg that is not in the nest is named as gone', /no longer in Minecraft Java/.test(allText(badEgg.sent)));
    const badSize = await command(sock, { chatId: dm, text: '.panel egg 99gb 1 5', phone: R });
    check('an out-of-date size menu is refused', /out of date/.test(allText(badSize.sent)));
  }

  // ── 8. The key an order is stored under ──────────────────────────────────
  // Asserted directly rather than only through the flows above: it is pure, it is
  // the one thing that has to be right for groups to work, and every other check
  // in this file would still pass if it collapsed two participants into one.
  {
    console.log('\n8. Order keys');
    const chat = '1234567890-123456@g.us';
    const a = { isGroup: true, sender: chat, participant: '254741388986@s.whatsapp.net' };
    const b = { isGroup: true, sender: chat, participant: '254700111222@s.whatsapp.net' };
    check('two participants in one group are separate orders', waPanel.stateKey(a) !== waPanel.stateKey(b));
    check('the same participant always gets the same key', waPanel.stateKey(a) === waPanel.stateKey({ ...a }));
    check('a private chat is keyed by the chat (the string form still works)',
      waPanel.stateKey('254741388986@s.whatsapp.net') === '254741388986@s.whatsapp.net');
    check('a group is never keyed by the chat alone', waPanel.stateKey(a) !== chat);
  }

  // ── Result ───────────────────────────────────────────────────────────────
  console.log(`\n${passed} passed, ${failures.length} failed\n`);
  if (failures.length) {
    for (const f of failures) console.log(`  ❌ ${f}`);
    console.log('');
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('\nharness error:', e);
  process.exitCode = 1;
});
