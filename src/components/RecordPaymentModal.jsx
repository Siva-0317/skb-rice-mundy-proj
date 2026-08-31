import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { recordPayment, getCustomers } from '../firebase/customers';
import { PAYMENT_MODES } from '../utils/constants';
import { useToast } from '../context/ToastContext';
import { getISTTodayDateString } from '../utils/dateIST';

export default function RecordPaymentModal({ isOpen, onClose, onSuccess, customers = [], preselectedCustomerId = '' }) {
  const [customerList, setCustomerList] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => getISTTodayDateString());
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      setSelectedCustomerId(preselectedCustomerId || '');
      setPaymentAmount('');
      setPaymentMode('Cash');
      setPaymentDate(getISTTodayDateString());

      if (customers && customers.length > 0) {
        setCustomerList(customers);
      } else {
        getCustomers().then(data => setCustomerList(data)).catch(console.error);
      }
    }
  }, [isOpen, customers, preselectedCustomerId]);

  if (!isOpen) return null;

  const selectedCustomer = customerList.find(c => c.id === selectedCustomerId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCustomerId) {
      showToast("Please select a customer", "error");
      return;
    }
    const numAmount = Number(paymentAmount);
    if (!numAmount || numAmount <= 0) {
      showToast("Amount must be greater than 0", "error");
      return;
    }
    const todayStr = getISTTodayDateString();
    if (paymentDate > todayStr) {
      showToast("Payment date cannot be in the future", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      await recordPayment(selectedCustomerId, {
        amount: numAmount,
        mode: paymentMode,
        date: paymentDate
      });
      showToast("Payment recorded successfully!", "success");
      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      console.error("Error recording payment:", error);
      showToast(error.message || "Failed to record payment", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-border flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-border bg-panel/30">
          <h3 className="font-display font-semibold text-lg text-brownDark">Record Payment</h3>
          <button onClick={onClose} className="text-textMuted hover:text-textDark transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-5">
          {/* Customer display — read-only header when preselected, or selector */}
          {preselectedCustomerId && selectedCustomer ? (
            <div className="bg-panel/50 p-4 rounded-xl border border-border">
              <p className="text-xs font-semibold uppercase tracking-wider text-textMuted mb-1">Customer</p>
              <p className="font-bold text-textDark text-base">{selectedCustomer.name}</p>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-textMuted">Current Outstanding Balance</p>
                <p className="font-bold text-debit text-lg">₹{(selectedCustomer.balance || 0).toLocaleString('en-IN')}</p>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-textDark mb-1">
                Customer <span className="text-debit">*</span>
              </label>
              <select
                required
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 min-h-[44px] bg-white"
              >
                <option value="">Select Customer</option>
                {customerList.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.balance > 0 ? `(Due: ₹${c.balance.toLocaleString('en-IN')})` : ''}
                  </option>
                ))}
              </select>
              {selectedCustomer && (
                <div className="bg-panel/50 p-3.5 rounded-lg border border-border text-sm flex justify-between items-center mt-2">
                  <span className="text-textMuted">Current Outstanding Balance:</span>
                  <span className="font-bold text-debit text-base">₹{(selectedCustomer.balance || 0).toLocaleString('en-IN')}</span>
                </div>
              )}
            </div>
          )}

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-textDark mb-1">
              Date <span className="text-debit">*</span>
            </label>
            <input
              type="date"
              required
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 min-h-[44px]"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-textDark mb-1">
              Amount Received (₹) <span className="text-debit">*</span>
            </label>
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 rounded-lg border border-border text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 min-h-[44px]"
              autoFocus={!!preselectedCustomerId}
            />
          </div>

          {/* Mode */}
          <div>
            <label className="block text-sm font-medium text-textDark mb-1">
              Mode <span className="text-debit">*</span>
            </label>
            <select
              required
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 min-h-[44px] bg-white"
            >
              {PAYMENT_MODES.map(mode => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg font-medium text-sm text-brownDark border border-brownDark hover:bg-brownDark/5 transition-colors min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg font-medium text-sm bg-gold text-white hover:bg-gold/90 transition-colors disabled:opacity-70 min-h-[44px]"
            >
              {isSubmitting ? 'Recording...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
