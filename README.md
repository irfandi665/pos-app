# Aplikasi POS Toko dengan Rekonsiliasi QRIS Otomatis

Sistem **Point of Sale (POS) Toko Modern Berbasis Web** yang dirancang sesuai spesifikasi PRD versi 1.0 (11 November 2026). Mengintegrasikan transaksi kasir, manajemen stok, pelanggan (CRM), karyawan, tutup shift, dan **rekonsiliasi otomatis pembayaran QRIS Bank Indonesia (H+1)** dalam satu platform web yang ringan, responsif, dan mudah dideploy.

---

## 🚀 Fitur Unggulan Sesuai PRD

### 1. Akses 100% Web (POS Kasir & Back Office)
- Berjalan di peramban (browser) tablet, HP (Android/iOS), laptop, maupun desktop PC kasir tanpa perlu instalasi aplikasi native terpisah.
- Tampilan antarmuka kasir cepat, target sentuh minimal 48dp, responsif, dan mendukung pemindai barcode serta cetak struk thermal ESC/POS (58mm & 80mm).

### 2. QRIS Dinamis & Webhook Real-time
- Pembuatan QRIS Dinamis standar Bank Indonesia (EMVCo) dengan **nominal terkunci** dan masa berlaku 5 menit (hitung mundur otomatis).
- Penerima Webhook PJP berlisensi (Xendit/Midtrans/DOKU) dengan verifikasi tanda tangan (HMAC-SHA256) dan idempoten (mencegah pencatatan ganda).
- Pembaruan layar kasir menjadi **Lunas secara instan (< 1 detik)** melalui Server-Sent Events (SSE).
- **Simulator Pembayaran QRIS Interaktif Terintegrasi**: Menguji pembayaran pelanggan dari BCA Mobile, Livin' Mandiri, BRImo, GoPay, OVO, ShopeePay, dan DANA langsung dari layar POS.

### 3. Rekonsiliasi Settlement Otomatis (H+1)
- Mesin rekonsiliasi otomatis membandingkan Ledger QRIS di POS dengan laporan settlement dari bank/PJP.
- Klasifikasi 4 status pencocokan:
  1. **Matched**: Transaksi cocok sempurna antara kasir dan rekening bank.
  2. **Amount Mismatch**: Selisih nominal bruto atau potongan MDR.
  3. **Missing in POS**: Tercatat di mutasi bank PJP, tetapi kasir tidak menginput transaksi di POS.
  4. **Missing in Settlement**: Tercatat lunas di kasir, tetapi belum cair di mutasi PJP.
- **Antrean Tiket Selisih (Discrepancy Action Queue)**: Setiap selisih otomatis menjadi tiket investigasi yang membutuhkan otorisasi PIN Manajer.
- Ekspor rekapitulasi ledger ke CSV/Excel untuk akuntan toko.

### 4. Transaksi Kasir Lengkap
- Pembayaran Tunai, QRIS Dinamis, Kartu Debit/Kredit (EDC), dan **Split Payment** (kombinasi tunai + QRIS + kartu).
- Kalkulasi PPN 11% / PB1 dan diskon nominal maupun persentase.
- Semua nilai mata uang disimpan sebagai **bilangan bulat Rupiah** (tanpa bug floating point).
- **Save Bill (Hold Orders)**: Menahan transaksi pelanggan untuk melayani antrean berikutnya tanpa menghapus pesanan.
- **Void & Retur**: Wajib otorisasi PIN Manajer dengan pencatatan alasan dan pengembalian stok otomatis.
- Cetak struk printer thermal dan kirim struk digital instan via WhatsApp.

### 5. Manajemen Inventaris & Stock Opname
- Pengurangan stok otomatis saat transaksi lunas; pemulihan stok otomatis saat void/retur.
- Log mutasi barang (stock movement) yang mencatat sumber perubahan (penjualan, retur, void, penyesuaian).
- Peringatan stok menipis (Low Stock Alert).
- **Sesi Stock Opname**: Membandingkan stok sistem vs hitungan fisik toko, menghitung nilai rupiah kerugian penyusutan (*shrinkage*), dan mengunci audit dengan PIN Manajer.

### 6. Rekap Kas Laci & Tutup Shift
- Buka shift dengan modal awal (*cash float*).
- Pencatatan kas masuk & kas keluar (*petty cash* operasional).
- Tutup shift dengan hitung uang fisik laci kasir; selisih kas di atas ambang batas (Rp 10.000) wajib otorisasi PIN Manajer.

### 7. Laporan Keuangan & Analitik Bisnis
- Dasbor Keuangan: Omzet kotor, diskon, PPN, HPP (modal barang), potongan MDR QRIS, laba kotor, dan laba bersih riil.
- Analisis produk terlaris (*fast-moving*) dan produk lambat (*slow-moving*).
- Laporan performa penjualan per kasir/karyawan.

### 8. Keamanan & RBAC (Role-Based Access Control)
- Hak akses berbasis peran: **Kasir**, **Manajer Toko**, dan **Owner**.
- Otorisasi PIN 6-digit untuk tindakan berisiko (Void, Retur, Edit Harga, Stock Opname, Selesai Tiket Selisih).
- Audit Log kekal (*immutable*) yang merekam seluruh aktivitas penting.

---

## 🔑 Kredensial Akun Demonstrasi

Aplikasi telah dilengkapi data awal (seed) siap pakai:

