import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { deleteItem } from '../firebase/items';
import { useToast } from '../context/ToastContext';

export default function DeleteItemModal({ isOpen, onClose, onSuccess, item }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const { showToast } = useToast();

  if (!isOpen || !item) return null;

  const hasStock = Number(item.stock) > 0;

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await deleteItem(item.id);
      showToast(`'${item.name}' deleted.`, "success");
      onSuccess(item.id);
      onClose();
    } catch (error) {
      console.error("Error deleting item:", error);
      showToast(error.message || "Failed to delete item.", "error");
      onClose(); // Close on specific error as requested by prompt
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4 animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-6 border-b border-border">
          <h2 className="text-xl font-bold text-red-600 font-display">Delete Item?</h2>
          <button 
            onClick={onClose}
            disabled={isDeleting}
            className="text-textMuted hover:text-textDark transition-colors p-2 hover:bg-panel rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          {hasStock ? (
            <>
              <p className="text-textDark text-sm leading-relaxed">
                <span className="font-bold">'{item.name}'</span> currently has <span className="font-bold text-amber-600">{item.stock} bags</span> in stock.
                Deleting this item will permanently remove it from the system. This cannot be undone.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-amber-800">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-600" />
                <div className="text-sm">
                  <p className="font-semibold text-amber-900 mb-1">⚠ Warning</p>
                  <p>This item has {item.stock} bags in stock. Make sure stock is accounted for before deleting.</p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-textDark text-sm leading-relaxed">
              Permanently delete <span className="font-bold">'{item.name}'</span>? This cannot be undone.
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="flex-1 px-4 py-2.5 border border-border text-textDark font-medium rounded-xl hover:bg-panel transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex-1 px-4 py-2.5 bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 flex justify-center items-center"
            >
              {isDeleting ? "Deleting..." : (hasStock ? "Delete Anyway" : "Delete Item")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
