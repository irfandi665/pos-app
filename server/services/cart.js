'use strict';

const DISCOUNT_TYPES = new Set(['nominal', 'percent']);
const PAYMENT_METHODS = new Set(['cash', 'card', 'qris']);
const SPLIT_PAYMENT_METHOD = 'split';

class CartValidationError extends Error {
  constructor(message, code = 'CART_VALIDATION_ERROR') {
    super(message);
    this.name = 'CartValidationError';
    this.code = code;
    this.statusCode = 400;
  }
}

function parseNumber(value, fieldName) {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
    throw new CartValidationError(`${fieldName} harus berupa angka yang valid`, 'INVALID_NUMBER');
  }
  return parsed;
}

function parseInteger(value, fieldName, { min = 0, allowZero = true } = {}) {
  const parsed = parseNumber(value, fieldName);
  if (!Number.isInteger(parsed)) {
    throw new CartValidationError(`${fieldName} harus berupa bilangan bulat`, 'INVALID_INTEGER');
  }
  if (!Number.isSafeInteger(parsed)) {
    throw new CartValidationError(`${fieldName} melebihi batas angka yang aman`, 'UNSAFE_INTEGER');
  }
  if (!allowZero && parsed === 0) {
    throw new CartValidationError(`${fieldName} harus lebih dari 0`, 'INVALID_ZERO');
  }
  if (parsed < min) {
    throw new CartValidationError(`${fieldName} tidak boleh kurang dari ${min}`, 'INVALID_RANGE');
  }
  return parsed;
}

function parsePercentage(value, fieldName) {
  const parsed = parseNumber(value ?? 0, fieldName);
  if (parsed < 0 || parsed > 100) {
    throw new CartValidationError(`${fieldName} harus berada di antara 0 dan 100`, 'INVALID_PERCENTAGE');
  }
  return parsed;
}

function normalizeItem(rawItem, index) {
  if (!rawItem || typeof rawItem !== 'object') {
    throw new CartValidationError(`Item keranjang ke-${index + 1} tidak valid`, 'INVALID_ITEM');
  }

  const productId = parseInteger(rawItem.product_id, `ID produk item ke-${index + 1}`, {
    min: 1,
    allowZero: false
  });
  const quantity = parseInteger(rawItem.quantity, `Jumlah produk item ke-${index + 1}`, {
    min: 1,
    allowZero: false
  });
  const unitPrice = parseInteger(
    rawItem.unit_price ?? rawItem.selling_price,
    `Harga satuan produk item ke-${index + 1}`,
    { min: 0 }
  );
  const costPrice = parseInteger(rawItem.cost_price ?? 0, `Harga modal produk item ke-${index + 1}`, {
    min: 0
  });

  const rawStock = rawItem.stock ?? rawItem.current_stock;
  const stock = rawStock === undefined || rawStock === null
    ? null
    : parseInteger(rawStock, `Stok produk item ke-${index + 1}`, { min: 0 });

  return {
    product_id: productId,
    name: rawItem.name || rawItem.product_name || `Produk #${productId}`,
    sku: rawItem.sku || null,
    unit_price: unitPrice,
    cost_price: costPrice,
    quantity,
    stock
  };
}

function mergeDuplicateItems(items) {
  const merged = new Map();

  for (const item of items) {
    const key = String(item.product_id);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, { ...item });
      continue;
    }

    if (existing.unit_price !== item.unit_price) {
      throw new CartValidationError(
        `Harga produk "${item.name}" tidak konsisten dalam satu keranjang`,
        'INCONSISTENT_PRICE'
      );
    }

    const combinedQuantity = existing.quantity + item.quantity;
    if (!Number.isSafeInteger(combinedQuantity)) {
      throw new CartValidationError('Total jumlah produk melebihi batas aman', 'UNSAFE_INTEGER');
    }

    existing.quantity = combinedQuantity;
    if (item.stock !== null) {
      existing.stock = existing.stock === null ? item.stock : Math.min(existing.stock, item.stock);
    }
  }

  return Array.from(merged.values());
}

