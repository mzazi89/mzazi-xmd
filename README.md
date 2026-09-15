# MZAZI XMD

The **MZAZI XMD** WhatsApp automation bot — a standalone deployment with its own
process, its own configuration and its own command registry.

It is a sibling of [QUARTZ XD](https://github.com/mzazi89/quartz), not a child of
it. Neither repository imports the other; the two share a platform (the website
and the Neon database) and nothing else.

---

## What makes this bot independent

Three things, and each one exists to stop the two bots interfering with each other.

### 1. A different command path

Commands are authored in the website admin panel (admin → Commands) and served
over HTTP. Each bot pulls from its **own** endpoint:

| Bot | Endpoint |
|---|---|
| QUARTZ XD | `GET https://mzazi.shop/api/bot-command` |
| **MZAZI XMD** | `GET https://mzazi.shop/api/xmd-command` |

One endpoint with a `?bot=` parameter would have been less code, but it would
also mean a change for one bot is a change for both. Separate paths keep the
deployments, the keys and the blast radius separate.

The registry lives in the shared Neon `bot_commands` table and is filtered by its
`profile` column. `/api/xmd-command` returns **only** rows where `profile = 'xmd'`,
so a command added for QUARTZ XD can never accidentally execute on this bot.

### 2. Namespaced settings

`settings.js` applies live overrides from the shared `settings` table. QUARTZ owns
rows such as `bot_name`, `bot_profiles`, `remote_api_url`, `bot_api_key` and
`telegram_bot_token`. If XMD read the same rows, whichever bot saved last would
silently reconfigure the other.

So this bot reads **its own keys**, falling back to the shared values only where a
shared value is correct:

| Setting | XMD reads | Falls back to |
|---|---|---|
| Bot name | `xmd_bot_name` | static default |
| Profiles | `xmd_bot_profiles` | `[{"id":"xmd","name":"MZAZI XMD"}]` |
| Command URL | `xmd_remote_api_url` | `https://mzazi.shop/api/xmd-command` |
| Bot API key | `xmd_bot_api_key` | `BOT_API_KEY` / shared key |
| Telegram token | `xmd_telegram_bot_token` | `TELEGRAM_BOT_TOKEN` |
| Connection image | `xmd_connection_image` | static default |

Genuinely platform-wide settings (**owners, Paystack keys, webhook URL, the
mzazi.shop API key**) are deliberately *not* namespaced: they must match across
both bots.

### 3. A distinct bot id

Telemetry upserts `bot_status` keyed by profile id, so this bot writes
`bot_id = 'xmd'` and QUARTZ writes `bot_id = 'quartz'`. Sessions live in
`database/xmd-sessions/` — a directory this bot never shares.

> ### ⚠️ One deployment step is required
>
> **Reconfigure QUARTZ so it no longer claims the `xmd` profile.**
>
> If QUARTZ is still running with `bot_profiles` set to
> `[{"id":"quartz","name":"QUARTZ XD"},{"id":"xmd","name":"MZAZI XMD"}]`, then two
> processes will both write the `bot_status` row for `xmd`, each overwriting the
> other's heartbeat, session list and device metadata about every 30 seconds. The
> dashboard will show a bot flickering between two different device counts.
>
> Fix it on the admin **Settings** page (or via QUARTZ's `BOT_PROFILES` env var) —
> set QUARTZ's `bot_profiles` to just its own identity:
>
> ```json
> [{"id":"quartz","name":"QUARTZ XD"}]
> ```
>
> The **website's** `bot_profiles` setting should stay as it is, listing both —
> that is what lets a user choose MZAZI XMD when they pair a number.

---

## Setup

```bash
npm install
cp .env.example .env      # then fill it in
npm start
```

`npm start` loads the cached command registry immediately, syncs fresh over HTTP,
and then re-syncs every 30 minutes.

### Environment

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Shared Neon PostgreSQL. Used for pairing, sessions, subscriptions, telemetry. |
| `XMD_BOT_API_KEY` | yes | This bot's key for `/api/xmd-command`. Must match the website. |
| `TELEGRAM_BOT_TOKEN` | yes | **Its own** Telegram bot — never share QUARTZ's token, two processes cannot poll the same bot. |
| `REMOTE_API_URL` | no | Override the command endpoint. Defaults to `/api/xmd-command`. |
| `BOT_PROFILES` | no | Defaults to the single `xmd` profile. |
| `PAYSTACK_SECRET_KEY` | for payments | Shared with the website. |
| `MZAZI_API_KEY` | for download commands | Create one in the website API dashboard. |
| `WEBHOOK_PORT` / `WEBHOOK_URL` | no | Set only if you want the local webhook server. |
| `XMD_NEWSLETTER_JID` | no | A WhatsApp channel to auto-follow. Unset means the bot follows none. |

---

## Commands

Command bodies are shipped to the bot by the website and compiled at run time.
Every body is syntax-checked **before** it is written to the database, because a
body with a typo otherwise fails at execution — on a live bot, in front of a
customer, as `Command error: Unexpected token`.

```bash
npm run seed:commands          # dry run: validate every body, write nothing
npm run seed:commands:apply    # write the pack with profile = 'xmd'
npm run test:commands          # run the pack and check what it actually computes
```

The pack lives in `scripts/commands/part*.js`: **236 commands** across eight
parts.

| Category | Commands | Category | Commands |
|---|---:|---|---:|
| Text | 64 | Audio | 8 |
| Generators | 52 | Downloads | 7 |
| Encoding | 35 | Files | 7 |
| Codes | 21 | Documents | 4 |
| Network | 13 | Stickers | 3 |
| Links | 11 | | |
| Images | 11 | **Total** | **236** |

Names must be unique across the whole pack, since the runtime resolves a command
by name first and then by alias, returning the first match — so a duplicate
alias is dead code and an alias that equals another command's name is
unreachable. `npm run seed:commands` fails on either.

### The two checks, and why there are two

`npm run seed:commands` compiles every body and enforces the naming rules. That
proves a body is *valid*; it does not prove the body is *right*. A body can
compile perfectly while operating on the wrong data, because of one subtlety in
how bodies are stored:

> A body is written inside a template literal, so escaping is one-for-one on
> disk and **every backslash must be typed twice**. `\\s` is a whitespace class
> in the compiled function. A single `\s` survives template-literal evaluation as
> a bare `s`, so the body still compiles — and then matches the letter `s`
> instead of whitespace, silently, forever.

The seed script therefore also rejects any non-comment line containing an odd
number of backslashes, which catches that mistake at the door. To build a
backslash inside the output of a command, use `String.fromCharCode(92)` rather
than counting escapes.

`npm run test:commands` covers the other half: it loads the pack, builds the same
context the runtime builds, and runs commands to compare their answers against
values recomputed independently with Python's standard library. It touches no
network and no WhatsApp socket, so it is safe to run anywhere.

### Adding a command

Author it in the lowest-numbered part whose category fits, give every failure
branch a plain-language reply rather than a throw, cap what you print, and use
only values from the wired command context (see `buildCommandContext` in
`case.js`) plus Node built-ins. Then run both scripts — the seed dry run for
syntax and naming, `test:commands` for behaviour.

### Verifying what the live bot is actually serving

From WhatsApp, as owner:

```
.synccmd      # force an immediate re-sync
.cmdstatus    # counts, source URL, last sync time, last error
```

---

## How the pieces fit

```
            ┌──────────────────────────────┐
            │  mzazi.shop  (website)       │
            │  admin → Commands            │
            │         ↓                    │
            │  bot_commands (profile=xmd)  │
            │         ↓                    │
            │  GET /api/xmd-command        │  ← XMD's own path
            └───────────┬──────────────────┘
                        │  Bearer key + HMAC signature
                        ↓
            ┌──────────────────────────────┐
            │  THIS BOT                    │
            │  cache → database/xmdCommands.json
            │  compile → run               │
            └───────────┬──────────────────┘
                        │  pair / status / billing
                        ↓
            ┌──────────────────────────────┐
            │  Neon PostgreSQL             │
            │  bot_control · bot_status    │
            └──────────────────────────────┘
```

The response body is verified against its `X-Mzazi-Signature` header
(HMAC-SHA256, keyed by the bot API key) **before any command code is compiled**,
and the comparison is timing-safe. A tampered body is rejected outright.

Every successful sync is written to `database/xmdCommands.json`, so a brief
website outage means the bot boots from cache rather than losing every command.

---

## Layout

| Path | Role |
|---|---|
| `index.js` | Telegram bot, pairing, subscriptions, admin controls |
| `whatsapp.js` | Baileys connection, sessions, auto-follow |
| `case.js` | Local command handlers |
| `lib/remoteCommands.js` | Fetches, verifies and runs the website-hosted registry |
| `lib/botDb.js` | Prisma client + shared table bootstrap |
| `lib/botTelemetry.js` | Heartbeat, and executes admin actions from the website |
| `lib/profiles.js` | Profile resolution (single profile here: `xmd`) |
| `lib/subscription.js` · `lib/payment.js` | Plans, wallet, Paystack |
| `lib/panelBuy.js` · `lib/waPanel.js` · `lib/userServers.js` | Panel and VPS fulfilment |
| `scripts/seed-commands.js` | Validates and seeds the XMD command pack |
| `prisma/schema.prisma` | Prisma schema (shared database) |

---

## Licence

ISC
