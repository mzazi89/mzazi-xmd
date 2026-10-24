const prisma = require('./lib/prismaClient');

async function main() {
  try {
    const results = await prisma.$queryRawUnsafe(`
      SELECT id, action, payload, status, result, created_at
      FROM bot_control
      WHERE action = 'pair'
      AND status = 'failed'
      ORDER BY created_at DESC
      LIMIT 5
    `);
    console.log(JSON.stringify(results, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