function calculateDiscount(subtotal, discountType, discountValue, discountAmount) {
  let amount;

  if (discountType === 'percent') {
    const hasPercentValue = discountValue !== undefined && discountValue !== null && discountValue !== '';
    if (hasPercentValue) {
      const percent = parsePercentage(discountValue, 'Diskon persen');
      amount = Math.round((subtotal * percent) / 100);
    } else {
      // Backward compatibility: older clients send the already-calculated nominal value.
      amount = parseInteger(discountAmount ?? 0, 'Nominal diskon', { min: 0 });
    }
  } else {
    amount = parseInteger(discountValue ?? discountAmount ?? 0, 'Nominal diskon', { min: 0 });
  }

  return Math.min(subtotal, amount);
}

/**
 * Pure cart calculator. All monetary values are integer Rupiah.
 *
 * @param {Array<object>} rawItems
 * @param {object} options
 * @returns {{items: Array<object>, subtotal: number, discount_amount: number, discount_type: string,
 *   tax_rate: number, tax_amount: number, total_amount: number}}
 */
function calculateCart(rawItems, options = {}) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new CartValidationError('Keranjang belanja tidak boleh kosong', 'EMPTY_CART');
  }

  const discountType = options.discount_type || 'nominal';
  if (!DISCOUNT_TYPES.has(discountType)) {
    throw new CartValidationError(
      `Tipe diskon "${discountType}" tidak dikenal. Gunakan nominal atau percent`,
      'INVALID_DISCOUNT_TYPE'
    );
  }

  const taxRate = parsePercentage(options.tax_rate ?? 0, 'Tarif pajak');
  const enforceStock = options.enforce_stock !== false;
  const normalizedItems = rawItems.map(normalizeItem);
  const mergedItems = mergeDuplicateItems(normalizedItems);

  let subtotal = 0;
  const items = mergedItems.map((item) => {
    if (enforceStock && item.stock !== null && item.quantity > item.stock) {
      throw new CartValidationError(
        `Stok barang "${item.name}" tidak mencukupi (Tersedia: ${item.stock}, Diminta: ${item.quantity})`,
        'INSUFFICIENT_STOCK'
      );
    }

    const lineSubtotal = item.unit_price * item.quantity;
    if (!Number.isSafeInteger(lineSubtotal)) {
      throw new CartValidationError(
        `Total harga produk "${item.name}" melebihi batas angka yang aman`,
        'UNSAFE_INTEGER'
      );
    }

    subtotal += lineSubtotal;
    if (!Number.isSafeInteger(subtotal)) {
      throw new CartValidationError('Subtotal melebihi batas angka yang aman', 'UNSAFE_INTEGER');
    }

    return {
      ...item,
      subtotal: lineSubtotal,
      total: lineSubtotal
    };
  });

  const discountAmount = calculateDiscount(
    subtotal,
    discountType,
    options.discount_value,
    options.discount_amount
  );
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = Math.round((afterDiscount * taxRate) / 100);
  const totalAmount = afterDiscount + taxAmount;

  if (!Number.isSafeInteger(taxAmount) || !Number.isSafeInteger(totalAmount)) {
    throw new CartValidationError('Total tagihan melebihi batas angka yang aman', 'UNSAFE_INTEGER');
  }

  return {
    items,
    subtotal,
    discount_amount: discountAmount,
    discount_type: discountType,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    total_amount: totalAmount
  };
}

/**
 * Normalizes and validates payment allocations against the cart total.
 * `amount` is the allocation toward the bill; `tender_amount` is cash received.
 */
