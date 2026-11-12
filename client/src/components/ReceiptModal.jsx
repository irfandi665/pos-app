import React, { useState } from 'react';
import { Printer, Share2, Mail, Check, X, FileText } from 'lucide-react';
import { formatRupiah, formatDateTime } from '../api';

export default function ReceiptModal({ isOpen, orderData, onClose }) {
  const [copied, setCopied] = useState(false);
  const [waNumber, setWaNumber] = useState('');
  const [showWaInput, setShowWaInput] = useState(false);

  if (!isOpen || !orderData) return null;

  const { order, items = [], payments = [], qrisLedger } = orderData;

  const handlePrint = () => {
    window.print();
  };

  const generateReceiptText = () => {
    let text = `*${order.outlet_name || 'TOKO BERKAH MANDIRI'}*\n`;
    text += `${order.outlet_address || 'Jl. Malioboro No. 45, Yogyakarta'}\n`;
    text += `Telp: ${order.outlet_phone || '0812-3456-7890'}\n`;
    text += `--------------------------------\n`;
    text += `No. Transaksi: ${order.id}\n`;
    text += `Waktu: ${formatDateTime(order.created_at)}\n`;
    text += `Kasir: ${order.cashier_name || 'Kasir'}\n`;
    if (order.customer_name) text += `Pelanggan: ${order.customer_name}\n`;
    text += `--------------------------------\n`;

    items.forEach(it => {
      text += `${it.product_name}\n`;
      text += `  ${it.quantity} x ${formatRupiah(it.unit_price)} = ${formatRupiah(it.total)}\n`;
    });

    text += `--------------------------------\n`;
    text += `Subtotal: ${formatRupiah(order.subtotal)}\n`;
    if (order.discount_amount > 0) text += `Diskon: -${formatRupiah(order.discount_amount)}\n`;
    if (order.tax_amount > 0) text += `PPN (${order.tax_rate}%): ${formatRupiah(order.tax_amount)}\n`;
    text += `*TOTAL: ${formatRupiah(order.total_amount)}*\n`;
    text += `Metode Bayar: ${order.payment_method.toUpperCase()}\n`;

    if (qrisLedger) {
      text += `PJP Ref: ${qrisLedger.transaction_ref}\n`;
      if (qrisLedger.issuer_ref) text += `RRN: ${qrisLedger.issuer_ref}\n`;
      if (qrisLedger.customer_bank_or_wallet) text += `Bank/E-Wallet: ${qrisLedger.customer_bank_or_wallet}\n`;
    }

    text += `--------------------------------\n`;
    text += `Terima kasih atas kunjungan Anda!\n`;
    return text;
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(generateReceiptText());
    let url = `https://wa.me/?text=${text}`;
    if (waNumber.trim()) {
      const cleanPhone = waNumber.replace(/^0/, '62').replace(/\D/g, '');
      url = `https://wa.me/${cleanPhone}?text=${text}`;
    }
    window.open(url, '_blank');
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(generateReceiptText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 my-8">
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base leading-tight">Bukti Pembayaran / Struk</h3>
              <p className="text-xs text-slate-400">ESC/POS 58mm/80mm & Digital Receipt</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thermal Receipt Visual Preview */}
        <div className="p-6 bg-slate-100 flex justify-center">
          <div
            id="thermal-receipt-area"
            className="w-72 bg-white shadow-md p-4 rounded-sm border border-slate-200 text-slate-800 font-mono text-xs leading-relaxed"
          >
            <div className="text-center border-b border-dashed border-slate-300 pb-2 mb-2">
              <h4 className="font-bold text-sm tracking-wide">{order.outlet_name || 'TOKO BERKAH MANDIRI'}</h4>
              <p className="text-[11px] text-slate-600">{order.outlet_address || 'Jl. Malioboro No. 45, Yogyakarta'}</p>
              <p className="text-[11px] text-slate-600">Telp: {order.outlet_phone || '0812-3456-7890'}</p>
            </div>

            <div className="text-[11px] text-slate-600 mb-2 border-b border-dashed border-slate-300 pb-2">
              <div className="flex justify-between">
                <span>No. Txn:</span>
                <span className="font-bold text-slate-800">{order.id}</span>
              </div>
              <div className="flex justify-between">
                <span>Waktu:</span>
                <span>{formatDateTime(order.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span>Kasir:</span>
                <span>{order.cashier_name || 'Kasir'}</span>
              </div>
              {order.customer_name && (
                <div className="flex justify-between">
                  <span>Pelanggan:</span>
                  <span>{order.customer_name}</span>
                </div>
              )}
            </div>

            {/* Items */}
            <div className="border-b border-dashed border-slate-300 pb-2 mb-2 space-y-1">
              {items.map((it, idx) => (
                <div key={idx} className="text-[11px]">
                  <div className="font-semibold text-slate-900 truncate">{it.product_name}</div>
                  <div className="flex justify-between text-slate-600 pl-2">
                    <span>{it.quantity} x {formatRupiah(it.unit_price)}</span>
                    <span className="font-medium text-slate-800">{formatRupiah(it.total)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="space-y-1 text-[11px] border-b border-dashed border-slate-300 pb-2 mb-2">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>{formatRupiah(order.subtotal)}</span>
              </div>
              {order.discount_amount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Diskon</span>
                  <span>-{formatRupiah(order.discount_amount)}</span>
                </div>
              )}
              {order.tax_amount > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>PPN ({order.tax_rate}%)</span>
                  <span>{formatRupiah(order.tax_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs font-bold text-slate-900 pt-1 border-t border-slate-200">
                <span>TOTAL AKHIR</span>
                <span>{formatRupiah(order.total_amount)}</span>
              </div>
            </div>

            {/* Payment Details */}
            <div className="text-[11px] space-y-0.5 border-b border-dashed border-slate-300 pb-2 mb-2">
              <div className="flex justify-between">
                <span>Metode:</span>
                <span className="font-bold text-slate-800 uppercase">{order.payment_method}</span>
              </div>
              {payments.map((p, idx) => (
                <div key={idx} className="flex justify-between text-slate-600">
                  <span className="capitalize">{p.payment_method}:</span>
                  <span>{formatRupiah(p.amount)} {p.change_amount > 0 ? `(Kembali: ${formatRupiah(p.change_amount)})` : ''}</span>
                </div>
              ))}
              {qrisLedger && (
                <div className="pt-1 text-[10px] text-slate-500">
                  <div>Ref PJP: {qrisLedger.transaction_ref}</div>
                  {qrisLedger.issuer_ref && <div>RRN: {qrisLedger.issuer_ref}</div>}
                  {qrisLedger.customer_bank_or_wallet && <div>Sumber: {qrisLedger.customer_bank_or_wallet}</div>}
                </div>
              )}
            </div>

            <div className="text-center text-[10px] text-slate-500">
              <p>Terima kasih atas kunjungan Anda!</p>
              <p>Barang yang sudah dibeli tidak dapat ditukar tanpa struk.</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-white border-t border-slate-200 space-y-2">
          {showWaInput && (
            <div className="flex gap-2 mb-2 animate-in fade-in">
              <input
                type="text"
                placeholder="Nomor WA (contoh: 081234567890)"
                value={waNumber}
                onChange={(e) => setWaNumber(e.target.value)}
                className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                onClick={handleShareWhatsApp}
                className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700"
              >
                Kirim
              </button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-900 text-white font-medium text-xs hover:bg-slate-800 shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Struk</span>
            </button>
            <button
              onClick={() => setShowWaInput(!showWaInput)}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium text-xs hover:bg-emerald-100"
            >
              <Share2 className="w-4 h-4" />
              <span>Kirim WA</span>
            </button>
            <button
              onClick={handleCopyText}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-100 text-slate-700 font-medium text-xs hover:bg-slate-200 border border-slate-200"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Mail className="w-4 h-4" />}
              <span>{copied ? 'Tersalin!' : 'Salin Teks'}</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-full py-2 text-center text-xs text-slate-500 hover:text-slate-800 font-medium"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
