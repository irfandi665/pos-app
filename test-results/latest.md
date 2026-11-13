# Automated Test Report

- **Status:** PASSED
- **Generated:** 2026-11-13T02:26:00.377Z
- **Duration:** 4.95s
- **Suites:** 6
- **Node:** v22.23.3
- **Platform:** win32/x64

## Summary

| Metric | Value |
|---|---:|
| Total tests | 91 |
| Passed | 91 |
| Failed | 0 |
| Skipped | 0 |

## Test Cases

| Suite | Test | Status | Duration |
|---|---|---|---:|
| tests/integration/qris-returns.test.js | QRIS stock reservation > generate QRIS memotong stok sebagai reservasi dan menyimpan ledger PENDING | PASS | 0.63s |
| tests/integration/qris-returns.test.js | QRIS stock reservation > simulate-pay mengonsumsi reservasi tanpa memotong stok dua kali dan idempoten | PASS | 0.63s |
| tests/integration/qris-returns.test.js | QRIS stock reservation > expiry melepas reservasi, mengembalikan stok, dan menolak webhook PAID terlambat | PASS | 0.65s |
| tests/integration/qris-returns.test.js | QRIS stock reservation > dua generate QRIS bersamaan tidak dapat menjual stok yang sama | PASS | 1.22s |
| tests/integration/qris-returns.test.js | Return and refund ledger > retur sebagian mencatat refund proporsional, mengembalikan stok, dan mencegah over-return | PASS | 0.04s |
| tests/integration/qris-returns.test.js | Return and refund ledger > retur tanpa restock tetap mengurangi sisa kuantitas yang dapat diretur | PASS | 0.02s |
| tests/integration/qris-returns.test.js | Return and refund ledger > otorisasi manajer wajib ada dan PIN salah ditolak | PASS | 0.02s |
| tests/integration/rbac-outlets.test.js | POST /api/auth/login - session payload > mengembalikan permissions, outlets, dan active_outlet_id | PASS | 0.01s |
| tests/integration/rbac-outlets.test.js | POST /api/auth/login - session payload > menolak login untuk username yang tidak terdaftar | PASS | 0.01s |
| tests/integration/rbac-outlets.test.js | GET /api/outlets > owner melihat seluruh outlet dan boleh mengelola | PASS | 0.00s |
| tests/integration/rbac-outlets.test.js | GET /api/outlets > manager dapat melihat tetapi tidak boleh mengelola | PASS | 0.00s |
| tests/integration/rbac-outlets.test.js | GET /api/outlets > kasir ditolak karena tidak memiliki outlets.view | PASS | 0.00s |
| tests/integration/rbac-outlets.test.js | POST/PUT/DELETE /api/outlets > owner dapat membuat outlet baru dengan kode unik | PASS | 0.02s |
| tests/integration/rbac-outlets.test.js | POST/PUT/DELETE /api/outlets > menolak kode outlet duplikat | PASS | 0.00s |
| tests/integration/rbac-outlets.test.js | POST/PUT/DELETE /api/outlets > manager tidak dapat membuat outlet | PASS | 0.00s |
| tests/integration/rbac-outlets.test.js | POST/PUT/DELETE /api/outlets > menolak menonaktifkan outlet aktif terakhir | PASS | 0.00s |
| tests/integration/rbac-outlets.test.js | POST/PUT/DELETE /api/outlets > menghapus outlet kosong berhasil, tetapi outlet terpakai ditolak | PASS | 0.01s |
| tests/integration/rbac-outlets.test.js | Outlet scoping > X-Outlet-Id membatasi data produk pada outlet aktif | PASS | 0.01s |
| tests/integration/rbac-outlets.test.js | Outlet scoping > menolak outlet yang tidak diketahui atau tidak diotorisasi | PASS | 0.01s |
| tests/integration/rbac-outlets.test.js | GET/PUT /api/roles > owner melihat matriks izin lengkap | PASS | 0.00s |
| tests/integration/rbac-outlets.test.js | GET/PUT /api/roles > manager dapat melihat daftar peran tanpa matriks | PASS | 0.00s |
| tests/integration/rbac-outlets.test.js | GET/PUT /api/roles > kasir tidak dapat membuka katalog peran | PASS | 0.00s |
| tests/integration/rbac-outlets.test.js | GET/PUT /api/roles > owner dapat mengubah izin dan perubahan tercermin pada sesi | PASS | 0.01s |
| tests/integration/rbac-outlets.test.js | GET/PUT /api/roles > menolak pencabutan izin owner yang dikunci | PASS | 0.00s |
| tests/integration/rbac-outlets.test.js | GET/PUT /api/roles > manager tidak dapat mengubah matriks izin | PASS | 0.00s |
| tests/integration/rbac-outlets.test.js | Staff provisioning /api/users > owner melihat seluruh staf dan boleh mengelola | PASS | 0.01s |
| tests/integration/rbac-outlets.test.js | Staff provisioning /api/users > manager hanya melihat staf pada outlet yang diotorisasi | PASS | 0.00s |
| tests/integration/rbac-outlets.test.js | Staff provisioning /api/users > cashier ditolak karena tidak memiliki users.view | PASS | 0.01s |
| tests/integration/rbac-outlets.test.js | Staff provisioning /api/users > owner membuat akun manager dengan PIN dan outlet | PASS | 0.15s |
| tests/integration/rbac-outlets.test.js | Staff provisioning /api/users > menolak PIN tidak valid dan outlet kosong | PASS | 0.01s |
| tests/integration/rbac-outlets.test.js | Staff provisioning /api/users > menolak username duplikat | PASS | 0.00s |
| tests/integration/rbac-outlets.test.js | Staff provisioning /api/users > manager tidak dapat membuat akun staf | PASS | 0.00s |
| tests/integration/rbac-outlets.test.js | Staff provisioning /api/users > owner dapat mengunci akun dan login berikutnya ditolak | PASS | 0.06s |
| tests/integration/rbac-outlets.test.js | Staff provisioning /api/users > menghapus akun tanpa riwayat, tetapi menolak akun dengan shift | PASS | 0.06s |
| tests/integration/rbac-outlets.test.js | Staff provisioning /api/users > owner tidak dapat menghapus akunnya sendiri | PASS | 0.00s |
| tests/integration/checkout.test.js | POST /api/orders - schema and totals > mengembalikan JSON schema checkout yang konsisten dan rincian struk | PASS | 0.01s |
| tests/integration/checkout.test.js | POST /api/orders - schema and totals > menolak total pembayaran yang tidak sama dengan tagihan tanpa membuat order | PASS | 0.01s |
| tests/integration/checkout.test.js | POST /api/orders - schema and totals > menolak item dengan kuantitas desimal sebelum menyentuh database | PASS | 0.01s |
| tests/integration/checkout.test.js | POST /api/orders - schema and totals > menolak idempotency key dengan format tidak valid | PASS | 0.00s |
| tests/integration/checkout.test.js | POST /api/orders - idempotency > replay idempotency key mengembalikan order yang sama dan stok hanya berkurang sekali | PASS | 0.01s |
| tests/integration/checkout.test.js | POST /api/orders - idempotency > dua request bersamaan dengan key yang sama tetap menghasilkan satu order | PASS | 0.02s |
| tests/integration/checkout.test.js | POST /api/orders - concurrency > hanya satu checkout yang berhasil saat stok tinggal satu | PASS | 0.01s |
| tests/integration/checkout.test.js | POST /api/orders - transaction rollback > kegagalan di tengah transaksi membatalkan order, item, stok, dan mutasi | PASS | 0.02s |
| tests/integration/checkout.test.js | Authentication > menolak checkout tanpa token dengan 401 | PASS | 0.01s |
| tests/integration/checkout.test.js | Authentication > menolak token dengan signature salah dengan 403 | PASS | 0.01s |
| tests/unit/rbac-session.test.js | Session state (JWT) > membuat token 24 jam dengan klaim peran dan outlet | PASS | 0.00s |
| tests/unit/rbac-session.test.js | Session state (JWT) > menerima token valid dan mengisi req.user | PASS | 0.00s |
| tests/unit/rbac-session.test.js | Session state (JWT) > menolak request tanpa token dengan 401 | PASS | 0.00s |
| tests/unit/rbac-session.test.js | Session state (JWT) > menolak token kedaluwarsa dengan 403 | PASS | 0.00s |
| tests/unit/rbac-session.test.js | Session state (JWT) > menolak token dengan signature yang salah | PASS | 0.00s |
| tests/unit/rbac-session.test.js | Role-based access control > kasir tidak boleh melakukan aksi manajer | PASS | 0.00s |
| tests/unit/rbac-session.test.js | Role-based access control > manajer boleh void, retur, dan laporan tetapi tidak mengubah pengaturan | PASS | 0.00s |
| tests/unit/rbac-session.test.js | Role-based access control > owner memiliki seluruh izin | PASS | 0.00s |
| tests/unit/rbac-session.test.js | Role-based access control > memvalidasi nama peran dan hierarki peran | PASS | 0.00s |
| tests/unit/rbac-session.test.js | Role-based access control > requireRole menolak kasir dan mengizinkan manajer | PASS | 0.00s |
| tests/unit/rbac-session.test.js | Role-based access control > requirePermission dan requireMinimumRole menolak tanpa sesi | PASS | 0.00s |
| tests/unit/rbac-session.test.js | Manager PIN authorization > mengizinkan PIN manajer yang benar dan mereset percobaan gagal | PASS | 0.00s |
| tests/unit/rbac-session.test.js | Manager PIN authorization > menolak PIN salah dan menaikkan failed attempts | PASS | 0.00s |
| tests/unit/rbac-session.test.js | Manager PIN authorization > menolak PIN ketika semua manajer terkunci | PASS | 0.00s |
| tests/unit/rbac-session.test.js | Manager PIN authorization > menolak request tanpa PIN dengan 403 | PASS | 0.00s |
| tests/unit/inventory.test.js | Inventory tracking > mengurangi stok secara atomik dan mencatat mutasi | PASS | 0.01s |
| tests/unit/inventory.test.js | Inventory tracking > mencegah stok minus saat stok tidak mencukupi | PASS | 0.00s |
| tests/unit/inventory.test.js | Inventory tracking > menolak jumlah stok desimal dan nol tanpa mengubah data | PASS | 0.00s |
| tests/unit/inventory.test.js | Inventory tracking > menolak produk yang tidak aktif atau tidak ditemukan | PASS | 0.00s |
| tests/unit/inventory.test.js | Inventory tracking > hanya satu pengurangan yang berhasil saat dua permintaan bersamaan | PASS | 0.00s |
| tests/unit/inventory.test.js | Inventory tracking > mengembalikan stok saat retur/void dan mencatat mutasi | PASS | 0.00s |
| tests/unit/inventory.test.js | Inventory tracking > menolak pengembalian stok untuk produk yang tidak ada | PASS | 0.00s |
| tests/unit/cart.test.js | Cart calculations > menghitung subtotal dari beberapa item | PASS | 0.00s |
| tests/unit/cart.test.js | Cart calculations > menghitung diskon nominal dan PPN 11% | PASS | 0.00s |
| tests/unit/cart.test.js | Cart calculations > menghitung diskon persen dan membulatkan ke rupiah terdekat | PASS | 0.00s |
| tests/unit/cart.test.js | Cart calculations > membatasi diskon nominal agar tidak melebihi subtotal | PASS | 0.00s |
| tests/unit/cart.test.js | Cart calculations > membulatkan PPN half-up pada nilai ,5 | PASS | 0.00s |
| tests/unit/cart.test.js | Cart calculations > menggabungkan baris produk duplikat dan memeriksa stok agregat | PASS | 0.00s |
| tests/unit/cart.test.js | Cart calculations > mendukung payload diskon persen lama yang hanya mengirim discount_amount | PASS | 0.00s |
| tests/unit/cart.test.js | Cart calculations > menangani nominal besar tanpa kehilangan presisi integer | PASS | 0.00s |
| tests/unit/cart.test.js | Cart calculations > menolak jumlah nol | PASS | 0.00s |
| tests/unit/cart.test.js | Cart calculations > menolak jumlah negatif | PASS | 0.00s |
| tests/unit/cart.test.js | Cart calculations > menolak jumlah desimal | PASS | 0.00s |
| tests/unit/cart.test.js | Cart calculations > menolak harga negatif | PASS | 0.00s |
| tests/unit/cart.test.js | Cart calculations > menolak diskon persen di atas 100% | PASS | 0.00s |
| tests/unit/cart.test.js | Cart calculations > menolak tipe diskon yang tidak dikenal | PASS | 0.00s |
| tests/unit/cart.test.js | Cart calculations > menolak keranjang kosong | PASS | 0.00s |
| tests/unit/cart.test.js | Payment validation > mengisi pembayaran tunai penuh secara otomatis | PASS | 0.00s |
| tests/unit/cart.test.js | Payment validation > menghitung kembalian tunai dari tender | PASS | 0.00s |
| tests/unit/cart.test.js | Payment validation > menolak uang tunai yang kurang dari nominal pembayaran | PASS | 0.00s |
| tests/unit/cart.test.js | Payment validation > memvalidasi split payment dua metode dengan total tepat | PASS | 0.00s |
| tests/unit/cart.test.js | Payment validation > menolak split payment dengan satu metode saja | PASS | 0.00s |
| tests/unit/cart.test.js | Payment validation > menolak total pembayaran yang tidak sama dengan tagihan | PASS | 0.00s |
| tests/unit/cart.test.js | Payment validation > menolak metode pembayaran yang tidak konsisten | PASS | 0.00s |
| tests/unit/cart.test.js | Payment validation > menolak nominal pembayaran desimal | PASS | 0.00s |
| tests/unit/cart.test.js | Payment validation > menolak metode pembayaran yang tidak dikenal | PASS | 0.00s |
