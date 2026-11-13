'use strict';

const { test, expect } = require('@playwright/test');
const {
  login,
  addProduct,
  openPaymentModal,
  paymentModal,
  authHeaders
} = require('./helpers');

test.describe('Offline checkout', () => {
  test('menyimpan transaksi tunai saat offline lalu sinkron otomatis', async ({ page, request }) => {
    await login(page);

    const token = await page.evaluate(() => localStorage.getItem('pos_token'));
    const listOrders = async () => {
      const response = await request.get('/api/orders?limit=100', {
        headers: authHeaders(token)
      });
      expect(response.ok()).toBeTruthy();
      return (await response.json()).orders;
    };

    const ordersBefore = await listOrders();

    await page.context().setOffline(true);
    await expect(page.getByText(/Mode offline aktif/)).toBeVisible();

    await addProduct(page, 'Teh Tarik Dingin Cup');
    await openPaymentModal(page);

    const modal = paymentModal(page);
    await modal.getByRole('button', { name: /Selesaikan Pembayaran Tunai/ }).click();

    await expect(page.getByText(/Transaksi disimpan aman di perangkat ini/)).toBeVisible();
    await expect(page.getByText('1 antrean', { exact: true })).toBeVisible();
    await expect(page.getByText('Keranjang masih kosong.')).toBeVisible();

    await page.context().setOffline(false);
    await expect(page.getByText(/Mode offline aktif/)).toHaveCount(0);
    await expect(page.getByText('1 antrean', { exact: true })).toHaveCount(0);

    await expect.poll(async () => {
      const orders = await listOrders();
      return orders.length - ordersBefore.length;
    }, {
      timeout: 15_000,
      message: 'Transaksi offline harus tersinkron ke server tepat satu kali'
    }).toBe(1);

    const orders = await listOrders();
    const syncedOrder = orders.find(
      (order) => order.total_amount === 11100 && order.payment_method === 'cash'
    );
    expect(syncedOrder).toBeTruthy();
  });
});
