'use strict';

const { expect } = require('@playwright/test');

const CASHIER = { username: 'kasir', password: 'kasir123' };

async function login(page, credentials = CASHIER) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Masuk ke Sistem' })).toBeVisible();
  await page.getByPlaceholder('Masukkan username').fill(credentials.username);
  await page.getByPlaceholder('Masukkan password').fill(credentials.password);
  await page.getByRole('button', { name: /Masuk ke POS/ }).click();
  await expect(page.getByRole('heading', { name: 'Keranjang Kasir' })).toBeVisible();
  await expect(page.getByText('Kopi Susu Gula Aren 250ml', { exact: true })).toBeVisible();
}

async function addProduct(page, productName) {
  await page.getByText(productName, { exact: true }).first().click();
}

async function openPaymentModal(page) {
  await page.getByRole('button', { name: /Bayar Sekarang/ }).click();
  await expect(page.getByRole('heading', { name: 'Pilih Pembayaran' })).toBeVisible();
}

function paymentModal(page) {
  return page.locator('.fixed.inset-0').filter({ hasText: 'Pilih Pembayaran' });
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

module.exports = {
  CASHIER,
  login,
  addProduct,
  openPaymentModal,
  paymentModal,
  authHeaders
};
