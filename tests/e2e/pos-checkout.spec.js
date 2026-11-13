'use strict';

const { test, expect } = require('@playwright/test');
const {
  login,
  addProduct,
  openPaymentModal,
  paymentModal
} = require('./helpers');

test.describe('POS checkout', () => {
  test('login, tambah item, diskon, pembayaran tunai, dan struk', async ({ page }) => {
    await login(page);

    await addProduct(page, 'Kopi Susu Gula Aren 250ml');
    await expect(page.getByText('Rp 18.000', { exact: true }).first()).toBeVisible();

    await page.locator('input[placeholder="0"][type="number"]').fill('2000');
    await expect(page.getByText('Rp 17.760', { exact: true })).toBeVisible();

    await openPaymentModal(page);
    const modal = paymentModal(page);
    await expect(modal).toContainText('Total Tagihan');
    await expect(modal.getByRole('button', { name: /Selesaikan Pembayaran Tunai/ })).toBeEnabled();

    await modal.getByRole('button', { name: /Selesaikan Pembayaran Tunai/ }).click();

    await expect(page.getByRole('heading', { name: /Bukti Pembayaran/ })).toBeVisible();
    const receipt = page.locator('#thermal-receipt-area');
    await expect(receipt).toContainText('Kopi Susu Gula Aren 250ml');
    await expect(receipt).toContainText('Diskon');
    await expect(receipt).toContainText('-Rp 2.000');
    await expect(receipt).toContainText('TOTAL AKHIR');
    await expect(receipt).toContainText('Rp 17.760');
    await expect(receipt).toContainText('Metode:');
    await expect(receipt).toContainText(/cash/i);

    await page.getByRole('button', { name: 'Tutup', exact: true }).click();
    await expect(page.getByText('Keranjang masih kosong.')).toBeVisible();
  });

  test('menolak pembayaran tunai kurang dan split yang tidak sesuai total', async ({ page }) => {
    await login(page);
    await addProduct(page, 'Air Mineral 600ml');
    await openPaymentModal(page);

    const modal = paymentModal(page);
    const tenderInput = modal.locator('input[type="number"]').first();
    await tenderInput.fill('1000');

    await expect(modal.getByRole('button', { name: /Selesaikan Pembayaran Tunai/ })).toBeDisabled();
    await expect(modal.getByText('Kembalian:', { exact: true })).toBeVisible();
    await expect(modal.getByText('Rp 0', { exact: true })).toBeVisible();

    await modal.getByRole('button', { name: /Split Pay/ }).click();
    const splitInputs = modal.locator('input[type="number"]');
    await splitInputs.nth(0).fill('1000');
    await splitInputs.nth(1).fill('0');
    await splitInputs.nth(2).fill('0');
    await modal.getByRole('button', { name: /Selesaikan Split Payment/ }).click();

    await expect(modal.getByText(/harus sama persis dengan total tagihan/)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Bukti Pembayaran/ })).toHaveCount(0);
  });
});
