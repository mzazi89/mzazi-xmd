// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP PANEL RESELLER FLOW — .panel / .unlimited
//
//  • A WhatsApp number must first be an ACTIVATED RESELLER (it entered a
//    reseller password that the admin sold/generated — see the admin panel).
//    Activation happens in a PRIVATE chat: the password is the reseller's
//    credential, and a group would hand it to every member who reads the chat,
//    along with the ability to spend it first.
//  • Activated resellers create Pterodactyl panels for clients:
//      .panel                     → size menu (1GB – 10GB + UNLIMITED)
//      .panel <size>              → nest menu
//      .panel <username>, <phone> → size menu (client remembered)
//      .panel nest  <size> <nestId>            → egg menu    (button)
//      .panel egg   <size> <nestId> <eggId>    → create      (button)
//      .<size> <username>, <phone>             → straight to the nest menu
//  • The RESELLER chooses the nest and the egg — nothing is picked for them.
//  • The panel is created with the generated password, and the login details
//    are (a) sent back to the reseller and (b) FORWARDED to the client's
//    WhatsApp number that the order named.
//
// Works in a private chat and in a group. In a group the reseller is the
// PARTICIPANT who sent the message, so every piece of state is keyed by that
// participant and every reply names whose order it belongs to.
//
// Deliberately self-contained (no case.js closures): replies use the socket
// directly, state lives in this module.
// ─────────────────────────────────────────────────────────────────────────────
const { sendInteractiveMessage } = require('./interactive');
const panelBuy = require('./panelBuy');

// Pending orders per chat — and per participant inside a group.
//   { step: 'client' | 'size', client?, size?, nestId?, eggId? }
const pendingOrders = new Map();

// Orders currently being created, so a double tap on an egg cannot create two
// servers for one client. Keyed the same way as pendingOrders.
const inFlight = new Set();

// How many unreadable replies an open order tolerates before it is abandoned. A
// bound, not a preference: it is what stops a self-feeding reply loop.
const MAX_UNREADABLE = 3;

// WhatsApp single_select limits: 10 rows per message, 24 characters in a row
// title, 72 in a description, 24 in a section title. A row that breaks one of
// them does not render trimmed, it fails to send — so every label is cut here
// rather than trusted to be short.
const CUT = (value, max) => {
  const t = String(value == null ? '' : value).trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};
const NEST_PAGE = 9;
const EGG_PAGE = 9;

// ─── State keys ───────────────────────────────────────────────────────────────
// In a group, `sender` is the group jid for EVERY member: keying on it alone
// would let two resellers in one group overwrite each other's half-finished
// order. The participant makes the key personal without splitting the replies.
function normalizeState(arg) {
  if (typeof arg === 'string') return { isGroup: false, sender: arg, participant: '' };
  const a = arg || {};
  return {
    isGroup: !!a.isGroup,
    sender: String(a.sender || ''),
    participant: String(a.participant || ''),
  };
}

function stateKey(arg) {
  const { isGroup, sender, participant } = normalizeState(arg);
  return isGroup ? `${sender}|${participant}` : sender;
}

function hasPending(arg) { return pendingOrders.has(stateKey(arg)); }
function clearPending(arg) { pendingOrders.delete(stateKey(arg)); }

// Claim the right to create, for this chat and participant. SYNCHRONOUS on
// purpose: two taps that arrive together are dispatched in the same tick, and any
// check that runs after an `await` is passed by both of them before either has
// claimed anything. Whichever call gets here first wins; the other is told to
// wait. See createPanelForClient for how a claim is released.
function acquireCreate(key) {
  if (inFlight.has(key)) return false;
  inFlight.add(key);
  return true;
}

function releaseCreate(key) {
  inFlight.delete(key);
}

// One sentence for both jobs this guard does — a creation already running, and a
// tap that arrived while the previous one was still being handled. It says what is
// true in either case and asks for the one thing that fixes it.
const WAIT_MESSAGE = '⏳ Still working on your last request — give it a moment to finish, then try again.';

function parseClientLine(raw) {
  const line = String(raw || '').trim();
  if (!line) return null;
  const m = line.match(/^([A-Za-z0-9_]{3,20})\s*[, ]+\s*(.+)$/);
  if (!m) return null;
  const username = m[1];
  const phone = panelBuy.normalizeWaPhone(m[2]);
  if (!phone) return null;
  return { username, phone };
}

// ─── Sending ──────────────────────────────────────────────────────────────────
//
// `ctx` is { mzazi, sender, isGroup, senderPhone }. In a group every reply opens
// with the reseller's number, because a group can have several orders open at
// once and "panel created" with no name on it is useless to everyone reading.
//
// The mention is passed for text replies (which go through sendMessage and can
// carry contextInfo). Interactive menus are built by gifted-btns, which drops
// contextInfo — there the same `@number` stays plain text.
function who(ctx) {
  return ctx && ctx.isGroup && ctx.senderPhone ? `👤 @${ctx.senderPhone}\n\n` : '';
}

