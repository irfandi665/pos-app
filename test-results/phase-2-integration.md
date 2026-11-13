# Automated Test Report

- **Status:** FAILED
- **Generated:** 2026-11-13T02:23:54.105Z
- **Duration:** 1.13s
- **Suites:** 1
- **Node:** v22.23.3
- **Platform:** win32/x64

## Summary

| Metric | Value |
|---|---:|
| Total tests | 28 |
| Passed | 27 |
| Failed | 1 |
| Skipped | 0 |

## Test Cases

| Suite | Test | Status | Duration |
|---|---|---|---:|
| tests/integration/rbac-outlets.test.js | POST /api/auth/login - session payload > mengembalikan permissions, outlets, dan active_outlet_id | PASS | 0.01s |
| tests/integration/rbac-outlets.test.js | POST /api/auth/login - session payload > menolak login untuk username yang tidak terdaftar | PASS | 0.01s |
| tests/integration/rbac-outlets.test.js | GET /api/outlets > owner melihat seluruh outlet dan boleh mengelola | PASS | 0.01s |
| tests/integration/rbac-outlets.test.js | GET /api/outlets > manager dapat melihat tetapi tidak boleh mengelola | PASS | 0.00s |
| tests/integration/rbac-outlets.test.js | GET /api/outlets > kasir ditolak karena tidak memiliki outlets.view | PASS | 0.00s |
| tests/integration/rbac-outlets.test.js | POST/PUT/DELETE /api/outlets > owner dapat membuat outlet baru dengan kode unik | PASS | 0.02s |
| tests/integration/rbac-outlets.test.js | POST/PUT/DELETE /api/outlets > menolak kode outlet duplikat | PASS | 0.01s |
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
| tests/integration/rbac-outlets.test.js | Staff provisioning /api/users > owner melihat seluruh staf dan boleh mengelola | PASS | 0.00s |
| tests/integration/rbac-outlets.test.js | Staff provisioning /api/users > manager hanya melihat staf pada outlet yang diotorisasi | FAIL | 0.02s |
| tests/integration/rbac-outlets.test.js | Staff provisioning /api/users > cashier ditolak karena tidak memiliki users.view | PASS | 0.00s |
| tests/integration/rbac-outlets.test.js | Staff provisioning /api/users > owner membuat akun manager dengan PIN dan outlet | PASS | 0.16s |
| tests/integration/rbac-outlets.test.js | Staff provisioning /api/users > menolak PIN tidak valid dan outlet kosong | PASS | 0.01s |
| tests/integration/rbac-outlets.test.js | Staff provisioning /api/users > menolak username duplikat | PASS | 0.00s |
| tests/integration/rbac-outlets.test.js | Staff provisioning /api/users > manager tidak dapat membuat akun staf | PASS | 0.00s |
| tests/integration/rbac-outlets.test.js | Staff provisioning /api/users > owner dapat mengunci akun dan login berikutnya ditolak | PASS | 0.06s |
| tests/integration/rbac-outlets.test.js | Staff provisioning /api/users > menghapus akun tanpa riwayat, tetapi menolak akun dengan shift | PASS | 0.07s |
| tests/integration/rbac-outlets.test.js | Staff provisioning /api/users > owner tidak dapat menghapus akunnya sendiri | PASS | 0.00s |

## Failures

### tests/integration/rbac-outlets.test.js :: Staff provisioning /api/users > manager hanya melihat staf pada outlet yang diotorisasi

```text
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 500
    at Object.toBe (D:\Project\web\pos-qris\pos-app\tests\integration\rbac-outlets.test.js:366:29)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
```
