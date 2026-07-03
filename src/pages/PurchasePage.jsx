import { useState, useEffect, useCallback } from 'react';
import { Plus, ShoppingBag, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import { getPurchasesByMonth } from '../firebase/purchases';
import { useToast } from '../context/ToastContext';
import NewPurchaseModal from '../components/NewPurchaseModal';

const CATEGORY_LABELS = {
  raw: 'Raw Rice',
  boiled: 'Boiled Rice',
  steam: 'Half Boiled Rice',
  basmathi: 'Basmathi',
  seeraga: 'Seeraga Samba'
};

const FULL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function PurchaseCard({ purchase, formatDate }) {
  const [expanded, setExpanded] = useState(false);

  const catLabel = CATEGORY_LABELS[purchase.categoryKey] || purchase.categoryKey || '—';
  const totalCost = Number(purchase.total || purchase.totalAmount || 0);
  const amountPaid = Number(purchase.amountPaid || 0);
  const balance = totalCost - amountPaid;

  const phone = purchase.supplierPhone || '—';
  const location = purchase.supplierLocation || '';

  return (
    <div className="rounded-xl border border-border bg-white shadow-sm hover:shadow-md hover:border-gold/30 transition-all duration-150">

      {/* ── TOP LINE: Supplier | Bill Pill | Total ── */}
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2 border-b border-border/40">
        <span className="font-bold text-textDark text-base truncate max-w-[38%]">
          {purchase.supplierName || '—'}
        </span>
        <span className="text-sm font-semibold text-textMuted bg-panel border border-border/70 px-2.5 py-0.5 rounded-full shrink-0">
          {purchase.billNo || '—'}
        </span>
        <span className="font-bold text-gold text-base shrink-0">
          ₹{totalCost.toLocaleString('en-IN')}
        </span>
      </div>

      {/* ── SECOND LINE: Phone | Location | Date ── */}
      <div className="flex items-center justify-between gap-3 px-4 py-1.5">
        <div className="flex items-center gap-3 text-sm text-textMuted min-w-0">
          <span className="shrink-0">{phone}</span>
          {location && (
            <>
              <span className="text-border">·</span>
              <span className="flex items-center gap-0.5 truncate">
                <MapPin className="w-3 h-3 shrink-0" />
                {location}
              </span>
            </>
          )}
        </div>
        <span className="text-sm text-textMuted shrink-0 font-medium">
          {formatDate(purchase.date || purchase.createdAt)}
        </span>
      </div>

      {/* ── THIRD LINE: Supply details table ── */}
      <div className="px-4 pb-2">
        {/* Column headers — only shown once */}
        <div className="grid grid-cols-[2fr_3fr_1fr_1.2fr_1.2fr] gap-x-3 pt-1.5 pb-1 text-sm uppercase tracking-wider font-semibold text-textMuted border-t border-border/30">
          <span>Category</span>
          <span>Item</span>
          <span className="text-right">Bags</span>
          <span className="text-right">Cost/Bag</span>
          <span className="text-right">Total</span>
        </div>
        {/* Single item row (future: map over items array) */}
        <div className="grid grid-cols-[2fr_3fr_1fr_1.2fr_1.2fr] gap-x-3 items-center py-1 text-sm">
          <span className="text-textMuted truncate">{catLabel}</span>
          <span className="font-medium text-textDark truncate">{purchase.itemName || '—'}</span>
          <span className="text-right text-textDark tabular-nums">{Number(purchase.bags || 0).toLocaleString('en-IN')}</span>
          <span className="text-right text-textMuted tabular-nums">₹{Number(purchase.costPerBag || 0).toLocaleString('en-IN')}</span>
          <span className="text-right font-semibold text-textDark tabular-nums">₹{totalCost.toLocaleString('en-IN')}</span>
        </div>
      </div>

      {/* ── PAYMENT TOGGLE + EXPANDED SECTION ── */}
      <div className="border-t border-border/40">
        {/* Expanded payment panel */}
        {expanded && (
          <div className="px-4 pt-3 pb-2">
            <div className="bg-panel/50 rounded-xl border border-border/60 p-3 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-sm uppercase tracking-wider font-semibold text-textMuted mb-1">Payment Paid</p>
                <p className={`text-sm font-bold ${amountPaid > 0 ? 'text-credit' : 'text-textMuted'}`}>
                  {amountPaid > 0 ? `₹${amountPaid.toLocaleString('en-IN')}` : 'Not recorded'}
                </p>
              </div>
              <div>
                <p className="text-sm uppercase tracking-wider font-semibold text-textMuted mb-1">Balance Due</p>
                <p className={`text-sm font-bold ${balance > 0 ? 'text-debit' : 'text-credit'}`}>
                  {balance > 0 ? `₹${balance.toLocaleString('en-IN')}` : '₹0'}
                </p>
              </div>
              <div>
                <p className="text-sm uppercase tracking-wider font-semibold text-textMuted mb-1">Total Cost</p>
                <p className="text-sm font-bold text-gold">₹{totalCost.toLocaleString('en-IN')}</p>
              </div>
            </div>
            {purchase.notes && (
              <p className="text-sm text-textMuted italic mt-2 px-1">{purchase.notes}</p>
            )}
          </div>
        )}

        {/* Toggle link */}
        <button
          onClick={() => setExpanded(prev => !prev)}
          className="w-full flex items-center justify-end gap-1 px-4 py-2 text-sm font-semibold text-textMuted hover:text-gold transition-colors bg-panel/20 rounded-b-xl"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              Hide Payment Details
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              Payment Details
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function PurchasePage() {
  const now = new Date();
  const [selectedMonthDate, setSelectedMonthDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { showToast } = useToast();

  const fetchPurchases = useCallback(async (dateObj = selectedMonthDate) => {
    try {
      setLoading(true);
      const data = await getPurchasesByMonth(dateObj.getFullYear(), dateObj.getMonth());
      setPurchases(data);
    } catch (error) {
      console.error('Error loading purchases:', error);
      showToast('Failed to load purchases', 'error');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchPurchases(selectedMonthDate);
  }, [selectedMonthDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMonthChange = (newDate) => {
    setSelectedMonthDate(newDate);
  };

  const formatDate = (dateVal) => {
    if (!dateVal) return '—';
    const d = typeof dateVal === 'string' ? new Date(dateVal) : (dateVal.toDate ? dateVal.toDate() : new Date(dateVal));
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const curYear = selectedMonthDate.getFullYear();
  const curMonthIdx = selectedMonthDate.getMonth();
  const prevDate = new Date(curYear, curMonthIdx - 1, 1);
  const nextDate = new Date(curYear, curMonthIdx + 1, 1);
  const isCurrentOrFuture = (curYear > now.getFullYear()) ||
    (curYear === now.getFullYear() && curMonthIdx >= now.getMonth());

  return (
    <div className="space-y-6 pb-12">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-border">
        <div>
          <h1 className="font-display text-2xl font-bold text-brownDark flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-gold" />
            Stock In (Purchases)
          </h1>
          <p className="text-sm text-textMuted mt-1">Record inward stock from suppliers and manage inventory purchases.</p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-gold hover:bg-gold/90 text-white font-medium py-3 px-5 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 text-sm whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          + New Purchase
        </button>
      </div>

      {/* ── Recent Purchases — Card Layout ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden">
        {/* Section header */}
        <div className="p-5 border-b border-border bg-panel/30">
          <h2 className="font-display text-lg font-semibold text-brownDark">Recent Purchases</h2>
        </div>

        {/* Monthly toggle */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-panel/20 border-b border-border">
          <button
            type="button"
            onClick={() => handleMonthChange(prevDate)}
            className="px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium bg-white border border-border hover:bg-gold/10 text-textDark transition-colors"
          >
            ← {FULL_MONTH_NAMES[prevDate.getMonth()]}
          </button>
          <span className="font-display font-semibold text-sm sm:text-base text-brownDark">
            {FULL_MONTH_NAMES[curMonthIdx]} {curYear}
          </span>
          <button
            type="button"
            onClick={() => handleMonthChange(nextDate)}
            disabled={isCurrentOrFuture}
            className="px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium bg-white border border-border hover:bg-gold/10 text-textDark disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            {FULL_MONTH_NAMES[nextDate.getMonth()]} →
          </button>
        </div>

        {/* Column headers — shown once above the cards */}
        {!loading && purchases.length > 0 && (
          <div className="hidden sm:grid grid-cols-[2fr_3fr_1fr_1.2fr_1.2fr] gap-x-3 px-5 pt-3 pb-1.5 text-sm uppercase tracking-wider font-semibold text-textMuted border-b border-border/50">
            <span>Category</span>
            <span>Item</span>
            <span className="text-right">Bags</span>
            <span className="text-right">Cost/Bag (₹)</span>
            <span className="text-right">Total (₹)</span>
          </div>
        )}

        {/* Cards */}
        <div className="p-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(n => (
                <div key={n} className="animate-pulse rounded-xl border border-border p-4 space-y-3">
                  <div className="flex justify-between">
                    <div className="h-4 bg-panel rounded w-36" />
                    <div className="h-4 bg-panel rounded w-24" />
                    <div className="h-4 bg-panel rounded w-20" />
                  </div>
                  <div className="h-3 bg-panel/70 rounded w-3/4" />
                  <div className="h-3 bg-panel/70 rounded w-full" />
                </div>
              ))}
            </div>
          ) : purchases.length === 0 ? (
            <div className="py-12 text-center text-sm text-textMuted">
              No purchases in {FULL_MONTH_NAMES[curMonthIdx]} {curYear}.<br />
              <button
                onClick={() => setIsModalOpen(true)}
                className="mt-3 text-gold font-semibold hover:underline"
              >
                + Record a purchase
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {purchases.map(purchase => (
                <PurchaseCard
                  key={purchase.id}
                  purchase={purchase}
                  formatDate={formatDate}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <NewPurchaseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => fetchPurchases(selectedMonthDate)}
      />
    </div>
  );
}