async function sendText(ctx, txt) {
  const { mzazi, sender, isGroup, senderPhone } = ctx;
  const full = who(ctx) + txt;
  try {
    const payload = { text: full };
    if (isGroup && senderPhone) {
      payload.contextInfo = { mentionedJid: [`${senderPhone}@s.whatsapp.net`], forwardingScore: 1, isForwarded: true };
    }
    await mzazi.sendMessage(sender, payload);
  } catch (e) {
    // A mention is decoration; retrying without it must still deliver the text.
    try {
      await mzazi.sendMessage(sender, { text: full });
    } catch (e2) {
      console.error('waPanel sendText error:', e2.message);
    }
  }
}

// Why an activation attempt failed, said plainly.
//
// The old code answered every failure that was not ALREADY with "Invalid reseller
// password", including the case where the NUMBER could not be used at all — so a
// reseller on an unaccepted number was told to check their password with the seller,
// and the seller had nothing to check. Each cause gets its own sentence now.
function activationError(error, prefix, seen) {
  switch (error) {
    case 'ALREADY':
      return '❌ That reseller password has already been used on another number.\n\nEach password activates exactly one number. Ask the seller for a new one.';
    case 'DISABLED':
      return '❌ That reseller password has been disabled by the seller. Please contact them.';
    case 'PHONE':
      // Name what the bot actually read. Without it this failure is a dead end:
      // the number looked perfectly good to the person sending it, so "check your
      // number" gives them nothing to check.
      return `❌ I can't use this number for a reseller account.\n\n` +
        `Send from your own WhatsApp number in the 07XXXXXXXX or 01XXXXXXXX format, then try again.` +
        (seen ? `\n\n_(the number I read from this chat: ${seen})_` : '');
    default:
      return `❌ That reseller password was not found.\n\nCheck it with the seller and send it exactly as you received it:\n${prefix}panel <password>`;
  }
}

function sizeLabel(size) {
  const spec = panelBuy.PANEL_SIZES[String(size || '').toLowerCase()];
  return spec ? spec.label : String(size || '').toUpperCase();
}

// Sent when the reseller is not activated (or cannot be, in a group).
async function sendActivationPrompt(ctx, { prefix, plain = false }) {
  if (ctx.isGroup) {
    await sendText(ctx,
      `🔐 *RESELLER ACCESS*\n\n` +
      `Creating panels requires an activated reseller account.\n\n` +
      `Reseller passwords are entered in a *private chat* — send this to me there:\n` +
      `${prefix}panel <password>`
    );
    return;
  }
  await sendText(ctx, plain
    ? `🔐 *RESELLER ACCESS*\n\n` +
      `Creating panels requires an activated reseller account.\n\n` +
      `👉 Send the reseller password you were given:\n` +
      `${prefix}panel <password>`
    : `👤 Send the reseller password you were given, exactly as the seller gave it:\n` +
      `${prefix}panel <password>`
  );
}

// ─── Menus ────────────────────────────────────────────────────────────────────

// Step 1 — the RAM size.
async function sendSizeMenu(ctx, { client = null } = {}) {
  const { mzazi, sender, prefix } = ctx;
  const sections = [];
  for (let start = 1; start <= 10; start += 3) {
    const rows = [];
    for (let gb = start; gb <= Math.min(start + 2, 10); gb++) {
      rows.push({
        id: `${prefix}panel ${gb}gb`,
        title: CUT(`${gb}GB RAM`, 24),
        description: panelBuy.PANEL_SIZES[`${gb}gb`].disk >= 1024
          ? CUT(`${Math.round(panelBuy.PANEL_SIZES[`${gb}gb`].disk / 1024)}GB SSD · ${panelBuy.PANEL_SIZES[`${gb}gb`].cpu}% CPU`, 72)
          : 'Full SSD storage',
      });
    }
    sections.push({ title: CUT(`${start} – ${Math.min(start + 2, 10)}GB`, 24), rows });
  }

  await sendInteractiveMessage(mzazi, sender, {
    title: '🖥 MZAZI PANEL RESELLER',
    // The menu states the order the steps happen in, so it cannot read the same
    // whichever way round they were given. With the client already supplied it only
    // has to ask for the size — and naming the client is what shows the details were
    // actually taken.
    text: who(ctx) + (client
      ? `Creating a panel for:\n*${client.username}* — ${client.phone}\n\n` +
        `Pick the RAM size below.`
      : 'Pick the RAM size to create for your client.\n\n' +
        'Or send the client first:\n' +
        '`username, whatsapp-number`\n\n' +
        'e.g. mzazi, 254741388986'),
    footer: '⚡ Powered by MZAZI TECH INC',
    interactiveButtons: [
      {
        name: 'single_select',
        buttonParamsJson: JSON.stringify({ title: 'Select RAM size', sections }),
      },
      {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
          display_text: '∞ UNLIMITED',
          id: `${prefix}panel unlimited`,
        }),
      },
    ],
  });
}

