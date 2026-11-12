import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Barcode, 
  Plus, 
  Minus, 
  Trash2, 
  PauseCircle, 
  CreditCard, 
  Banknote, 
  QrCode, 
  Layers, 
  AlertCircle, 
  CheckCircle2, 
  User, 
  Receipt,
  X
} from 'lucide-react';
import { apiRequest, formatRupiah, subscribeToQrisEvents } from '../api';
import QrisSimulatorModal from '../components/QrisSimulatorModal';
import ReceiptModal from '../components/ReceiptModal';

export default function PosView({ user, onBillHeld }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [activeShift, setActiveShift] = useState(null);

  // Discount & Tax settings
  const [discountType, setDiscountType] = useState('nominal'); // 'nominal' | 'percent'
  const [discountValue, setDiscountValue] = useState(0);
  const [taxRate, setTaxRate] = useState(11); // default 11% PPN
  const [taxEnabled, setTaxEnabled] = useState(true);

  // CRM Customer selection
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Checkout Modal State
  const [showCheckout, setShowCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash' | 'qris' | 'card' | 'split'
  const [cashTender, setCashTender] = useState('');
  const [cardIssuer, setCardIssuer] = useState('BCA');
  const [cardRef, setCardRef] = useState('');

  // Split payment state
  const [splitCash, setSplitCash] = useState('');
  const [splitQris, setSplitQris] = useState('');
  const [splitCard, setSplitCard] = useState('');

  // QRIS dynamic modal state
  const [qrisData, setQrisData] = useState(null);
  const [showQrisModal, setShowQrisModal] = useState(false);

  // Receipt Modal State
  const [receiptData, setReceiptData] = useState(null);
  const [showReceipt, setShowReceipt] = useState(false);

  // Loading & error
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load products, categories, shift, and settings
  const fetchData = async () => {
    try {
      const [prodRes, catRes, shiftRes, custRes, setRes] = await Promise.all([
        apiRequest('/products'),
        apiRequest('/products/categories/list'),
        apiRequest('/shifts/current'),
        apiRequest('/customers'),
        apiRequest('/settings')
      ]);

      setProducts(prodRes.products || []);
      setCategories(catRes.categories || []);
      setActiveShift(shiftRes.active_shift);
      setCustomers(custRes.customers || []);

      if (setRes.settings) {
        if (setRes.settings.tax_rate) setTaxRate(parseFloat(setRes.settings.tax_rate));
        if (setRes.settings.tax_enabled) setTaxEnabled(setRes.settings.tax_enabled === 'true');
      }
    } catch (err) {
      console.error('Failed to load POS data:', err);
      setError(err.message);
    }
  };

  useEffect(() => {
    fetchData();

    // Listen to real-time QRIS SSE events
    const es = subscribeToQrisEvents(
      (paidEvent) => {
        // If the paid event belongs to the current open QRIS order
        if (qrisData && (qrisData.transaction_ref === paidEvent.transaction_ref || qrisData.order_id === paidEvent.order_id)) {
          handleQrisPaid(paidEvent);
        }
      },
      (expiredEvent) => {
        if (qrisData && qrisData.transaction_ref === expiredEvent.transaction_ref) {
          setError('QRIS kedaluwarsa tanpa pembayaran. Silakan buat QR baru.');
          setShowQrisModal(false);
        }
      }
    );

    return () => {
      if (es) es.close();
    };
  }, [qrisData]);

  // Cart Calculations
  const subtotal = cart.reduce((acc, item) => acc + (item.selling_price * item.quantity), 0);
  const calculatedDiscount = discountType === 'percent' 
    ? Math.round(subtotal * (parseFloat(discountValue || 0) / 100))
    : parseInt(discountValue || 0, 10);
  const afterDiscount = Math.max(0, subtotal - calculatedDiscount);
  const calculatedTax = taxEnabled ? Math.round(afterDiscount * (taxRate / 100)) : 0;
  const totalAmount = afterDiscount + calculatedTax;

  // Add item to cart
  const addToCart = (product) => {
    if (product.stock <= 0) {
      alert(`Stok "${product.name}" habis!`);
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item.product_id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          alert(`Jumlah melebihi stok tersedia (${product.stock})`);
          return prev;
        }
        return prev.map(item => 
          item.product_id === product.id 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, {
        product_id: product.id,
        name: product.name,
        sku: product.sku,
        selling_price: product.selling_price,
        cost_price: product.cost_price,
        stock: product.stock,
        quantity: 1
      }];
    });
  };

  const updateQuantity = (productId, delta) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.product_id === productId) {
          const newQty = item.quantity + delta;
          if (newQty > item.stock) {
            alert(`Maksimal stok tercapai (${item.stock})`);
            return item;
          }
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
      }).filter(Boolean);
    });
  };

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(item => item.product_id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setDiscountValue(0);
    setSelectedCustomer(null);
  };

  // Hold Bill (Save Bill)
  const handleHoldBill = async () => {
    if (cart.length === 0) return;
    const name = prompt('Masukkan nama antrean / nomor meja untuk simpan bill:', `Antrean #${Math.floor(100 + Math.random() * 900)}`);
    if (!name) return;

    try {
      setLoading(true);
      await apiRequest('/orders/hold', {
        method: 'POST',
        body: JSON.stringify({
          items: cart,
          held_name: name,
          discount_amount: calculatedDiscount,
          tax_rate: taxEnabled ? taxRate : 0,
          customer_id: selectedCustomer?.id
        })
      });

      clearCart();
      if (onBillHeld) onBillHeld();
      alert(`Pesanan "${name}" berhasil disimpan sementara.`);
    } catch (err) {
      alert(err.message || 'Gagal menyimpan pesanan');
    } finally {
      setLoading(false);
    }
  };

  // Trigger Checkout
  const handleStartCheckout = () => {
    if (cart.length === 0) return;
    if (!activeShift) {
      alert('Tidak ada shift kasir yang aktif. Buka shift kasir terlebih dahulu pada tab "Shift Kasir".');
      return;
    }
    setCashTender(String(totalAmount));
    setSplitCash(String(Math.floor(totalAmount / 2)));
    setSplitQris(String(totalAmount - Math.floor(totalAmount / 2)));
    setSplitCard('0');
    setShowCheckout(true);
  };

  // Process Cash / Card / Split payment
  const handleCompleteOrder = async () => {
    setLoading(true);
    setError('');

    try {
      let payments = [];

      if (paymentMethod === 'cash') {
        const tender = parseInt(cashTender || totalAmount, 10);
        if (tender < totalAmount) {
          throw new Error('Uang tunai yang diterima kurang dari total tagihan');
        }
        payments.push({
          method: 'cash',
          amount: totalAmount,
          tender: tender,
          change: tender - totalAmount
        });
      } else if (paymentMethod === 'card') {
        payments.push({
          method: 'card',
          amount: totalAmount,
          card_issuer: cardIssuer,
          card_ref: cardRef || `EDC-${Math.floor(100000 + Math.random() * 900000)}`
        });
      } else if (paymentMethod === 'split') {
        const c = parseInt(splitCash || 0, 10);
        const q = parseInt(splitQris || 0, 10);
        const cd = parseInt(splitCard || 0, 10);
        const totalSplit = c + q + cd;

        if (totalSplit !== totalAmount) {
          throw new Error(`Total pembayaran split (Rp ${totalSplit.toLocaleString('id-ID')}) harus sama persis dengan total tagihan (Rp ${totalAmount.toLocaleString('id-ID')})`);
        }

        if (c > 0) payments.push({ method: 'cash', amount: c, tender: c, change: 0 });
        if (q > 0) payments.push({ method: 'qris', amount: q });
        if (cd > 0) payments.push({ method: 'card', amount: cd, card_issuer: cardIssuer, card_ref: cardRef });
      }

      const res = await apiRequest('/orders', {
        method: 'POST',
        body: JSON.stringify({
          items: cart,
          payment_method: paymentMethod,
          payments,
          discount_amount: calculatedDiscount,
          discount_type: discountType,
          tax_rate: taxEnabled ? taxRate : 0,
          customer_id: selectedCustomer?.id
        })
      });

      // Fetch order details for receipt
      const orderData = await apiRequest(`/orders/${res.order_id}`);
      setReceiptData(orderData);
      setShowReceipt(true);

      // Reset cart
      clearCart();
      setShowCheckout(false);
      fetchData(); // refresh stock
    } catch (err) {
      setError(err.message || 'Gagal memproses pembayaran');
    } finally {
      setLoading(false);
    }
  };

  // Generate QRIS Dinamis
  const handleGenerateQris = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest('/qris/generate', {
        method: 'POST',
        body: JSON.stringify({
          items: cart,
          discount_amount: calculatedDiscount,
          tax_rate: taxEnabled ? taxRate : 0,
          customer_id: selectedCustomer?.id
        })
      });

      setQrisData(res);
      setShowCheckout(false);
      setShowQrisModal(true);
    } catch (err) {
      setError(err.message || 'Gagal membuat QRIS dinamis');
    } finally {
      setLoading(false);
    }
  };

  // Called when QRIS Webhook or Simulator succeeds
  const handleQrisPaid = async (paidEvent) => {
    setShowQrisModal(false);
    try {
      const orderData = await apiRequest(`/orders/${paidEvent.order_id}`);
      setReceiptData(orderData);
      setShowReceipt(true);
      clearCart();
      setQrisData(null);
      fetchData();
    } catch (err) {
      console.error('Failed to load order receipt after QRIS paid:', err);
    }
  };

  // Filtered Products
  const filteredProducts = products.filter(p => {
    const matchesCat = !selectedCategory || p.category_id === selectedCategory;
    const matchesSearch = !searchQuery || 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.barcode && p.barcode.includes(searchQuery));
    return matchesCat && matchesSearch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
      {/* Shift status alert */}
      {!activeShift && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-2xl flex items-center justify-between text-amber-800 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Shift kasir belum dibuka. Anda harus membuka shift (modal awal) sebelum memproses transaksi.</span>
          </div>
          <span className="font-bold underline cursor-pointer">Buka Shift</span>
        </div>
      )}

      {/* Main Grid: Left Catalog, Right Cart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Product Catalog (7 or 8 columns) */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col space-y-4">
          {/* Search & Barcode input */}
          <div className="bg-white p-3 rounded-2xl shadow-xs border border-slate-200 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari nama barang, SKU, atau scan barcode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <button
              onClick={() => {
                const code = prompt('Simulasi scan barcode (contoh: 899100100101):');
                if (code) setSearchQuery(code);
              }}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1 text-xs font-semibold"
              title="Scan Barcode"
            >
              <Barcode className="w-4 h-4" />
              <span className="hidden sm:inline">Scan</span>
            </button>
          </div>

          {/* Category Filter Pills */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                selectedCategory === null
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Semua ({products.length})
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  selectedCategory === cat.id
                    ? 'bg-brand-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {cat.name} ({cat.product_count || 0})
              </button>
            ))}
          </div>

          {/* Product Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filteredProducts.map(p => {
              const isLowStock = p.stock <= p.min_stock;
              return (
                <div
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="bg-white rounded-2xl p-3 border border-slate-200 shadow-xs hover:border-brand-500 hover:shadow-md transition cursor-pointer flex flex-col justify-between group active:scale-[0.98]"
                >
                  <div>
                    {/* Image / Thumbnail placeholder */}
                    <div className="w-full h-24 bg-slate-100 rounded-xl mb-2 overflow-hidden relative">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300 font-bold text-xs">
                          {p.sku}
                        </div>
                      )}
                      {isLowStock && (
                        <span className="absolute top-1 right-1 bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-xs">
                          Stok: {p.stock}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono block">{p.sku}</span>
                    <h4 className="text-xs font-bold text-slate-800 line-clamp-2 leading-snug group-hover:text-brand-600">
                      {p.name}
                    </h4>
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-black text-slate-900">
                      {formatRupiah(p.selling_price)}
                    </span>
                    <span className="text-[10px] text-slate-400">/{p.unit}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Cashier Cart (5 or 4 columns) */}
        <div className="lg:col-span-5 xl:col-span-4">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 sticky top-20 flex flex-col justify-between max-h-[calc(100vh-100px)]">
            <div>
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-brand-600" />
                  <h3 className="font-bold text-sm text-slate-800">Keranjang Kasir</h3>
                  <span className="bg-slate-100 text-slate-700 text-xs font-bold px-2 py-0.5 rounded-full">
                    {cart.reduce((a, b) => a + b.quantity, 0)} item
                  </span>
                </div>
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="text-slate-400 hover:text-rose-600 text-xs font-medium"
                  >
                    Batal
                  </button>
                )}
              </div>

              {/* Customer Selector (CRM) */}
              <div className="mt-3 flex items-center justify-between p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <div className="flex items-center gap-1.5 text-slate-700 truncate">
                  <User className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="font-semibold truncate">
                    {selectedCustomer ? selectedCustomer.name : 'Pelanggan Umum (Guest)'}
                  </span>
                  {selectedCustomer && (
                    <span className="bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.2 rounded-full uppercase">
                      {selectedCustomer.membership_tier} ({selectedCustomer.points} pts)
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    const phone = prompt('Masukkan No. HP Pelanggan CRM (contoh: 081299887766):');
                    if (phone) {
                      const found = customers.find(c => c.phone.includes(phone) || phone.includes(c.phone));
                      if (found) setSelectedCustomer(found);
                      else alert('Pelanggan tidak ditemukan');
                    }
                  }}
                  className="text-brand-600 font-semibold text-[11px] hover:underline"
                >
                  {selectedCustomer ? 'Ganti' : 'Pilih Member'}
                </button>
              </div>

              {/* Cart Items List */}
              <div className="mt-3 space-y-2 overflow-y-auto max-h-56 pr-1">
                {cart.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-xs">
                    <p>Keranjang masih kosong.</p>
                    <p className="text-[11px] text-slate-400 mt-1">Pilih produk di sebelah kiri untuk menambah ke transaksi.</p>
                  </div>
                ) : (
                  cart.map(item => (
                    <div
                      key={item.product_id}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                    >
                      <div className="truncate pr-2">
                        <div className="font-bold text-slate-800 truncate">{item.name}</div>
                        <div className="text-slate-500 font-mono text-[11px]">
                          {formatRupiah(item.selling_price)} x {item.quantity} = <span className="font-semibold text-slate-800">{formatRupiah(item.selling_price * item.quantity)}</span>
                        </div>
                      </div>

                      {/* Quantity Controls */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => updateQuantity(item.product_id, -1)}
                          className="w-6 h-6 rounded-lg bg-white border border-slate-300 flex items-center justify-center hover:bg-slate-100"
                        >
                          <Minus className="w-3 h-3 text-slate-600" />
                        </button>
                        <span className="w-5 text-center font-bold text-xs">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.product_id, 1)}
                          className="w-6 h-6 rounded-lg bg-white border border-slate-300 flex items-center justify-center hover:bg-slate-100"
                        >
                          <Plus className="w-3 h-3 text-slate-600" />
                        </button>
                        <button
                          onClick={() => removeFromCart(item.product_id)}
                          className="w-6 h-6 rounded-lg text-slate-400 hover:text-rose-600 flex items-center justify-center ml-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Calculations & Actions Footer */}
            <div className="pt-3 border-t border-slate-200 mt-3 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>{formatRupiah(subtotal)}</span>
              </div>

              {/* Discount Input */}
              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-1">
                  <span>Diskon</span>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value)}
                    className="text-[10px] bg-slate-100 border border-slate-300 rounded px-1 py-0.5"
                  >
                    <option value="nominal">Rp</option>
                    <option value="percent">%</option>
                  </select>
                </span>
                <div className="flex items-center gap-1">
                  <span>-</span>
                  <input
                    type="number"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    className="w-20 text-right px-2 py-0.5 text-xs bg-slate-50 border border-slate-200 rounded"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Tax Toggle */}
              <div className="flex justify-between items-center text-slate-600">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={taxEnabled}
                    onChange={(e) => setTaxEnabled(e.target.checked)}
                    className="rounded text-brand-600 focus:ring-brand-500"
                  />
                  <span>PPN ({taxRate}%)</span>
                </label>
                <span>{formatRupiah(calculatedTax)}</span>
              </div>

              {/* Total Final */}
              <div className="flex justify-between items-center text-base font-black text-slate-900 pt-2 border-t border-slate-200">
                <span>TOTAL AKHIR</span>
                <span className="text-xl text-brand-700">{formatRupiah(totalAmount)}</span>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-3 gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleHoldBill}
                  disabled={cart.length === 0 || loading}
                  className="py-2.5 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-1 transition"
                  title="Simpan sementara keranjang ini untuk melayani pelanggan berikutnya"
                >
                  <PauseCircle className="w-4 h-4 text-amber-600" />
                  <span>Hold Bill</span>
                </button>

                <button
                  type="button"
                  onClick={handleStartCheckout}
                  disabled={cart.length === 0 || loading}
                  className="col-span-2 py-2.5 px-3 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold text-sm shadow-md shadow-brand-500/20 flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
                >
                  <span>Bayar Sekarang</span>
                  <span>({formatRupiah(totalAmount)})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Checkout Payment Modal */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">Pilih Pembayaran</h3>
                <p className="text-xs text-slate-400">Total Tagihan: <span className="font-mono text-emerald-400 font-bold text-sm">{formatRupiah(totalAmount)}</span></p>
              </div>
              <button onClick={() => setShowCheckout(false)} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {error && (
                <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Payment Method Selector Tabs */}
              <div className="grid grid-cols-4 gap-2 mb-6">
                {[
                  { id: 'cash', label: 'Tunai', icon: Banknote },
                  { id: 'qris', label: 'QRIS Dinamis', icon: QrCode, highlight: true },
                  { id: 'card', label: 'Kartu / EDC', icon: CreditCard },
                  { id: 'split', label: 'Split Pay', icon: Layers }
                ].map(m => {
                  const Icon = m.icon;
                  const isSel = paymentMethod === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id)}
                      className={`py-3 px-2 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-xs font-bold border transition ${
                        isSel
                          ? 'bg-brand-600 text-white border-brand-600 shadow-md ring-2 ring-brand-300'
                          : m.highlight
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Dynamic Content per Method */}
              {paymentMethod === 'cash' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Uang Tunai Diterima (Rp)</label>
                    <input
                      type="number"
                      value={cashTender}
                      onChange={(e) => setCashTender(e.target.value)}
                      className="w-full px-4 py-2.5 text-lg font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>

                  {/* Quick Cash Presets */}
                  <div className="grid grid-cols-4 gap-2">
                    {[totalAmount, 20000, 50000, 100000].map((amt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setCashTender(String(amt))}
                        className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-semibold text-slate-700"
                      >
                        {idx === 0 ? 'Uang Pas' : formatRupiah(amt)}
                      </button>
                    ))}
                  </div>

                  {/* Calculated Change */}
                  <div className="p-3 bg-slate-100 rounded-xl flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-600">Kembalian:</span>
                    <span className={`text-base font-black ${
                      (parseInt(cashTender || 0, 10) - totalAmount) >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {formatRupiah(Math.max(0, parseInt(cashTender || 0, 10) - totalAmount))}
                    </span>
                  </div>

                  <button
                    onClick={handleCompleteOrder}
                    disabled={loading || parseInt(cashTender || 0, 10) < totalAmount}
                    className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm shadow-md"
                  >
                    {loading ? 'Menyimpan...' : 'Selesaikan Pembayaran Tunai'}
                  </button>
                </div>
              )}

              {paymentMethod === 'qris' && (
                <div className="space-y-4 text-center">
                  <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-800">
                    <p className="font-bold text-sm mb-1">Generate Dynamic QRIS</p>
                    <p>Sistem akan membuat QR Code unik Bank Indonesia dengan nominal terkunci (Rp {totalAmount.toLocaleString('id-ID')}).</p>
                    <p className="mt-1 text-slate-500">Notifikasi otomatis terverifikasi via webhook PJP dalam waktu &lt; 2 detik.</p>
                  </div>

                  <button
                    onClick={handleGenerateQris}
                    disabled={loading}
                    className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 text-white font-bold rounded-xl text-sm shadow-md flex items-center justify-center gap-2"
                  >
                    <QrCode className="w-5 h-5" />
                    <span>Tampilkan Kode QRIS Dinamis</span>
                  </button>
                </div>
              )}

              {paymentMethod === 'card' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Penerbit / Mesin EDC</label>
                    <select
                      value={cardIssuer}
                      onChange={(e) => setCardIssuer(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
                    >
                      <option value="BCA">BCA (Debit / Kredit)</option>
                      <option value="Mandiri">Mandiri</option>
                      <option value="BRI">BRI</option>
                      <option value="BNI">BNI</option>
                      <option value="CIMB">CIMB Niaga</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor Approval / Trace Ref EDC</label>
                    <input
                      type="text"
                      placeholder="Contoh: 004521"
                      value={cardRef}
                      onChange={(e) => setCardRef(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                    />
                  </div>

                  <button
                    onClick={handleCompleteOrder}
                    disabled={loading}
                    className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm shadow-md"
                  >
                    {loading ? 'Menyimpan...' : 'Selesaikan Pembayaran Kartu'}
                  </button>
                </div>
              )}

              {paymentMethod === 'split' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">Membagi pembayaran ke lebih dari 1 metode:</p>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Tunai (Rp)</label>
                    <input
                      type="number"
                      value={splitCash}
                      onChange={(e) => setSplitCash(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">QRIS (Rp)</label>
                    <input
                      type="number"
                      value={splitQris}
                      onChange={(e) => setSplitQris(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Kartu (Rp)</label>
                    <input
                      type="number"
                      value={splitCard}
                      onChange={(e) => setSplitCard(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                    />
                  </div>

                  <div className="p-2.5 bg-slate-100 rounded-xl flex justify-between text-xs font-bold">
                    <span>Total Split:</span>
                    <span>{formatRupiah((parseInt(splitCash || 0, 10) + parseInt(splitQris || 0, 10) + parseInt(splitCard || 0, 10)))}</span>
                  </div>

                  <button
                    onClick={handleCompleteOrder}
                    disabled={loading}
                    className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm shadow-md"
                  >
                    {loading ? 'Menyimpan...' : 'Selesaikan Split Payment'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dynamic QRIS Simulator Modal */}
      <QrisSimulatorModal
        isOpen={showQrisModal}
        qrisData={qrisData}
        onPaidSuccess={handleQrisPaid}
        onClose={() => setShowQrisModal(false)}
      />

      {/* Struk Receipt Modal */}
      <ReceiptModal
        isOpen={showReceipt}
        orderData={receiptData}
        onClose={() => setShowReceipt(false)}
      />
    </div>
  );
}
