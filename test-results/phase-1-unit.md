# Automated Test Report

- **Status:** PASSED
- **Generated:** 2026-11-12T08:40:51.855Z
- **Duration:** 0.45s
- **Suites:** 3
- **Node:** v22.23.3
- **Platform:** win32/x64

## Summary

| Metric | Value |
|---|---:|
| Total tests | 46 |
| Passed | 46 |
| Failed | 0 |
| Skipped | 0 |

## Test Cases

| Suite | Test | Status | Duration |
|---|---|---|---:|
| tests/unit/rbac-session.test.js | Session state (JWT) > membuat token 24 jam dengan klaim peran dan outlet | PASS | 0.01s |
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
| tests/unit/cart.test.js | Payment validation > menolak total pembayaran yang tidak sama dengan tagihan | PASS | 0.01s |
| tests/unit/cart.test.js | Payment validation > menolak metode pembayaran yang tidak konsisten | PASS | 0.00s |
| tests/unit/cart.test.js | Payment validation > menolak nominal pembayaran desimal | PASS | 0.00s |
| tests/unit/cart.test.js | Payment validation > menolak metode pembayaran yang tidak dikenal | PASS | 0.00s |
| tests/unit/inventory.test.js | Inventory tracking > mengurangi stok secara atomik dan mencatat mutasi | PASS | 0.01s |
| tests/unit/inventory.test.js | Inventory tracking > mencegah stok minus saat stok tidak mencukupi | PASS | 0.00s |
| tests/unit/inventory.test.js | Inventory tracking > menolak jumlah stok desimal dan nol tanpa mengubah data | PASS | 0.00s |
| tests/unit/inventory.test.js | Inventory tracking > menolak produk yang tidak aktif atau tidak ditemukan | PASS | 0.00s |
| tests/unit/inventory.test.js | Inventory tracking > hanya satu pengurangan yang berhasil saat dua permintaan bersamaan | PASS | 0.00s |
| tests/unit/inventory.test.js | Inventory tracking > mengembalikan stok saat retur/void dan mencatat mutasi | PASS | 0.00s |
| tests/unit/inventory.test.js | Inventory tracking > menolak pengembalian stok untuk produk yang tidak ada | PASS | 0.00s |