// The "who is this for" line shared by steps 2 and 3. Naming the client on every
// step is what lets a reseller with two orders open tell which one they are in.
function clientLine(client) {
  return client ? `Client: *${client.username}* — ${client.phone}\n\n` : '';
}

// Step 2 — the nest. Listed from the panel the bot is configured to create on.
async function sendNestMenu(ctx, { size, page = 0, client = null }) {
  const { mzazi, sender, prefix } = ctx;
  const label = sizeLabel(size);

  let nests;
  try {
    nests = await panelBuy.getNests();
  } catch (e) {
    await sendText(ctx, `❌ Could not read the nests from the panel.\n\n${e.message}`);
    return;
  }

  // A nest with no eggs cannot host a server, so it is not offered.
  const usable = nests.filter((n) => (n.eggs || []).length > 0);
  if (!usable.length) {
    await sendText(ctx, '❌ No nests with eggs are configured on the panel yet.\n\nAsk the seller to add one in the panel.');
    return;
  }

  const start = page * NEST_PAGE;
  const slice = usable.slice(start, start + NEST_PAGE);
  if (!slice.length) {
    await sendText(ctx, `❌ There are no more nests. Send ${prefix}panel to start again.`);
    return;
  }

  const rows = slice.map((n) => ({
    id: `${prefix}panel nest ${size} ${n.id}`,
    title: CUT(n.name, 24),
    description: CUT(`${n.eggs.length} egg${n.eggs.length === 1 ? '' : 's'} · ${label} plan`, 72),
  }));
  const remaining = usable.length - (start + slice.length);
  if (remaining > 0) {
    rows.push({
      id: `${prefix}panel nests ${size} ${page + 1}`,
      title: '➡️ More nests',
      description: CUT(`${remaining} more nest${remaining === 1 ? '' : 's'}`, 72),
    });
  }

  await sendInteractiveMessage(mzazi, sender, {
    title: '🧩 SELECT NEST',
    text: who(ctx) +
      `*${label} PANEL* — step 2 of 3\n\n` +
      clientLine(client) +
      `Pick the nest to take the egg from.`,
    footer: '⚡ Powered by MZAZI TECH INC',
    interactiveButtons: [
      { name: 'single_select', buttonParamsJson: JSON.stringify({ title: 'Select nest', sections: [{ title: CUT(`Nests ${start + 1}–${start + slice.length}`, 24), rows }] }) },
      { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '❌ Cancel', id: `${prefix}cancel` }) },
    ],
  });
}

// Step 3 — the egg, from the nest that was chosen.
async function sendEggMenu(ctx, { size, nestId, page = 0, client = null }) {
  const { mzazi, sender, prefix } = ctx;
  const label = sizeLabel(size);

  let nests;
  try {
    nests = await panelBuy.getNests();
  } catch (e) {
    await sendText(ctx, `❌ Could not read the eggs from the panel.\n\n${e.message}`);
    return;
  }

  const nest = nests.find((n) => String(n.id) === String(nestId));
  if (!nest) {
    await sendText(ctx, `❌ Nest #${nestId} is no longer on the panel. Send ${prefix}panel to start again.`);
    return;
  }
  const eggs = nest.eggs || [];
  if (!eggs.length) {
    await sendText(ctx, `❌ *${nest.name}* has no eggs. Send ${prefix}panel to pick another nest.`);
    return;
  }

  const start = page * EGG_PAGE;
  const slice = eggs.slice(start, start + EGG_PAGE);
  if (!slice.length) {
    await sendText(ctx, `❌ There are no more eggs in *${nest.name}*. Send ${prefix}panel to start again.`);
    return;
  }

  // The nest name is in the description on purpose. In a group a tap can come
  // back as the row's label instead of its id, and the label is matched against
  // the menus sent to that chat — two nests can each hold an egg called "Paper",
  // and the nest name is what keeps the two labels distinct.
  const rows = slice.map((e) => ({
    id: `${prefix}panel egg ${size} ${nest.id} ${e.id}`,
    title: CUT(e.name, 24),
    description: CUT(`${nest.name} · Egg #${e.id}`, 72),
  }));
  const remaining = eggs.length - (start + slice.length);
  if (remaining > 0) {
    rows.push({
      id: `${prefix}panel eggs ${size} ${nest.id} ${page + 1}`,
      title: '➡️ More eggs',
      description: CUT(`${remaining} more egg${remaining === 1 ? '' : 's'}`, 72),
    });
  }

  await sendInteractiveMessage(mzazi, sender, {
    title: '🥚 SELECT EGG',
    text: who(ctx) +
      `*${label} PANEL* — step 3 of 3\n\n` +
      clientLine(client) +
      `Nest: *${nest.name}*\n\n` +
      `Pick the egg to build the server from.`,
    footer: '⚡ Powered by MZAZI TECH INC',
    interactiveButtons: [
      { name: 'single_select', buttonParamsJson: JSON.stringify({ title: 'Select egg', sections: [{ title: CUT(`Eggs ${start + 1}–${start + slice.length}`, 24), rows }] }) },
      { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '❌ Cancel', id: `${prefix}cancel` }) },
    ],
  });
}

