import React, { useState } from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';
import { deletePurchase } from '../firebase/purchases';
import { useToast } from '../context/ToastContext';

export default function DeletePurchaseModal({ isOpen, onClose, onSuccess, purchase }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const { showToast } = useToast();

  if (!isOpen || !purchase) return null;

  const handleClose = () => {
    if (isDeleting) return;
    onClose();
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deletePurchase(purchase.id);
      showToast(`Purchase ${purchase.billNo || ''} deleted. Stock and supplier balance updated.`, 'success');
      if (onSuccess) onSuccess(purchase.id);
      handleClose();
    } catch (error) {
      console.error("Failed to delete purchase:", error);
      showToast(error.message || "Failed to delete purchase.", 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const bagsCount = Number(purchase.bags || 0);
  const totalCost = Number(purchase.total || purchase.totalAmount || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-border flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-border bg-red-50/50">
          <div className="flex items-center gap-2 text-debit">
            <Trash2 className="w-5 h-5" />
            <h3 className="font-display font-semibold text-lg">Delete Purchase?</h3>
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
              <p className="font-semibold mb-1">
                Permanently delete <span className="font-bold">{purchase.billNo || 'this bill'}</span> from <span className="font-bold">{purchase.supplierName}</span>?
              </p>
              <ul className="list-disc pl-4 space-y-0.5 mt-2 opacity-90">
                {bagsCount > 0 && (
                  <li>Stock of {purchase.itemName || 'item'} will be reduced by {bagsCount} bags</li>
                )}
                <li>Supplier balance will be adjusted by ₹{totalCost.toLocaleString('en-IN')}</li>
                <li>Any payments recorded against this bill will also be removed</li>
              </ul>
              <p className="font-bold mt-2">This cannot be undone.</p>
            </div>
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
            disabled={isDeleting}
            className="px-5 py-2 rounded-xl font-medium text-sm text-white bg-debit hover:bg-red-700 shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isDeleting ? 'Deleting...' : 'Delete Purchase'}
          </button>
        </div>
      </div>
    </div>
  );
}
