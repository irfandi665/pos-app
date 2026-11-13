'use strict';

const {
  CartValidationError,
  calculateCart,
  validatePayments
} = require('../../server/services/cart');

function item(overrides = {}) {
  return {
    product_id: 1,
    name: 'Kopi Arabika',
    sku: 'KOPI-001',
    unit_price: 10000,
    cost_price: 6000,
    quantity: 1,
    stock: 100,
    ...overrides
  };
}

function getError(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected function to throw');
}

describe('Cart calculations', () => {
  test('menghitung subtotal dari beberapa item', () => {
    const result = calculateCart([
      item({ product_id: 1, unit_price: 10000, quantity: 2 }),
      item({ product_id: 2, name: 'Teh', unit_price: 2500, quantity: 1 })
    ]);

    expect(result.subtotal).toBe(22500);
    expect(result.discount_amount).toBe(0);
    expect(result.tax_amount).toBe(0);
    expect(result.total_amount).toBe(22500);
    expect(result.items).toHaveLength(2);
  });

  test('menghitung diskon nominal dan PPN 11%', () => {
    const result = calculateCart([item({ unit_price: 100000, quantity: 1 })], {
      discount_type: 'nominal',
      discount_value: 10000,
      tax_rate: 11
    });

    expect(result.subtotal).toBe(100000);
    expect(result.discount_amount).toBe(10000);
    expect(result.tax_amount).toBe(9900);
    expect(result.total_amount).toBe(99900);
  });

  test('menghitung diskon persen dan membulatkan ke rupiah terdekat', () => {
    const result = calculateCart([item({ unit_price: 33333, quantity: 1 })], {
      discount_type: 'percent',
      discount_value: 10,
      tax_rate: 11
    });

    expect(result.discount_amount).toBe(3333);
    expect(result.tax_amount).toBe(3300);
    expect(result.total_amount).toBe(33300);
  });

  test('membatasi diskon nominal agar tidak melebihi subtotal', () => {
    const result = calculateCart([item({ unit_price: 5000, quantity: 1 })], {
      discount_type: 'nominal',
      discount_value: 10000,
      tax_rate: 11
    });

    expect(result.discount_amount).toBe(5000);
    expect(result.tax_amount).toBe(0);
    expect(result.total_amount).toBe(0);
  });

  test('membulatkan PPN half-up pada nilai ,5', () => {
    const result = calculateCart([item({ unit_price: 10050, quantity: 1 })], {
      tax_rate: 11
    });

    expect(result.tax_amount).toBe(1106);
    expect(result.total_amount).toBe(11156);
  });

  test('menggabungkan baris produk duplikat dan memeriksa stok agregat', () => {
    const aggregated = calculateCart([
      item({ product_id: 7, unit_price: 5000, quantity: 4, stock: 10 }),
      item({ product_id: 7, unit_price: 5000, quantity: 4, stock: 10 })
    ]);

    expect(aggregated.items).toHaveLength(1);
    expect(aggregated.items[0].quantity).toBe(8);
    expect(aggregated.subtotal).toBe(40000);

    const error = getError(() => calculateCart([
      item({ product_id: 7, unit_price: 5000, quantity: 4, stock: 5 }),
      item({ product_id: 7, unit_price: 5000, quantity: 4, stock: 5 })
    ]));

    expect(error).toBeInstanceOf(CartValidationError);
    expect(error.code).toBe('INSUFFICIENT_STOCK');
  });

  test('mendukung payload diskon persen lama yang hanya mengirim discount_amount', () => {
    const result = calculateCart([item({ unit_price: 50000, quantity: 1 })], {
      discount_type: 'percent',
      discount_amount: 5000
    });

    expect(result.discount_amount).toBe(5000);
    expect(result.total_amount).toBe(45000);
  });

  test('menangani nominal besar tanpa kehilangan presisi integer', () => {
    const result = calculateCart([item({ unit_price: 999999, quantity: 3 })], {
      tax_rate: 11
    });

    expect(result.subtotal).toBe(2999997);
    expect(result.tax_amount).toBe(330000);
    expect(result.total_amount).toBe(3329997);
    expect(Number.isSafeInteger(result.total_amount)).toBe(true);
  });

  test.each([
    ['jumlah nol', { quantity: 0 }, 'INVALID_ZERO'],
    ['jumlah negatif', { quantity: -2 }, 'INVALID_RANGE'],
    ['jumlah desimal', { quantity: 1.5 }, 'INVALID_INTEGER'],
    ['harga negatif', { unit_price: -1000 }, 'INVALID_RANGE']
  ])('menolak %s', (_label, overrides, expectedCode) => {
    const error = getError(() => calculateCart([item(overrides)]));
    expect(error).toBeInstanceOf(CartValidationError);
    expect(error.code).toBe(expectedCode);
  });

  test('menolak diskon persen di atas 100%', () => {
    const error = getError(() => calculateCart([item()], {
      discount_type: 'percent',
      discount_value: 101
    }));

    expect(error.code).toBe('INVALID_PERCENTAGE');
  });

  test('menolak tipe diskon yang tidak dikenal', () => {
    const error = getError(() => calculateCart([item()], {
      discount_type: 'bogus',
      discount_value: 1000
    }));

    expect(error.code).toBe('INVALID_DISCOUNT_TYPE');
  });

  test('menolak keranjang kosong', () => {
    const error = getError(() => calculateCart([]));
    expect(error.code).toBe('EMPTY_CART');
  });
});

