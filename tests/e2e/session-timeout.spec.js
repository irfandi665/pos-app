'use strict';

const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

test.describe('Session lifecycle', () => {
  test('sesi valid tetap aktif setelah halaman dimuat ulang', async ({ page }) => {
    await login(page);

    await page.reload();

    await expect(page.getByRole('heading', { name: 'Keranjang Kasir' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Masuk ke Sistem' })).toHaveCount(0);
  });

  test('token kedaluwarsa menghapus sesi dan kembali ke halaman login', async ({ page }) => {
    await login(page);

    const sessionBefore = await page.evaluate(() => ({
      token: localStorage.getItem('pos_token'),
      user: localStorage.getItem('pos_user')
    }));
    expect(sessionBefore.token).toBeTruthy();
    expect(sessionBefore.user).toBeTruthy();

    await page.evaluate(() => {
      localStorage.setItem('pos_token', 'expired.invalid.token');
    });

    await page.reload();

    await expect(page.getByRole('heading', { name: 'Masuk ke Sistem' })).toBeVisible();

    const sessionAfter = await page.evaluate(() => ({
      token: localStorage.getItem('pos_token'),
      user: localStorage.getItem('pos_user')
    }));
    expect(sessionAfter.token).toBeNull();
    expect(sessionAfter.user).toBeNull();
  });
});
