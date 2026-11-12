const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'POS Toko dengan Rekonsiliasi QRIS Otomatis',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Mount Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/qris', require('./routes/qris'));
app.use('/api/reconcile', require('./routes/reconcile'));
app.use('/api/shifts', require('./routes/shifts'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/audit', require('./routes/audit'));

// Serve frontend static build if exists
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h2>Aplikasi POS Toko dengan Rekonsiliasi QRIS Otomatis</h2>
        <p>Backend API berjalan di port ${PORT}.</p>
        <p>Jalankan client build untuk memuat antarmuka web.</p>
        <a href="/api/health" style="color: #4F46E5;">Cek Health API</a>
      </div>
    `);
  });
}

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Terjadi kesalahan internal server', message: err.message });
});

async function startServer() {
  await initDb();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`================================================================`);
    console.log(` POS Toko Web dengan Rekonsiliasi QRIS Otomatis Berjalan!`);
    console.log(` URL: http://localhost:${PORT}`);
    console.log(` API Endpoint: http://localhost:${PORT}/api/health`);
    console.log(`================================================================`);
  });
}

startServer();
