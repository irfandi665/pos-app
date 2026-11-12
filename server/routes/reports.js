const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken, requireRole } = require('../auth');

// GET /api/reports/financial (Omzet, HPP, Laba Bersih, breakdown metode pembayaran)
router.get('/financial', authenticateToken, requireRole(['manager', 'owner']), async (req, res) => {
  try {
    const { period = 'month', start_date, end_date } = req.query;

    let dateCondition = "date(o.created_at) >= date('now', 'start of month')";
    if (period === 'today') {
      dateCondition = "date(o.created_at) = date('now')";
    } else if (period === 'week') {
      dateCondition = "date(o.created_at) >= date('now', '-7 days')";
    } else if (period === 'custom' && start_date && end_date) {
      dateCondition = `date(o.created_at) >= date('${start_date}') AND date(o.created_at) <= date('${end_date}')`;
    }

    // Sales totals
    const financialSummary = await db.getAsync(`
      SELECT 
        COUNT(o.id) as total_transactions,
        COALESCE(SUM(o.subtotal), 0) as gross_sales,
        COALESCE(SUM(o.discount_amount), 0) as total_discounts,
        COALESCE(SUM(o.tax_amount), 0) as total_taxes,
        COALESCE(SUM(o.total_amount), 0) as net_sales
      FROM orders o 
      WHERE o.status = 'paid' AND ${dateCondition}
    `);

    // Total COGS (HPP) from order items
    const cogsSummary = await db.getAsync(`
      SELECT COALESCE(SUM(oi.cost_price * oi.quantity), 0) as total_cogs 
      FROM order_items oi 
      JOIN orders o ON oi.order_id = o.id 
      WHERE o.status = 'paid' AND ${dateCondition}
    `);

    // Total QRIS MDR fees paid to PJP
    const mdrSummary = await db.getAsync(`
      SELECT COALESCE(SUM(ql.mdr_amount), 0) as total_qris_mdr 
      FROM qris_ledger ql 
      JOIN orders o ON ql.order_id = o.id 
      WHERE ql.status IN ('PAID', 'SETTLED') AND ${dateCondition}
    `);

    // Breakdown by payment method
    const paymentBreakdown = await db.allAsync(`
      SELECT op.payment_method, COUNT(op.id) as count, COALESCE(SUM(op.amount), 0) as total 
      FROM order_payments op 
      JOIN orders o ON op.order_id = o.id 
      WHERE o.status = 'paid' AND ${dateCondition} 
      GROUP BY op.payment_method
    `);

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
router.get('/products', authenticateToken, requireRole(['manager', 'owner']), async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const fastMoving = await db.allAsync(`
      SELECT p.id, p.name, p.sku, p.stock, p.selling_price, 
             COALESCE(SUM(oi.quantity), 0) as total_sold, 
             COALESCE(SUM(oi.total), 0) as total_revenue 
      FROM products p 
      JOIN order_items oi ON p.id = oi.product_id 
      JOIN orders o ON oi.order_id = o.id 
      WHERE o.status = 'paid' 
      GROUP BY p.id 
      ORDER BY total_sold DESC 
      LIMIT ?
    `, [parseInt(limit, 10)]);

    const slowMoving = await db.allAsync(`
      SELECT p.id, p.name, p.sku, p.stock, p.selling_price, 
             COALESCE(SUM(oi.quantity), 0) as total_sold, 
             COALESCE(SUM(oi.total), 0) as total_revenue 
      FROM products p 
      LEFT JOIN order_items oi ON p.id = oi.product_id 
      LEFT JOIN orders o ON oi.order_id = o.id AND o.status = 'paid' 
      WHERE p.is_active = 1 
      GROUP BY p.id 
      ORDER BY total_sold ASC, p.stock DESC 
      LIMIT ?
    `, [parseInt(limit, 10)]);

    res.json({ fastMoving, slowMoving });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/cashiers (Sales per cashier)
router.get('/cashiers', authenticateToken, requireRole(['manager', 'owner']), async (req, res) => {
  try {
    const stats = await db.allAsync(`
      SELECT u.id, u.full_name, u.role, 
             COUNT(o.id) as total_transactions, 
             COALESCE(SUM(o.total_amount), 0) as total_sales, 
             COALESCE(ROUND(AVG(o.total_amount)), 0) as avg_ticket 
      FROM users u 
      LEFT JOIN orders o ON u.id = o.cashier_id AND o.status = 'paid' 
      WHERE u.role IN ('cashier', 'manager') 
      GROUP BY u.id 
      ORDER BY total_sales DESC
    `);
    res.json({ cashiers: stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