// ─── Creation + success/error card ───────────────────────────────────────────

function specLineFor(panel) {
  return panel.ram > 0
    ? `${panel.ram >= 1024 ? panel.ram / 1024 + 'GB' : panel.ram + 'MB'} RAM · ${panel.disk >= 1024 ? Math.round(panel.disk / 1024) + 'GB' : panel.disk + 'MB'} SSD · ${panel.cpu || 0}% CPU`
    : 'No limits · maximum performance';
}

// The message the CLIENT receives — the whole point of the order, so it is
// written for someone who has never heard of the bot or the reseller.
function clientDetailsText(panel) {
  return (
    `🖥 *MZAZI PANEL — YOUR LOGIN DETAILS*\n\n` +
    `📦 Plan: *${panel.package}*\n` +
    `⚙️ ${specLineFor(panel)}\n\n` +
    `🌐 Panel: ${panel.panel_url}\n` +
    `👤 Username: \`${panel.username}\`\n` +
    `🔐 Password: \`${panel.password}\`\n\n` +
    `Open the panel link above and log in with these details.\n` +
    `Keep them private — anyone who has them can control your server.`
  );
}

// Forward the details to the client's WhatsApp number.
//
// The number is checked with onWhatsApp first: sending into a number with no
// WhatsApp account does not error reliably, and a silent non-delivery reported
// as "sent" is how a client ends up waiting for details that never came. If the
// check itself fails the send is still attempted — a failed check must not
// become a failed delivery.
async function notifyClient(mzazi, phone, panel) {
  const jid = `${phone}@s.whatsapp.net`;
  try {
    if (mzazi && typeof mzazi.onWhatsApp === 'function') {
      const res = await mzazi.onWhatsApp(jid);
      const list = Array.isArray(res) ? res : [];
      if (list.length && list.every((r) => !r || r.exists === false)) {
        return { ok: false, reason: 'no-whatsapp' };
      }
    }
  } catch (e) {
    // Number check unavailable — fall through and send.
  }

  try {
    await mzazi.sendMessage(jid, { text: clientDetailsText(panel) });
    return { ok: true };
  } catch (e) {
    console.error('waPanel client forward error:', e.message);
    return { ok: false, reason: 'send-failed', error: e.message };
  }
}

