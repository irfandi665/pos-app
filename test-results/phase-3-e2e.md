# Automated Test Report — Phase 3 E2E

- **Status:** PASSED
- **Generated:** 2026-11-12T08:49:48.456Z
- **Duration:** 4.68s
- **Base URL:** http://127.0.0.1:3100
- **Browser:** Chromium (Playwright)

## Summary

| Metric | Value |
|---|---:|
| Total tests | 5 |
| Passed | 5 |
| Failed | 0 |
| Skipped | 0 |

## Test Cases

| Suite | Test | Status | Duration |
|---|---|---|---:|
| Offline checkout | menyimpan transaksi tunai saat offline lalu sinkron otomatis | PASSED | 0.90s |
| POS checkout | login, tambah item, diskon, pembayaran tunai, dan struk | PASSED | 0.90s |
| POS checkout | menolak pembayaran tunai kurang dan split yang tidak sesuai total | PASSED | 0.88s |
| Session lifecycle | sesi valid tetap aktif setelah halaman dimuat ulang | PASSED | 0.54s |
| Session lifecycle | token kedaluwarsa menghapus sesi dan kembali ke halaman login | PASSED | 0.49s |

## How to Reproduce

```bash
npm run test:e2e
```

The suite starts a disposable seeded SQLite database on port 3100 and
uses the production client build. HTML artifacts are written to
`test-results/playwright-report/`.
