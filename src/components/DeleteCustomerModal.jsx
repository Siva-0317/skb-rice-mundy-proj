import React, { useState } from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';
import { deleteCustomer } from '../firebase/customers';
import { useToast } from '../context/ToastContext';

export default function DeleteCustomerModal({ isOpen, onClose, onSuccess, customer }) {
  const [confirmName, setConfirmName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const { showToast } = useToast();

  if (!isOpen || !customer) return null;

  const handleClose = () => {
    if (isDeleting) return;
    setConfirmName('');
    onClose();
  };

  const handleDelete = async () => {
    if (confirmName !== customer.name) return;
    setIsDeleting(true);
    try {
      await deleteCustomer(customer.id);
      showToast(`Customer ${customer.name} and all related data deleted.`, 'success');
      if (onSuccess) onSuccess(customer.id);
      handleClose();
    } catch (error) {
      console.error("Failed to delete customer:", error);
      showToast(error.message || "Failed to delete customer.", 'error');
      setIsDeleting(false);
    }
  };

  const isConfirmed = confirmName === customer.name;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-border flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-border bg-red-50/50">
          <div className="flex items-center gap-2 text-debit">
            <Trash2 className="w-5 h-5" />
            <h3 className="font-display font-semibold text-lg">Delete Customer?</h3>
          </div>
          <button 
            onClick={handleClose} 
            disabled={isDeleting}
            className="text-textMuted hover:text-textDark transition-colors p-2 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="flex gap-3 text-debit bg-red-50 p-3 rounded-xl border border-red-100">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold mb-1">You are about to permanently delete <span className="font-bold">{customer.name}</span> and all their data:</p>
              <ul className="list-disc pl-4 space-y-0.5 mt-2 opacity-90">
                <li>All ledger entries</li>
                <li>All sales records (stock will be reversed for each)</li>
                <li>Their customer profile</li>
              </ul>
              <p className="font-bold mt-2">This cannot be undone.</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-brownDark mb-1">
              Confirm by typing name
            </label>
            <input
              type="text"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              disabled={isDeleting}
              placeholder="Type customer name to confirm"
              className="w-full px-3 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-debit/50"
            />
            <p className="text-[11px] text-textMuted mt-1">
              Must exactly match: <span className="font-mono font-medium">{customer.name}</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-5 border-t border-border bg-panel/30">
          <button
            type="button"
            onClick={handleClose}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl font-medium text-sm text-brownDark border border-border hover:bg-panel transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!isConfirmed || isDeleting}
            className={`px-5 py-2 rounded-xl font-medium text-sm text-white shadow-sm transition-colors flex items-center gap-2 ${
              isConfirmed && !isDeleting
                ? 'bg-debit hover:bg-red-700'
                : 'bg-red-300 cursor-not-allowed'
            }`}
          >
            {isDeleting ? 'Deleting...' : 'Delete Permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}