// `armed` says the caller has already claimed the create for this chat — the
// group/participant key is claimed before this call is made, so that a second tap
// dispatched in the same tick is stopped. Without it this claims and releases its
// own, which is what the plain-text reply path relies on.
async function createPanelForClient(ctx, { prefix, resellerPhone, username, phone, size, nestId = null, eggId = null }, { armed = false } = {}) {
  const key = stateKey(ctx);

  // One tap, one server. A second tap while the first is still provisioning (a
  // panel takes seconds) would otherwise create a duplicate and charge the
  // reseller a username they cannot reuse.
  if (!armed) {
    if (!acquireCreate(key)) {
      await sendText(ctx, WAIT_MESSAGE);
      return false;
    }
  }

  try {
    await sendText(ctx, `⏳ Creating the ${sizeLabel(size)} panel for *${username}*… (automatic provisioning)`);
    const panel = await panelBuy.createWhatsappPanel({ username, phone, size, resellerPhone, nestId, eggId });

    // Forward to the client first, so the reseller's card can say what happened
    // to it. The panel exists either way — a delivery failure is reported, not
    // treated as a failed order.
    const delivery = await notifyClient(ctx.mzazi, phone, panel);

    const deliveryLine = delivery.ok
      ? `📤 Details sent to the client on WhatsApp (${phone}).`
      : delivery.reason === 'no-whatsapp'
        ? `⚠️ *${phone} is not on WhatsApp* — the details were NOT delivered. Send them to the client yourself.`
        : `⚠️ Could not send the details to ${phone}${delivery.error ? ` (${delivery.error})` : ''}. Send them yourself.`;

    await sendInteractiveMessage(ctx.mzazi, ctx.sender, {
      title: '✅ PANEL CREATED',
      text:
        who(ctx) +
        `🎉 Client panel is ready!\n\n` +
        `🖥 Server: *${panel.package}*\n` +
        `⚙️ ${specLineFor(panel)}\n` +
        `🧩 Nest: *${panel.nestName || '—'}* · Egg: *${panel.eggName || '—'}*\n\n` +
        `🌐 Panel: ${panel.panel_url}\n` +
        `👤 Username: \`${panel.username}\`\n` +
        `🔐 Password: \`${panel.password}\`\n` +
        `📱 Client: ${phone}\n\n` +
        deliveryLine + `\n\n` +
        `Login at the panel URL with these details.`,
      footer: '⚡ Powered by MZAZI TECH INC',
      interactiveButtons: [
        {
          name: 'cta_url',
          buttonParamsJson: JSON.stringify({ display_text: '🔗 OPEN PANEL', url: panel.panel_url }),
        },
        {
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({ display_text: '🖥 Create another', id: `${prefix}panel` }),
        },
        {
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({ display_text: '📜 Menu', id: `${prefix}menu` }),
        },
      ],
    });
    return true;
  } catch (e) {
    console.error('waPanel create error:', e.message);
    await sendText(ctx,
      `❌ *Panel creation failed:* ${e.message}\n\n` +
      `If the username is already taken on the panel, pick a different one.`
    );
    return false;
  } finally {
    if (!armed) releaseCreate(key);
  }
}

