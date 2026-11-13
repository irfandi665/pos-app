const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken } = require('../auth');
const { requirePermission } = require('../services/rbac');
const { resolveOutletContext } = require('../services/outlets');

function buildDateConditions(period, startDate, endDate) {
  const conditions = [];
  const params = [];

  if (period === 'today') {
    conditions.push("date(o.created_at) = date('now')");
  } else if (period === 'week') {
    conditions.push("date(o.created_at) >= date('now', '-7 days')");
  } else if (period === 'custom' && startDate && endDate) {
    conditions.push('date(o.created_at) >= date(?) AND date(o.created_at) <= date(?)');
    params.push(startDate, endDate);
  } else {
    conditions.push("date(o.created_at) >= date('now', 'start of month')");
  }

  return { conditions, params };
}

// GET /api/reports/financial (Omzet, HPP, Laba Bersih, breakdown metode pembayaran)
router.get('/financial', authenticateToken, requirePermission('reports.view'), resolveOutletContext, async (req, res) => {
  try {
    const { period = 'month', start_date, end_date } = req.query;
    const { conditions, params } = buildDateConditions(period, start_date, end_date);

    const where = `o.status = 'paid' AND ${conditions.join(' AND ')} AND o.outlet_id = ?`;
    const queryParams = [...params, req.outletId];

    // Sales totals
    const financialSummary = await db.getAsync(`
      SELECT 
        COUNT(o.id) as total_transactions,
        COALESCE(SUM(o.subtotal), 0) as gross_sales,
        COALESCE(SUM(o.discount_amount), 0) as total_discounts,
        COALESCE(SUM(o.tax_amount), 0) as total_taxes,
        COALESCE(SUM(o.total_amount), 0) as net_sales
      FROM orders o 
      WHERE ${where}
    `, queryParams);

    // Total COGS (HPP) from order items
    const cogsSummary = await db.getAsync(`
      SELECT COALESCE(SUM(oi.cost_price * oi.quantity), 0) as total_cogs 
      FROM order_items oi 
      JOIN orders o ON oi.order_id = o.id 
      WHERE ${where}
    `, queryParams);

    // Total QRIS MDR fees paid to PJP
    const mdrSummary = await db.getAsync(`
      SELECT COALESCE(SUM(ql.mdr_amount), 0) as total_qris_mdr 
      FROM qris_ledger ql 
      JOIN orders o ON ql.order_id = o.id 
      WHERE ql.status IN ('PAID', 'SETTLED') AND ${conditions.join(' AND ')} AND o.outlet_id = ?
    `, queryParams);

    // Breakdown by payment method
    const paymentBreakdown = await db.allAsync(`
      SELECT op.payment_method, COUNT(op.id) as count, COALESCE(SUM(op.amount), 0) as total 
      FROM order_payments op 
      JOIN orders o ON op.order_id = o.id 
      WHERE ${where}
      GROUP BY op.payment_method
    `, queryParams);

    const grossSales = financialSummary.gross_sales;
    const totalDiscounts = financialSummary.total_discounts;
    const totalTaxes = financialSummary.total_taxes;
    const netRevenue = financialSummary.net_sales;
    const totalCogs = cogsSummary.total_cogs;
    const grossProfit = grossSales - totalDiscounts - totalCogs;
    const qrisMdr = mdrSummary.total_qris_mdr;
    const netProfit = grossProfit - qrisMdr;

    res.json({
      period,
      outlet_id: req.outletId,
      summary: {
        total_transactions: financialSummary.total_transactions,
        gross_sales: grossSales,
        total_discounts: totalDiscounts,
        total_taxes: totalTaxes,
        net_revenue: netRevenue,
        total_cogs: totalCogs,
        gross_profit: grossProfit,
        qris_mdr_fee: qrisMdr,
        net_profit: netProfit,
        profit_margin: netRevenue > 0 ? ((netProfit / netRevenue) * 100).toFixed(1) : 0
      },
      paymentBreakdown
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/products (Fast moving & slow moving products)
router.get('/products', authenticateToken, requirePermission('reports.view'), resolveOutletContext, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const parsedLimit = Number.parseInt(limit, 10) || 10;

    const fastMoving = await db.allAsync(`
      SELECT p.id, p.name, p.sku, p.stock, p.selling_price, 
             COALESCE(SUM(oi.quantity), 0) as total_sold, 
             COALESCE(SUM(oi.total), 0) as total_revenue 
      FROM products p 
      JOIN order_items oi ON p.id = oi.product_id 
      JOIN orders o ON oi.order_id = o.id 
      WHERE o.status = 'paid' AND p.outlet_id = ?
      GROUP BY p.id 
      ORDER BY total_sold DESC 
      LIMIT ?
    `, [req.outletId, parsedLimit]);

    const slowMoving = await db.allAsync(`
      SELECT p.id, p.name, p.sku, p.stock, p.selling_price, 
             COALESCE(SUM(CASE WHEN o.status = 'paid' THEN oi.quantity ELSE 0 END), 0) as total_sold, 
             COALESCE(SUM(CASE WHEN o.status = 'paid' THEN oi.total ELSE 0 END), 0) as total_revenue 
      FROM products p 
      LEFT JOIN order_items oi ON p.id = oi.product_id 
      LEFT JOIN orders o ON oi.order_id = o.id 
      WHERE p.is_active = 1 AND p.outlet_id = ?
      GROUP BY p.id 
      ORDER BY total_sold ASC, p.stock DESC 
      LIMIT ?
    `, [req.outletId, parsedLimit]);

    res.json({ fastMoving, slowMoving });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/cashiers (Sales per cashier in the active outlet)
router.get('/cashiers', authenticateToken, requirePermission('reports.view'), resolveOutletContext, async (req, res) => {
  try {
    const stats = await db.allAsync(`
      SELECT u.id, u.full_name, u.role, 
             COUNT(o.id) as total_transactions, 
             COALESCE(SUM(o.total_amount), 0) as total_sales, 
             COALESCE(ROUND(AVG(o.total_amount)), 0) as avg_ticket 
      FROM users u 
      LEFT JOIN orders o ON u.id = o.cashier_id AND o.status = 'paid' AND o.outlet_id = ?
      WHERE u.role IN ('cashier', 'manager')
        AND (
          u.id IN (SELECT user_id FROM user_outlets WHERE outlet_id = ?)
          OR u.outlet_id = ?
        )
      GROUP BY u.id 
      ORDER BY total_sales DESC
    `, [req.outletId, req.outletId, req.outletId]);
    res.json({ cashiers: stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
