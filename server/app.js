'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

function createApp() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Health Check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      app: 'POS Toko dengan Rekonsiliasi QRIS Otomatis',
      version: '1.1.0',
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

  // Unknown API routes must return JSON, never the SPA shell.
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Endpoint API tidak ditemukan' });
  });

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
          <p>Backend API berjalan.</p>
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

  return app;
}

module.exports = { createApp };
