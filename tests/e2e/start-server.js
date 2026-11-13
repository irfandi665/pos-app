'use strict';

const fs = require('fs');
const path = require('path');

const dbPath = process.env.E2E_DATABASE_PATH
  || path.join(__dirname, '.tmp', 'pos-e2e.sqlite');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
for (const suffix of ['', '-wal', '-shm']) {
  try {
    fs.unlinkSync(`${dbPath}${suffix}`);
  } catch (_error) {
    // The file does not exist on a first run.
  }
}

// The server and the seed script must point at the same disposable database.
process.env.DATABASE_PATH = dbPath;
process.env.PORT = process.env.E2E_PORT || '3100';
process.env.QRIS_SWEEP_INTERVAL_MS = process.env.QRIS_SWEEP_INTERVAL_MS || '60000';

async function main() {
  const { seed } = require('../../server/seed');
  await seed();

  const { startServer } = require('../../server/index');
  await startServer();
}

main().catch((error) => {
  console.error('Failed to start E2E server:', error);
  process.exit(1);
});