function validatePayments(totalAmount, rawPayments, paymentMethod = 'cash') {
  const method = String(paymentMethod || 'cash').toLowerCase();

  if (method !== SPLIT_PAYMENT_METHOD && !PAYMENT_METHODS.has(method)) {
    throw new CartValidationError(
      `Metode pembayaran "${paymentMethod}" tidak dikenal`,
      'INVALID_PAYMENT_METHOD'
    );
  }

  const total = parseInteger(totalAmount, 'Total tagihan', { min: 0 });

  if (rawPayments === undefined || rawPayments === null || (Array.isArray(rawPayments) && rawPayments.length === 0)) {
    if (method === SPLIT_PAYMENT_METHOD) {
      throw new CartValidationError(
        'Pembayaran split membutuhkan minimal dua alokasi pembayaran',
        'INVALID_SPLIT_PAYMENT'
      );
    }

    return {
      total_paid: total,
      payments: [{
        method,
        amount: total,
        tender_amount: total,
        change_amount: 0,
        card_issuer: null,
        card_ref: null,
        qris_ref: null
      }]
    };
  }

  if (!Array.isArray(rawPayments)) {
    throw new CartValidationError('Daftar pembayaran harus berupa array', 'INVALID_PAYMENTS');
  }

  const normalized = [];
  const usedMethods = new Set();
  let totalPaid = 0;

  rawPayments.forEach((payment, index) => {
    if (!payment || typeof payment !== 'object') {
      throw new CartValidationError(`Pembayaran ke-${index + 1} tidak valid`, 'INVALID_PAYMENT');
    }

    const paymentType = String(payment.method || '').toLowerCase();
    if (!PAYMENT_METHODS.has(paymentType)) {
      throw new CartValidationError(
        `Metode pembayaran ke-${index + 1} tidak dikenal`,
        'INVALID_PAYMENT_METHOD'
      );
    }

    const amount = parseInteger(payment.amount, `Nominal pembayaran ke-${index + 1}`, {
      min: 1,
      allowZero: false
    });

    let tenderAmount = amount;
    let changeAmount = 0;

    if (paymentType === 'cash') {
      tenderAmount = parseInteger(
        payment.tender ?? payment.tender_amount ?? amount,
        `Uang tunai yang diterima pada pembayaran ke-${index + 1}`,
        { min: 1, allowZero: false }
      );
      if (tenderAmount < amount) {
        throw new CartValidationError(
          `Uang tunai yang diterima kurang dari nominal pembayaran ke-${index + 1}`,
          'INSUFFICIENT_TENDER'
        );
      }
      changeAmount = tenderAmount - amount;
    }

    usedMethods.add(paymentType);
    totalPaid += amount;

    if (!Number.isSafeInteger(totalPaid)) {
      throw new CartValidationError('Total pembayaran melebihi batas angka yang aman', 'UNSAFE_INTEGER');
    }

    normalized.push({
      method: paymentType,
      amount,
      tender_amount: tenderAmount,
      change_amount: changeAmount,
      card_issuer: payment.card_issuer || null,
      card_ref: payment.card_ref || null,
      qris_ref: payment.qris_ref || null
    });
  });

  if (method !== SPLIT_PAYMENT_METHOD && normalized.some((payment) => payment.method !== method)) {
    throw new CartValidationError(
      `Metode pembayaran tidak konsisten dengan pilihan "${method}"`,
      'PAYMENT_METHOD_MISMATCH'
    );
  }

  if (method === SPLIT_PAYMENT_METHOD && (normalized.length < 2 || usedMethods.size < 2)) {
    throw new CartValidationError(
      'Pembayaran split membutuhkan minimal dua metode pembayaran berbeda',
      'INVALID_SPLIT_PAYMENT'
    );
  }

  if (totalPaid !== total) {
    throw new CartValidationError(
      `Total pembayaran (Rp ${totalPaid.toLocaleString('id-ID')}) harus sama dengan total tagihan (Rp ${total.toLocaleString('id-ID')})`,
      'PAYMENT_TOTAL_MISMATCH'
    );
  }

  return {
    total_paid: totalPaid,
    payments: normalized
  };
}

module.exports = {
  CartValidationError,
  calculateCart,
  validatePayments,
  calculateDiscount
};
