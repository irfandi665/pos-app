# Automated Test Report

- **Status:** PASSED
- **Generated:** 2026-11-12T08:42:34.252Z
- **Duration:** 5.79s
- **Suites:** 2
- **Node:** v22.23.3
- **Platform:** win32/x64

## Summary

| Metric | Value |
|---|---:|
| Total tests | 17 |
| Passed | 17 |
| Failed | 0 |
| Skipped | 0 |

## Test Cases

| Suite | Test | Status | Duration |
|---|---|---|---:|
| tests/integration/qris-returns.test.js | QRIS stock reservation > generate QRIS memotong stok sebagai reservasi dan menyimpan ledger PENDING | PASS | 0.78s |
| tests/integration/qris-returns.test.js | QRIS stock reservation > simulate-pay mengonsumsi reservasi tanpa memotong stok dua kali dan idempoten | PASS | 0.82s |
| tests/integration/qris-returns.test.js | QRIS stock reservation > expiry melepas reservasi, mengembalikan stok, dan menolak webhook PAID terlambat | PASS | 0.81s |
| tests/integration/qris-returns.test.js | QRIS stock reservation > dua generate QRIS bersamaan tidak dapat menjual stok yang sama | PASS | 1.53s |
| tests/integration/qris-returns.test.js | Return and refund ledger > retur sebagian mencatat refund proporsional, mengembalikan stok, dan mencegah over-return | PASS | 0.06s |
| tests/integration/qris-returns.test.js | Return and refund ledger > retur tanpa restock tetap mengurangi sisa kuantitas yang dapat diretur | PASS | 0.04s |
| tests/integration/qris-returns.test.js | Return and refund ledger > otorisasi manajer wajib ada dan PIN salah ditolak | PASS | 0.04s |
| tests/integration/checkout.test.js | POST /api/orders - schema and totals > mengembalikan JSON schema checkout yang konsisten dan rincian struk | PASS | 0.02s |
| tests/integration/checkout.test.js | POST /api/orders - schema and totals > menolak total pembayaran yang tidak sama dengan tagihan tanpa membuat order | PASS | 0.03s |
| tests/integration/checkout.test.js | POST /api/orders - schema and totals > menolak item dengan kuantitas desimal sebelum menyentuh database | PASS | 0.01s |
| tests/integration/checkout.test.js | POST /api/orders - schema and totals > menolak idempotency key dengan format tidak valid | PASS | 0.01s |
| tests/integration/checkout.test.js | POST /api/orders - idempotency > replay idempotency key mengembalikan order yang sama dan stok hanya berkurang sekali | PASS | 0.01s |
| tests/integration/checkout.test.js | POST /api/orders - idempotency > dua request bersamaan dengan key yang sama tetap menghasilkan satu order | PASS | 0.03s |
| tests/integration/checkout.test.js | POST /api/orders - concurrency > hanya satu checkout yang berhasil saat stok tinggal satu | PASS | 0.03s |
| tests/integration/checkout.test.js | POST /api/orders - transaction rollback > kegagalan di tengah transaksi membatalkan order, item, stok, dan mutasi | PASS | 0.03s |
| tests/integration/checkout.test.js | Authentication > menolak checkout tanpa token dengan 401 | PASS | 0.01s |
| tests/integration/checkout.test.js | Authentication > menolak token dengan signature salah dengan 403 | PASS | 0.01s |
