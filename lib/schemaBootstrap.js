'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA BOOTSTRAP — create the bot's own tables without touching anyone else's
//
// The bot is a Prisma app addressing quoted PascalCase tables ("User",
// "Subscription", "WhatsAppSession", …). Nothing ever created them on a database
// the bot had not run against before, because:
//
//   • this repo has no `prisma/migrations` folder, so `prisma migrate deploy`
//     has nothing to apply and exits without an error, and
//   • the boot check called `prisma migrate deploy --skip-generate`, a flag that
//     command does not accept — it failed with "unknown or unexpected option"
//     on every start and the warns hid it.
//
// `prisma db push` is NOT the fix: this database is shared with mzazi.shop, and
// db push drops every table that is not in schema.prisma (bot_commands,
// bot_control, bot_status, settings, packages, …). That is why the boot check
// refuses it.
//
// So the tables are created here, idempotently, with the exact shape
// schema.prisma declares. CREATE … IF NOT EXISTS never alters or drops a table
// that already exists, which makes this safe on the shared production database
// and on a fresh one alike. Kept in sync with prisma/schema.prisma and with
// mzazi89/web's lib/database.js, which creates the same tables for the site.
// ─────────────────────────────────────────────────────────────────────────────

// Order matters: the foreign keys need "User" to exist first.
const TABLES = [
  ['User', `
    CREATE TABLE IF NOT EXISTS "User" (
      "id" SERIAL PRIMARY KEY,
      "telegramId" BIGINT NOT NULL,
      "username" TEXT,
      "firstName" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "User_telegramId_key" ON "User"("telegramId")`],

  ['Subscription', `
    CREATE TABLE IF NOT EXISTS "Subscription" (
      "id" SERIAL PRIMARY KEY,
      "userId" INTEGER NOT NULL REFERENCES "User"("id"),
      "plan" TEXT NOT NULL DEFAULT 'FREE',
      "maxDevices" INTEGER NOT NULL DEFAULT 1,
      "startDate" TIMESTAMP(3),
      "endDate" TIMESTAMP(3),
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_userId_key" ON "Subscription"("userId")`],

  ['WhatsAppSession', `
    CREATE TABLE IF NOT EXISTS "WhatsAppSession" (
      "id" SERIAL PRIMARY KEY,
      "userId" INTEGER NOT NULL REFERENCES "User"("id"),
      "phoneNumber" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppSession_phoneNumber_key" ON "WhatsAppSession"("phoneNumber")`],

  ['Payment', `
    CREATE TABLE IF NOT EXISTS "Payment" (
      "id" SERIAL PRIMARY KEY,
      "userId" INTEGER NOT NULL REFERENCES "User"("id"),
      "reference" TEXT NOT NULL,
      "amount" DOUBLE PRECISION NOT NULL,
      "plan" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "paystackRef" TEXT,
      "couponUsed" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Payment_reference_key" ON "Payment"("reference")`],

  ['Transaction', `
    CREATE TABLE IF NOT EXISTS "Transaction" (
      "id" SERIAL PRIMARY KEY,
      "userId" INTEGER NOT NULL REFERENCES "User"("id"),
      "type" TEXT NOT NULL,
      "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "description" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`],

  ['Coupon', `
    CREATE TABLE IF NOT EXISTS "Coupon" (
      "id" SERIAL PRIMARY KEY,
      "code" TEXT NOT NULL,
      "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "maxUses" INTEGER NOT NULL DEFAULT 1,
      "usesCount" INTEGER NOT NULL DEFAULT 0,
      "expiresAt" TIMESTAMP(3),
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Coupon_code_key" ON "Coupon"("code")`],

  ['Log', `
    CREATE TABLE IF NOT EXISTS "Log" (
      "id" SERIAL PRIMARY KEY,
      "userId" INTEGER REFERENCES "User"("id") ON DELETE SET NULL,
      "action" TEXT NOT NULL,
      "details" TEXT,
      "level" TEXT NOT NULL DEFAULT 'INFO',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`],
];

/**
 * Create every bot-side table that is missing. Never throws for an existing
 * table, never alters one, never drops anything.
 *
 * @param {object} [client] a PrismaClient to run on; defaults to the bot's own.
 * @returns {Promise<{created: string[], tables: string[]}>}
 */
async function ensureSchema(client) {
  const prisma = client || require('./botDb').prisma;

  const present = async () => {
    try {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = ANY($1)`,
        TABLES.map(([name]) => name)
      );
      return new Set(rows.map((r) => r.table_name));
    } catch {
      // information_schema unreadable — assume nothing exists and let the
      // CREATE … IF NOT EXISTS statements decide.
      return new Set();
    }
  };

  const before = await present();

  for (const [name, create, index] of TABLES) {
    try {
      await prisma.$executeRawUnsafe(create);
      if (index) await prisma.$executeRawUnsafe(index);
    } catch (e) {
      // One broken table must not stop the bot from booting; report it and go on.
      throw new Error(`${name}: ${e.message}`);
    }
  }

  const after = await present();
  const created = TABLES.map(([name]) => name).filter((n) => !before.has(n) && after.has(n));
  return { created, tables: TABLES.map(([name]) => name).filter((n) => after.has(n)) };
}

module.exports = { ensureSchema, TABLES };
