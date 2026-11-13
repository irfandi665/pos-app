# Test Results

Folder ini berisi laporan otomatis dari test suite POS QRIS.

## Daftar Laporan

| File | Isi |
|---|---|
| `phase-1-unit.md` | Hasil unit test Phase 1 (cart, inventory, RBAC/session) |
| `phase-2-integration.md` | Hasil integration test Phase 2 (checkout, idempotency, rollback, QRIS, retur/refund) |
| `phase-3-e2e.md` | Hasil E2E Playwright Phase 3 |
| `latest.md` | Salinan laporan run terakhir |
| `playwright-report/` | HTML report E2E Playwright (Phase 3) |
| `coverage/` | Laporan coverage Jest (dibuat oleh `npm run test:coverage`) |

## Cara Menjalankan

```bash
npm run test:unit          # Phase 1
npm run test:integration   # Phase 2
npm run test:e2e           # Phase 3 (Playwright, build client otomatis)
npm run test:coverage      # Unit + integration + coverage
```

Pada mesin baru, unduh browser Playwright sekali sebelum menjalankan E2E:

```bash
npx playwright install chromium
```

E2E memakai database SQLite sementara di `tests/e2e/.tmp/` dan berjalan pada
port `3100`, sehingga tidak mengganggu database atau server pengembangan.

Laporan Markdown Jest dibuat otomatis oleh `tests/reporters/markdown-reporter.js`
setiap kali Jest selesai berjalan. Laporan E2E dibuat otomatis oleh
`tests/reporters/playwright-markdown-reporter.js`.

## Status Terakhir

- **Phase 1:** PASSED — 46 test
- **Phase 2:** PASSED — 17 test integration
- **Phase 3:** PASSED — 5 test E2E (checkout, pembayaran tidak valid, offline sync, sesi)
