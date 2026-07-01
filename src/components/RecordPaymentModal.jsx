import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { recordPayment, getCustomers } from '../firebase/customers';
import { getCustomerSales } from '../firebase/sales';
import { PAYMENT_MODES } from '../utils/constants';
import { useToast } from '../context/ToastContext';

export default function RecordPaymentModal({ isOpen, onClose, onSuccess, customers = [], preselectedCustomerId = '' }) {
  const [customerList, setCustomerList] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerSales, setCustomerSales] = useState([]);
  const [linkedBillNo, setLinkedBillNo] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [paymentNote, setPaymentNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      setSelectedCustomerId(preselectedCustomerId || '');
      setPaymentAmount('');
      setPaymentMode('Cash');
      setPaymentNote('');
      setLinkedBillNo('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
      
      if (customers && customers.length > 0) {
        setCustomerList(customers);
      } else {
        getCustomers().then(data => setCustomerList(data)).catch(console.error);
      }
    }
  }, [isOpen, customers, preselectedCustomerId]);

  useEffect(() => {
    if (selectedCustomerId) {
      getCustomerSales(selectedCustomerId)
        .then(data => setCustomerSales(data))
        .catch(console.error);
    } else {
      setCustomerSales([]);
    }
  }, [selectedCustomerId]);

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

    setIsSubmitting(true);
    try {
      await recordPayment(selectedCustomerId, {
        amount: numAmount,
        mode: paymentMode,
        note: paymentNote,
        linkedBillNo: linkedBillNo || null,
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
        <div className="flex justify-between items-center p-5 border-b border-border bg-panel/30">
          <h3 className="font-display font-semibold text-lg text-brownDark">Record Payment</h3>
          <button onClick={onClose} className="text-textMuted hover:text-textDark transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          {preselectedCustomerId && selectedCustomer ? (
            <div className="bg-panel/50 p-4 rounded-lg border border-border">
              <p className="text-sm text-textMuted mb-1">Customer</p>
              <p className="font-semibold text-textDark mb-3">{selectedCustomer.name}</p>
              
              <p className="text-sm text-textMuted mb-1">Current Balance</p>
              <p className="font-bold text-debit text-xl">₹{(selectedCustomer.balance || 0).toLocaleString('en-IN')}</p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-textDark mb-1">Customer <span className="text-debit">*</span></label>
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

          <div>
            <label className="block text-sm font-medium text-textDark mb-1">BILL NO. (optional)</label>
            <select
              value={linkedBillNo}
              onChange={(e) => setLinkedBillNo(e.target.value)}
              disabled={!selectedCustomerId || customerSales.length === 0}
              className="w-full px-3 py-2 rounded-lg border border-border text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 min-h-[44px] bg-white disabled:bg-panel"
            >
              <option value="">Not linked to a bill</option>
              {customerSales.map(sale => {
                const saleDateStr = sale.date 
                  ? (typeof sale.date === 'string' ? new Date(sale.date) : (sale.date.toDate ? sale.date.toDate() : new Date(sale.date))).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                  : '';
                return (
                  <option key={sale.id} value={sale.billNo}>
                    {sale.billNo} · ₹{(sale.totalAmount || 0).toLocaleString('en-IN')} {saleDateStr ? `· ${saleDateStr}` : ''}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-textDark mb-1">Date <span className="text-debit">*</span></label>
            <input
              type="date"
              required
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 min-h-[44px]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-textDark mb-1">Amount Received (₹) <span className="text-debit">*</span></label>
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

          <div>
            <label className="block text-sm font-medium text-textDark mb-1">Payment Mode <span className="text-debit">*</span></label>
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

          <div>
            <label className="block text-sm font-medium text-textDark mb-1">Note (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Bank transfer reference / UTR"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 min-h-[44px]"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
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