describe('Payment validation', () => {
  test('mengisi pembayaran tunai penuh secara otomatis', () => {
    const result = validatePayments(11100, undefined, 'cash');

    expect(result.total_paid).toBe(11100);
    expect(result.payments).toEqual([
      expect.objectContaining({
        method: 'cash',
        amount: 11100,
        tender_amount: 11100,
        change_amount: 0
      })
    ]);
  });

  test('menghitung kembalian tunai dari tender', () => {
    const result = validatePayments(11100, [
      { method: 'cash', amount: 11100, tender: 20000 }
    ], 'cash');

    expect(result.payments[0].change_amount).toBe(8900);
  });

  test('menolak uang tunai yang kurang dari nominal pembayaran', () => {
    const error = getError(() => validatePayments(11100, [
      { method: 'cash', amount: 11100, tender: 10000 }
    ], 'cash'));

    expect(error.code).toBe('INSUFFICIENT_TENDER');
  });

  test('memvalidasi split payment dua metode dengan total tepat', () => {
    const result = validatePayments(100000, [
      { method: 'cash', amount: 40000, tender: 50000 },
      { method: 'qris', amount: 60000 }
    ], 'split');

    expect(result.total_paid).toBe(100000);
    expect(result.payments).toHaveLength(2);
    expect(result.payments[0].change_amount).toBe(10000);
  });

  test('menolak split payment dengan satu metode saja', () => {
    const error = getError(() => validatePayments(100000, [
      { method: 'cash', amount: 100000, tender: 100000 }
    ], 'split'));

    expect(error.code).toBe('INVALID_SPLIT_PAYMENT');
  });

  test('menolak total pembayaran yang tidak sama dengan tagihan', () => {
    const error = getError(() => validatePayments(100000, [
      { method: 'cash', amount: 90000, tender: 90000 }
    ], 'cash'));

    expect(error.code).toBe('PAYMENT_TOTAL_MISMATCH');
  });

  test('menolak metode pembayaran yang tidak konsisten', () => {
    const error = getError(() => validatePayments(100000, [
      { method: 'qris', amount: 100000 }
    ], 'card'));

    expect(error.code).toBe('PAYMENT_METHOD_MISMATCH');
  });

  test('menolak nominal pembayaran desimal', () => {
    const error = getError(() => validatePayments(100000, [
      { method: 'cash', amount: 100000.5, tender: 100000.5 }
    ], 'cash'));

    expect(error.code).toBe('INVALID_INTEGER');
  });

  test('menolak metode pembayaran yang tidak dikenal', () => {
    const error = getError(() => validatePayments(100000, [
      { method: 'bitcoin', amount: 100000 }
    ], 'cash'));

    expect(error.code).toBe('INVALID_PAYMENT_METHOD');
  });
});