// ─── Command entry: .panel / .unlimited / sizes (+ .cancel while pending) ─────
//
// ctx: { mzazi, sender, participant, isGroup, command, args, prefix, senderPhone }
//   sender      — the CHAT to answer in (group jid or DM jid)
//   participant — who actually typed (the reseller, in a group)
async function handleCommand(ctx) {
  const { mzazi, sender, isGroup, command, args, prefix, senderPhone } = ctx;
  const stateArg = { isGroup, sender, participant: ctx.participant };

  // .cancel aborts a pending order
  if (command === 'cancel' && hasPending(stateArg)) {
    clearPending(stateArg);
    await sendText(ctx, '❌ Order cancelled. Nothing was created.');
    return true;
  }

  // `.panel` takes the size as its first argument; each size is ALSO a command of
  // its own, so a whole order fits in one line (`.4gb mzazi, 2547…`).
  const sizeNames = panelBuy.listSizes();
  const isSizeCommand = sizeNames.includes(command);
  if (command !== 'panel' && !isSizeCommand) return false;

  const resellerRow = await panelBuy.getReseller(senderPhone);
  const reseller = !!resellerRow;

  // Sub-commands that belong to a menu tap rather than to a typed order.
  const sub = String(args[0] || '').toLowerCase();
  const isMenuCommand = ['nest', 'nests', 'egg', 'eggs'].includes(sub);

  // ── Not activated yet: whatever follows .panel is the activation password ──
  if (!reseller) {
    // ANY text after the command is treated as a password attempt.
    //
    // This used to require /^[A-Za-z0-9]{6,}$/, so a password the seller had chosen
    // that contained a hyphen, an underscore, an @, a space, or was shorter than six
    // characters was discarded without a word and the prompt simply reappeared —
    // indistinguishable from the bot not seeing the password at all. A password is
    // now taken as given, trimmed, and the real reason is reported when it fails.
    //
    // The exceptions are a RAM size and a menu tap: people do type `.panel 2gb`
    // before they are activated, and answering that with "password not found" would
    // be unhelpful.
    const attempt = args.join(' ').trim();
    const looksLikeSize = sizeNames.includes(attempt.toLowerCase());

    if (attempt && !looksLikeSize && !isMenuCommand) {
      // Activation is private-chat only — see the header note. In a group the
      // password would be readable by every member, and the first member to type
      // it would bind it to THEIR number.
      if (isGroup) {
        await sendActivationPrompt(ctx, { prefix });
        return true;
      }
      const r = await panelBuy.activateReseller(attempt, senderPhone);
      if (r.ok && r.already) {
        await sendText(ctx,
          `✅ This number is already an activated reseller — that password is the one it uses.\n\nSend ${prefix}panel to create a panel for a client.`
        );
        return true;
      }
      if (r.ok) {
        await sendInteractiveMessage(mzazi, sender, {
          title: '✅ RESELLER ACTIVATED',
          text: `Welcome aboard 🎉 Your number is now a MZAZI panel reseller.\n\nTap below to create a panel for a client, or send .unlimited username, 07XXXXXXXX directly.`,
          footer: '⚡ Powered by MZAZI TECH INC',
          interactiveButtons: [
            {
              name: 'quick_reply',
              buttonParamsJson: JSON.stringify({ display_text: '🖥 Create Panel', id: `${prefix}panel` }),
            },
            {
              name: 'quick_reply',
              buttonParamsJson: JSON.stringify({ display_text: '📜 Menu', id: `${prefix}menu` }),
            },
          ],
        });
        return true;
      }
      await sendText(ctx, activationError(r.error, prefix, r.seen));
      return true;
    }
    await sendActivationPrompt(ctx, { prefix, plain: true });
    return true;
  }

  // ── Activated reseller ──
  //
  // A tap that lands while the previous one is still provisioning is answered
  // here, BEFORE anything is read or dropped. Checked after the pending state it
  // would be too late to be useful: the tap that started the creation has already
  // cleared that state, so a second tap would look like a fresh order with no
  // client and be asked for details it has already given — while the server it
  // just paid for is still being built.
  if (inFlight.has(stateKey(stateArg))) {
    await sendText(ctx, WAIT_MESSAGE);
    return true;
  }

  // Read whatever is waiting BEFORE dropping it: `.panel username, 2547………` remembers
  // the client so the size chosen next finishes the order without a second question,
  // and that size arrives as a later message (the button on the size menu).
  const waiting = pendingOrders.get(stateKey(stateArg));
  // A new order abandons any half-finished one.
  clearPending(stateArg);

  const carriedClient = waiting && waiting.client ? waiting.client : null;

  // ── Menu taps: nest / nests / egg / eggs ───────────────────────────────────
  // Each of these carries the whole selection in its id, so a tap is answered by
  // what is in the id and never by what happens to be remembered.
  if (command === 'panel' && isMenuCommand) {
    const tapSize = String(args[1] || '').toLowerCase();
    if (!sizeNames.includes(tapSize)) {
      await sendText(ctx, `❌ That menu is out of date. Send ${prefix}panel to start again.`);
      return true;
    }

    if (sub === 'nests') {
      // Paging keeps the whole selection alive, client included: a page-2 tap
      // must not quietly turn a named order into an anonymous one.
      pendingOrders.set(stateKey(stateArg), { step: 'nest', size: tapSize, client: carriedClient });
      await sendNestMenu(ctx, { size: tapSize, page: Math.max(0, parseInt(args[2], 10) || 0), client: carriedClient });
      return true;
    }
    if (sub === 'nest') {
      const nestId = args[2];
      if (nestId === undefined) {
        await sendNestMenu(ctx, { size: tapSize, client: carriedClient });
        return true;
      }
      // The client, if one was already given, rides along in the pending state
      // so the egg tap can finish the order without asking again.
      pendingOrders.set(stateKey(stateArg), { step: 'egg', size: tapSize, nestId, client: carriedClient });
      await sendEggMenu(ctx, { size: tapSize, nestId, client: carriedClient });
      return true;
    }
    if (sub === 'eggs') {
      pendingOrders.set(stateKey(stateArg), { step: 'egg', size: tapSize, nestId: args[2], client: carriedClient });
      await sendEggMenu(ctx, { size: tapSize, nestId: args[2], page: Math.max(0, parseInt(args[3], 10) || 0), client: carriedClient });
      return true;
    }
    // sub === 'egg' — the egg was tapped, so this is the last step of the order.
    const eggId = args[3];
    if (eggId === undefined || args[2] === undefined) {
      await sendNestMenu(ctx, { size: tapSize, client: carriedClient });
      return true;
    }

    // ── The order is CLAIMED here, before the first await in this branch ──────
    //
    // A double tap arrives as two messages dispatched in the same tick, so both
    // run this branch and both are past the check at the top of this function
    // before either has claimed anything. The claim has to be taken, and held
    // until this branch is finished, at a point that runs synchronously after the
    // last await the two of them share.
    //
    // It is held until the prompt or the creation is done on purpose: the pending
    // state is what a second tap is recognised by, and dropping it here is what
    // used to let the second tap look like a brand-new order for a client that had
    // already given its details.
    const key = stateKey(stateArg);
    if (!acquireCreate(key)) {
      await sendText(ctx, WAIT_MESSAGE);
      return true;
    }
    try {
      // Check the tap against the panel BEFORE anything is asked or created: a
      // menu outlives the egg it lists when the admin removes one, and finding
      // that out here means "pick again" instead of a client's details collected
      // for an egg that no longer exists.
      try {
        await panelBuy.resolveNestEgg(args[2], eggId);
      } catch (e) {
        await sendText(ctx, `❌ ${e.message}`);
        return true;
      }

      if (carriedClient) {
        await createPanelForClient(ctx, {
          prefix,
          resellerPhone: senderPhone,
          username: carriedClient.username,
          phone: carriedClient.phone,
          size: tapSize,
          nestId: args[2],
          eggId,
        }, { armed: true });
        return true;
      }

      // No client yet — ask for it, remembering the whole selection.
      pendingOrders.set(key, { step: 'client', size: tapSize, nestId: args[2], eggId });
      await sendText(ctx,
        `🖥 *${sizeLabel(tapSize)} PANEL* — nest and egg selected ✅\n\n` +
        `Send the client's details as:\n` +
        `<username>, <WhatsApp number>\n\n` +
        `e.g. mzazi, 254741388986\n\n` +
        `Reply ${prefix}cancel to abort.`
      );
      return true;
    } finally {
      releaseCreate(key);
    }
  }

  // Where the size comes from: the command itself (`.4gb`) or the first argument
  // (`.panel 4gb`). Whatever follows it is the client's details.
  const first = String(args[0] || '').toLowerCase();
  const size = isSizeCommand ? command : first;
  const details = (isSizeCommand ? args : args.slice(1)).join(' ').trim();

  // ── Details first: `.panel mzazi, 254753405751` ────────────────────────────
  // The client, and then the size is asked for with buttons, so the reseller picks
  // from a list instead of having to know the sizes. Checked before anything is read
  // as a size, because a client's name is not one.
  if (command === 'panel' && !sizeNames.includes(first)) {
    const whole = args.join(' ').trim();

    // The reseller re-sending their OWN password. Checked before anything else because
    // it is the most specific reading of the line — and a password may well contain
    // digits, which would otherwise look like an attempted client line and be answered
    // with "usage:" instead of "you are already activated".
    if (resellerRow && whole && whole.toUpperCase() === String(resellerRow.code || '').toUpperCase()) {
      await sendText(ctx,
        `✅ This number is already an activated reseller — no need to enter the password again.\n\nSend ${prefix}panel to choose a size and create a panel for a client.`
      );
      return true;
    }

    const wanted = parseClientLine(whole);
    if (wanted) {
      // Remembered, not created: the size has not been chosen yet. The menu follows,
      // and the tap on it completes the order.
      pendingOrders.set(stateKey(stateArg), { step: 'size', client: wanted, prefix });
      await sendSizeMenu(ctx, { client: wanted });
      return true;
    }

    // A line that was meant as the client's details but could not be read. Only a COMMA
    // is a reliable sign of that shape — digits alone are not, since a password may
    // contain them.
    if (/,/.test(whole)) {
      await sendText(ctx, clientUsageText(prefix));
      return true;
    }
    // Otherwise carry on: `.panel` alone, `.panel <size>`, or a re-sent password.
  }

  // `.panel` on its own → the size menu.
  if (!size) {
    await sendSizeMenu(ctx, { client: carriedClient });
    return true;
  }

  if (!sizeNames.includes(size)) {
    // Already a reseller, and what they typed is their own password — they are not
    // asking for a size, they are checking whether they are activated.
    const typedWhole = args.join(' ').trim();
    if (resellerRow && typedWhole && typedWhole.toUpperCase() === String(resellerRow.code || '').toUpperCase()) {
      await sendText(ctx,
        `✅ This number is already an activated reseller — no need to enter the password again.\n\nSend ${prefix}panel to choose a size and create a panel for a client.`
      );
      return true;
    }
    await sendSizeMenu(ctx, { client: carriedClient });
    await sendText(ctx, `❌ Unknown size "${args[0]}". Pick from the menu.`);
    return true;
  }

  // ── A size was chosen. The NEXT step is the nest, whichever way the client
  //    details arrived — so a one-line order (`.4gb mzazi, 254741388986`) now
  //    continues through the nest and egg menus rather than creating silently
  //    with a nest the reseller never picked.
  const client = parseClientLine(details) || carriedClient;
  if (details && !client) {
    // Details were typed but could not be read — say the shape. Deliberately does
    // NOT open a half-finished order: the caller asked for one line, not a
    // conversation.
    await sendText(ctx, usageText(prefix, size));
    return true;
  }

  pendingOrders.set(stateKey(stateArg), { step: 'nest', size, client });
  await sendNestMenu(ctx, { size, client });
  return true;
}

