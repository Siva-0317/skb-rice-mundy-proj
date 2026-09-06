import React, { useState, useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { getSupplier } from '../firebase/suppliers';
import { recordPurchasePayment } from '../firebase/purchases';
import { useToast } from '../context/ToastContext';
import { getISTTodayDateString } from '../utils/dateIST';

export default function RecordPurchasePaymentModal({ isOpen, onClose, onSuccess, purchase }) {
  const [supplier, setSupplier] = useState(null);
  const [paymentDate, setPaymentDate] = useState(() => getISTTodayDateString());
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingSupplier, setLoadingSupplier] = useState(false);

  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen && purchase?.supplierId) {
      setPaymentAmount('');
      setPaymentMode('Cash');
      setPaymentDate(getISTTodayDateString());
      setNote('');
      
      setLoadingSupplier(true);
      getSupplier(purchase.supplierId)
        .then(data => setSupplier(data))
        .catch(err => console.error("Failed to fetch supplier:", err))
        .finally(() => setLoadingSupplier(false));
    }
  }, [isOpen, purchase]);

  if (!isOpen || !purchase) return null;

  const displayAmountPaid = purchase.amountPaid ?? 0;
  const total = Number(purchase.total || purchase.totalAmount || 0);
  const displayBalanceDue = purchase.balanceDue ?? total;

  const numAmount = Number(paymentAmount);
  const showOverpaymentWarning = numAmount > displayBalanceDue;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!numAmount || numAmount <= 0) {
      showToast("Amount must be greater than 0", "error");
      return;
    }
    // A record dated in the future corrupts period reporting and ageing. Sales and
    // customer payments already refused one; these three forms did not.
    if (paymentDate > getISTTodayDateString()) {
      showToast("Payment date cannot be in the future", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      await recordPurchasePayment(purchase.id, purchase.supplierId, {
        amount: numAmount,
        mode: paymentMode,
        date: paymentDate,
        note
      });
      showToast(`Payment of ₹${numAmount.toLocaleString('en-IN')} recorded for ${purchase.billNo}`, "success");
      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      console.error("Error recording purchase payment:", error);
      showToast(error.message || "Failed to record payment", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-border flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-5 border-b border-border">
          <h3 className="font-display font-semibold text-lg text-brownDark">Record Payment</h3>
          <button onClick={onClose} className="text-textMuted hover:text-textDark transition-colors p-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          
          {/* SUPPLIER INFO */}
          <div className="bg-panel rounded-xl p-3 flex flex-col justify-center">
            {loadingSupplier ? (
              <p className="text-sm text-textMuted text-center">Loading supplier...</p>
            ) : supplier ? (
              <p className="text-sm font-medium text-brownDark">
                {supplier.name} <span className="text-textMuted font-normal">· Balance ₹{Number(supplier.balance || 0).toLocaleString('en-IN')}</span>
              </p>
            ) : (
              <p className="text-sm font-medium text-brownDark">
                {purchase.supplierName} <span className="text-textMuted font-normal">· Balance unknown</span>
              </p>
            )}
          </div>

          {/* BILL INFO */}
          <div className="px-1">
            <p className="text-xs text-textMuted">
              <span className="font-medium text-brownDark">{purchase.billNo}</span>
              {' · '}Total ₹{total.toLocaleString('en-IN')}
              {' · '}Paid so far ₹{displayAmountPaid.toLocaleString('en-IN')}
              {' · '}Due ₹{displayBalanceDue.toLocaleString('en-IN')}
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-brownDark mb-1">Payment Date</label>
            <input
              type="date"
              required
              max={getISTTodayDateString()}
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-gold/50"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-brownDark mb-1">Amount Paid (₹)</label>
            <input
              type="number"
              required
              min="1"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 font-medium"
            />
            <p className="text-xs text-textMuted mt-1.5 ml-1">
              Balance due on this bill: ₹{displayBalanceDue.toLocaleString('en-IN')}
            </p>
            {showOverpaymentWarning && (
              <div className="mt-2 text-xs text-amber-700 bg-amber-50 p-2 rounded-lg flex gap-1.5 items-start">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  Amount exceeds balance due (₹{displayBalanceDue.toLocaleString('en-IN')}). Excess will reduce supplier's overall balance.
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-brownDark mb-1">Payment Mode</label>
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 bg-white"
            >
              <option value="Cash">Cash</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="UPI">UPI</option>
              <option value="Scan">Scan</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-brownDark mb-1">Note (optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. cheque no., transfer ref"
              className="w-full px-3 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-gold/50"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 mt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl font-medium text-sm text-brownDark border border-border hover:bg-panel transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl font-medium text-sm bg-gold text-white hover:bg-gold/90 transition-colors shadow-sm disabled:opacity-70"
            >
              {isSubmitting ? 'Saving...' : 'Save Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
