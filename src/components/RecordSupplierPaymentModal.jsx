import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { recordSupplierPayment } from '../firebase/suppliers';
import { PAYMENT_MODES } from '../utils/constants';
import { useToast } from '../context/ToastContext';
import { getISTTodayDateString } from '../utils/dateIST';

export default function RecordSupplierPaymentModal({ isOpen, onClose, onSuccess, supplierId, supplierName, supplierBalance }) {
  const [paymentDate, setPaymentDate] = useState(() => getISTTodayDateString());
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('Cash');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setMode('Cash');
      setPaymentDate(getISTTodayDateString());
    }
  }, [isOpen, supplierId]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      showToast("Amount must be greater than 0", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      await recordSupplierPayment(supplierId, {
        amount: numAmount,
        mode,
        date: paymentDate
      });

      showToast("Payment recorded successfully", "success");
      onSuccess && onSuccess();
      onClose();
    } catch (err) {
      console.error("Error recording supplier payment:", err);
      showToast(err.message || "Failed to record payment", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-border flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-border bg-panel/30">
          <div>
            <h3 className="font-display font-semibold text-lg text-brownDark">Record Payment to Supplier</h3>
            {supplierName && <p className="text-xs text-textMuted mt-0.5">{supplierName}</p>}
          </div>
          <button onClick={onClose} className="text-textMuted hover:text-textDark transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          {/* Supplier read-only display */}
          <div className="bg-panel/50 p-4 rounded-xl border border-border">
            <p className="text-xs font-semibold uppercase tracking-wider text-textMuted mb-1">Supplier</p>
            <p className="font-bold text-textDark text-base">{supplierName || '—'}</p>
            {supplierBalance !== undefined && (
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-textMuted">Current Outstanding Balance</p>
                <p className="font-bold text-debit text-lg">₹{Number(supplierBalance || 0).toLocaleString('en-IN')}</p>
              </div>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-brownDark mb-1">
              Payment Date <span className="text-debit">*</span>
            </label>
            <input
              type="date"
              required
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 font-medium"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-brownDark mb-1">
              Amount (₹) <span className="text-debit">*</span>
            </label>
            <input
              type="number"
              min="1"
              step="any"
              required
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 font-semibold text-brownDark"
            />
          </div>

          {/* Mode */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-brownDark mb-1">
              Mode <span className="text-debit">*</span>
            </label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 font-medium"
            >
              {PAYMENT_MODES.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
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
              className="px-5 py-2 rounded-xl font-medium text-sm bg-gold text-white hover:bg-gold/90 transition-colors disabled:opacity-70 shadow-sm"
            >
              {isSubmitting ? 'Saving...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