| Peran | Username | Password | PIN Otorisasi | Hak Akses |
|---|---|---|---|---|
| **Kasir** | `kasir` | `kasir123` | - | Transaksi kasir, Hold Bill, Buka/Tutup Shift |
| **Manajer** | `manager` | `manager123` | **654321** | Otorisasi Void/Retur, Rekonsiliasi, Opname, Laporan |
| **Owner** | `owner` | `owner123` | **123456** | Akses penuh, Dasbor Keuangan, Pengaturan Toko & Pajak |

---

## 📦 Panduan Menjalankan & Deploy

### Opsi 1: Menjalankan dengan Docker Compose (Paling Mudah)
Hanya butuh 1 perintah:
```bash
docker compose up -d
```
Aplikasi akan langsung berjalan di:
👉 **http://localhost:3000**

Untuk menghentikan:
```bash
docker compose down
```

---

### Opsi 2: Menjalankan Langsung via Node.js
Pastikan Node.js v18+ atau v20+ terpasang:

1. **Install dependensi & bangun web frontend:**
   ```bash
   npm install
   npm run build
   ```

2. **Jalankan inisialisasi database & seed data:**
   ```bash
   node server/seed.js
   ```

3. **Mulai server aplikasi:**
   ```bash
   npm start
   ```
   Buka peramban di: **http://localhost:3000**

---

### Opsi 3: Script Cepat (Linux / WSL / macOS)
```bash
./start.sh
```

---

## 📁 Struktur Direktori Proyek

```
pos-qris-app/
├── Dockerfile              # Docker build multi-stage production
├── docker-compose.yml      # Orkestrasi Docker container & volume persistensi
├── package.json            # Dependensi backend & script run/build
├── start.sh                # Script inisialisasi & peluncur cepat
├── README.md               # Dokumentasi lengkap sistem
├── server/                 # Backend API (Node.js Express + SQLite3)
│   ├── index.js            # Server utama, static web hosting & SSE real-time
│   ├── db.js               # Inisialisasi skema SQLite, WAL mode & foreign keys
│   ├── seed.js             # Data awal toko, produk, pengguna, dan mock settlement
│   ├── auth.js             # JWT auth & middleware otorisasi PIN Manajer
│   └── routes/             # Endpoint REST API modular
│       ├── auth.js         # Login, profil & verifikasi PIN
│       ├── products.js     # Katalog produk, mutasi stok & stock opname
│       ├── orders.js       # Transaksi POS, split pay, Save Bill, Void, Retur
│       ├── qris.js         # QRIS dinamis, Webhook, Polling & Simulator bayar
│       ├── reconcile.js    # Mesin rekonsiliasi settlement & antrean tiket selisih
│       ├── shifts.js       # Shift buka/tutup & rekonsiliasi kas fisik
│       ├── reports.js      # Laporan omzet, HPP, laba bersih & fast-moving
│       ├── customers.js    # CRM & loyalitas poin pelanggan
│       ├── settings.js     # Pengaturan toko, PPN, MDR, printer struk
│       └── audit.js        # Audit log kekal (immutable)
└── client/                 # Frontend Web (React 18 + Vite + Tailwind CSS)
    ├── src/
    │   ├── api.js          # API client & pendengar Server-Sent Events (SSE)
    │   ├── components/     # Navbar, Modal PIN Manajer, Preview Struk, Simulator QRIS
    │   └── views/          # POS, Hold Bills, Ledger, Rekonsiliasi, Stok, Shift, Laporan
    └── dist/               # Berkas statis web hasil build Vite (siap saji)
```

---

## 🧪 Panduan Menguji Fitur Inti

1. **Menguji Transaksi QRIS Dinamis Real-Time**:
   - Masuk sebagai `kasir`.
   - Pilih beberapa produk ke keranjang.
   - Klik **Bayar Sekarang** &rarr; Pilih tab **QRIS Dinamis** &rarr; Klik **Tampilkan Kode QRIS Dinamis**.
   - Di modal QRIS, pilih sumber dana (misal: *BCA Mobile* atau *GoPay*) lalu klik **Bayar via BCA Mobile (Simulasi < 2s)**.
   - Perhatikan layar otomatis mendeteksi webhook, status langsung berubah menjadi **Lunas**, dan struk belanja langsung tercetak/tampil!

2. **Menguji Rekonsiliasi Settlement Otomatis**:
   - Beralih ke akun `manager` atau `owner`.
   - Buka menu **Rekonsiliasi**.
   - Klik **Jalankan Rekonsiliasi Otomatis** (atau unggah settlement CSV).
   - Sistem akan mencocokkan transaksi dan menampilkan 4 kategori pencocokan (*Matched, Amount Mismatch, Missing in POS, Missing in Settlement*).
   - Pada **Antrean Selisih**, klik **Investigasi & Selesaikan** &rarr; Masukkan PIN Manajer: `654321` &rarr; Tiket berhasil diselesaikan dan dicatat di audit log.

3. **Menguji Stock Opname**:
   - Buka menu **Stok & Produk** &rarr; Tab **Stock Opname (Fisik)**.
   - Ubah salah satu hitungan fisik barang menjadi lebih kecil dari stok sistem.
   - Perhatikan nilai penyusutan (*shrinkage*) rupiah dihitung otomatis.
   - Klik **Simpan Opname (PIN Manajer)** &rarr; Masukkan PIN `654321` &rarr; Stok sistem dan log mutasi otomatis disesuaikan!