// The one-line shape. Quoted with the session's own prefix — an empty string is a
// real prefix (no-prefix mode), so `||` would wrongly show a dot.
function usageText(prefix, size) {
  const p = typeof prefix === 'string' ? prefix : '.';
  return `Usage: ${p}${size} <username>, <WhatsApp number>\n\n` +
    `e.g. ${p}${size} mzazi, 254741388986`;
}

// The shape of `.panel <username>, <WhatsApp number>` — the details-first form, where
// the size is picked from the menu afterwards.
function clientUsageText(prefix) {
  const p = typeof prefix === 'string' ? prefix : '.';
  return `Usage: ${p}panel <username>, <WhatsApp number>\n\n` +
    `e.g. ${p}panel mzazi, 254741388986`;
}

// Commands that own the pending-order state, so the capture must never mistake them
// for the client's details. Sizes are included now that each size is a command:
// without that, `.4gb mzazi, 2547…` would be read as a client called "4gb".
function isPanelCommand(command) {
  const c = String(command || '').toLowerCase();
  return c === 'panel' || c === 'cancel' || panelBuy.listSizes().includes(c);
}

// ─── Plain-text reply while waiting for client details ───────────────────────
//
// Returns true when it has dealt with the message, false to let the caller carry on
// (and run the message as a command instead).
//
// `isKnownCommand` is passed in because only the caller can tell a real command from
// ordinary text: with no prefix configured EVERY message counts as a command, so
// arriving here is no longer a sign that the message is not one.
async function handlePlainInput({ mzazi, sender, participant = null, isGroup = false, budy, senderPhone, prefix, isKnownCommand = false, isPanelCommand = false, isOwnMessage = false }) {
  const stateArg = { isGroup, sender, participant };
  const st = pendingOrders.get(stateKey(stateArg));
  if (!st || st.step !== 'client') return false;

  // `participant` is part of the ctx on purpose: createPanelForClient keys its
  // duplicate-order guard off it, so leaving it out here would give a group reply
  // a different key from the tap that opened the order.
  const ctx = { mzazi, sender, isGroup, senderPhone, participant };

  // A message THIS bot sent is not the owner talking. In a self-chat every message
  // is `fromMe` — the owner's and the bot's — so the caller's record of what it
  // sent is the only way to tell them apart. Swallowed silently and the order left
  // untouched: answering it is what provoked the next one.
  if (isOwnMessage) return true;

  // The prefix to quote back. An empty string is a real prefix (no-prefix mode), so
  // `||` would wrongly fall through to '.' and tell people to type a dot they must
  // not type.
  const p = typeof st.prefix === 'string' ? st.prefix
    : typeof prefix === 'string' ? prefix : '.';

  // A panel command owns this state, so it is NEVER the client's details — and this
  // has to be decided BEFORE parsing. A line like "4gb mzazi, 254753405751" parses
  // perfectly well on its own (the size reads as the username, the rest as the
  // number), so checking afterwards created a client actually named "4gb" and
  // swallowed the command that was meant to create the 4GB panel.
  if (isPanelCommand) return false;

  const client = parseClientLine(budy);
  if (!client) {
    // A real command while the prompt is open means the order is abandoned: drop it
    // and let the command run, exactly as a new command always has.
    if (isKnownCommand) {
      clearPending(stateArg);
      return false;
    }

    // Neither the details nor a command. Say so and KEEP the order, so a typo can be
    // corrected rather than the whole size selection repeated — but only up to a
    // point. While the order stays open, any message the bot itself sent can arrive
    // back as input and provoke another reply, so an unbounded number of retries is
    // an unbounded number of messages. This bound is what makes the loop terminate
    // even if a message of ours is missed by the id record.
    st.fails = (st.fails || 0) + 1;
    if (st.fails > MAX_UNREADABLE) {
      clearPending(stateArg);
      await sendText(ctx,
        `❌ Still couldn't read the client's details, so I've cancelled this order.\n\n` +
        `Send ${p}panel to choose a size again.`
      );
      return true;
    }

    await sendText(ctx,
      `❌ Couldn't read that. Send it exactly as:\n` +
      `username, WhatsApp number\n\n` +
      `e.g. mzazi, 254741388986\n\n` +
      `Type ${p}cancel to abort.`
    );
    return true;
  }

  clearPending(stateArg);
  await createPanelForClient(ctx, {
    prefix: p,
    resellerPhone: senderPhone,
    username: client.username,
    phone: client.phone,
    size: st.size,
    nestId: st.nestId ?? null,
    eggId: st.eggId ?? null,
  });
  return true;
}

module.exports = {
  hasPending,
  clearPending,
  handleCommand,
  handlePlainInput,
  isPanelCommand,
  // Exported because the state key is the one piece of this module that must be
  // right in a group and it is pure, so it can be asserted directly. notifyClient
  // and clientDetailsText are here for the same reason: they are the whole of the
  // "forward the details to the client" step.
  stateKey,
  notifyClient,
  clientDetailsText,
};
