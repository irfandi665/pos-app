#!/usr/bin/env bash
set -e

echo "=========================================================="
echo " Starting POS Toko dengan Rekonsiliasi QRIS Otomatis"
echo "=========================================================="

# Ensure database directory exists
mkdir -p server/data

# Run database seed if sqlite database doesn't exist
if [ ! -f server/data/pos_qris.sqlite ]; then
  echo "Menginisialisasi database dan seed data awal..."
  node server/seed.js
fi

# Build frontend if dist doesn't exist
if [ ! -d client/dist ]; then
  echo "Membangun tampilan web (client dist)..."
  cd client && npm install && npm run build && cd ..
fi

echo "Menjalankan server aplikasi di http://localhost:3000..."
node server/index.js
