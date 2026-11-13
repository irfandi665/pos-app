'use strict';

const { initDb } = require('./db');
const { createApp } = require('./app');
const { startQrisExpirySweeper, stopQrisExpirySweeper } = require('./sweeper');
const { initializePermissions } = require('./services/rbac');

const PORT = process.env.PORT || 3000;

async function startServer() {
  await initDb();
  await initializePermissions();

  const app = createApp();
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`================================================================`);
    console.log(` POS Toko Web dengan Rekonsiliasi QRIS Otomatis Berjalan!`);
    console.log(` URL: http://localhost:${PORT}`);
    console.log(` API Endpoint: http://localhost:${PORT}/api/health`);
    console.log(`================================================================`);
  });

  startQrisExpirySweeper(Number(process.env.QRIS_SWEEP_INTERVAL_MS || 60_000));

  const shutdown = () => {
    stopQrisExpirySweeper();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = { startServer };
