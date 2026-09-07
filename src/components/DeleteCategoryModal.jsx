import { useState, useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { deleteCategory, getCategoryDeletionImpact } from '../firebase/items';
import { useToast } from '../context/ToastContext';

const fmt = (n) => new Intl.NumberFormat('en-IN').format(Number(n) || 0);

/**
 * Deleting a category takes its items with it, on the client's instruction, and
 * deliberately leaves the transactions alone.
 *
 * That split is the whole point of this dialog, so it states both halves rather
 * than a generic warning. The counts are read before anything is deleted: an
 * operator asked to confirm an irreversible cascade should see its size first —
 * particularly the bags, which is the part that genuinely disappears from the
 * business's stock figures.
 */
export default function DeleteCategoryModal({ isOpen, onClose, onSuccess, category }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [impact, setImpact] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const { showToast } = useToast();

  useEffect(() => {
    if (!isOpen || !category) return;
    setConfirmText('');
    setImpact(null);
    setLoading(true);
    getCategoryDeletionImpact(category.key)
      .then(setImpact)
      .catch(err => {
        console.error('Could not measure the category deletion:', err);
        showToast(err.message || 'Could not check what this would delete.', 'error');
        onClose();
      })
      .finally(() => setLoading(false));
    // showToast/onClose are stable enough here; re-running on them would refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, category]);

  if (!isOpen || !category) return null;

  const label = category.label || category.key;
  const canDelete = !loading && impact && confirmText.trim() === label;

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      const result = await deleteCategory(category.key);
      showToast(
        result.itemsDeleted > 0
          ? `'${label}' and ${result.itemsDeleted} item${result.itemsDeleted === 1 ? '' : 's'} deleted.`
          : `'${label}' deleted.`,
        'success'
      );
      onSuccess?.(category.key);
      onClose();
    } catch (error) {
      console.error('Error deleting category:', error);
      showToast(error.message || 'Failed to delete category.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-6 border-b border-border">
          <h2 className="text-xl font-bold text-red-600 font-display">Delete Category?</h2>
          <button onClick={onClose} disabled={isDeleting} className="text-textMuted hover:text-textDark transition-colors p-2 disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {loading && <p className="text-sm text-textMuted">Checking what this would delete...</p>}

          {impact && (
            <>
              <p className="text-sm text-textDark">
                You are about to permanently delete <span className="font-bold">{label}</span>
                {impact.itemCount > 0 && <> and the {impact.itemCount} item{impact.itemCount === 1 ? '' : 's'} filed under it</>}.
              </p>

              {impact.itemCount > 0 && (
                <div className="rounded-lg border border-debit/20 bg-debit/5 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-debit mt-0.5 shrink-0" />
                    <div className="text-sm text-textDark">
                      <p className="font-semibold">This removes {fmt(impact.totalBags)} bags from your stock.</p>
                      <p className="text-textMuted mt-0.5">
                        Worth about ₹{fmt(impact.stockValue)}. Total Bags in Stock and every stock report will drop by that amount.
                      </p>
                    </div>
                  </div>
                  <ul className="text-xs text-textMuted list-disc pl-8 space-y-0.5 max-h-24 overflow-y-auto">
                    {impact.items.map(i => (
                      <li key={i.id}>{i.name} — {fmt(i.stock)} bags</li>
                    ))}
                  </ul>
                </div>
              )}

              {(impact.affectedSales > 0 || impact.affectedPurchases > 0) && (
                <div className="rounded-lg border border-credit/20 bg-credit/5 p-3 text-sm">
                  <p className="font-semibold text-textDark">Your transactions are kept.</p>
                  <p className="text-textMuted mt-0.5">
                    {impact.affectedSales > 0 && <>{impact.affectedSales} sale{impact.affectedSales === 1 ? '' : 's'}</>}
                    {impact.affectedSales > 0 && impact.affectedPurchases > 0 && ' and '}
                    {impact.affectedPurchases > 0 && <>{impact.affectedPurchases} purchase{impact.affectedPurchases === 1 ? '' : 's'}</>}
                    {' '}reference these items. Those bills are not deleted, and they keep showing the item name and price
                    they were written with.
                  </p>
                </div>
              )}

              <p className="text-xs text-textMuted">This cannot be undone.</p>

              <div>
                <label className="block text-xs font-medium text-textMuted uppercase tracking-wide mb-1">
                  Confirm by typing the category name
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  placeholder={label}
                  className="w-full px-3 py-2 rounded-lg border border-border text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 min-h-[44px]"
                />
                <p className="text-xs text-textMuted mt-1">Must exactly match: {label}</p>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-border bg-panel/30">
          <button onClick={onClose} disabled={isDeleting} className="px-4 py-2 rounded-lg font-medium text-sm border border-border text-textDark hover:bg-panel transition-colors disabled:opacity-50 min-h-[44px]">
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!canDelete || isDeleting}
            className="px-4 py-2 rounded-lg font-medium text-sm bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
          >
            {isDeleting ? 'Deleting...' : 'Delete Permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}
