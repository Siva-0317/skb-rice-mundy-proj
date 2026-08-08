import { useState, useEffect } from 'react';
import { X, Plus, Package } from 'lucide-react';
import { getSuppliers } from '../firebase/suppliers';
import { getItems, getCategories } from '../firebase/items';
import { createPurchase } from '../firebase/purchases';
import { useToast } from '../context/ToastContext';
import { getISTTodayDateString } from '../utils/dateIST';
import AddSupplierModal from './AddSupplierModal';

export default function NewPurchaseModal({ isOpen, onClose, onSuccess }) {
  const [suppliers, setSuppliers] = useState([]);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  // Form fields
  const [supplierId, setSupplierId] = useState('');
  const [categoryKey, setCategoryKey] = useState('');
  const [itemId, setItemId] = useState('');
  const [bags, setBags] = useState('');
  const [costPerBag, setCostPerBag] = useState('');
  const [date, setDate] = useState(() => getISTTodayDateString());
  const [notes, setNotes] = useState('');

  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (!isOpen) return;
    setLoadingData(true);
    Promise.all([getSuppliers(), getItems(), getCategories()])
      .then(([suppData, itemData, catsData]) => {
        setSuppliers(suppData);
        setItems(itemData.filter(i => i.active !== false));
        setCategories(catsData);
      })
      .catch(err => {
        console.error("Error loading modal data:", err);
        showToast("Failed to load suppliers or items", "error");
      })
      .finally(() => setLoadingData(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredItems = items.filter(i => !categoryKey || i.categoryKey === categoryKey);
  const totalCost = (Number(bags) || 0) * (Number(costPerBag) || 0);

  const handleCategoryChange = (key) => {
    setCategoryKey(key);
    setItemId('');
  };

  const handleItemChange = (id) => {
    setItemId(id);
    const sel = items.find(i => i.id === id);
    if (sel) {
      if (sel.categoryKey) {
        setCategoryKey(sel.categoryKey);
      }
      if (sel.rate && !costPerBag) {
        setCostPerBag(String(sel.rate));
      }
    }
  };

  const handleAddSupplierSuccess = async (newSupp) => {
    const updated = await getSuppliers();
    setSuppliers(updated);
    if (newSupp && newSupp.id) {
      setSupplierId(newSupp.id);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!supplierId) {
      showToast("Please select a supplier", "error");
      return;
    }
    if (!itemId) {
      showToast("Please select an item", "error");
      return;
    }
    if (!bags || Number(bags) <= 0) {
      showToast("Please enter valid number of bags", "error");
      return;
    }
    if (!costPerBag || Number(costPerBag) <= 0) {
      showToast("Please enter valid cost per bag", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const selSupp = suppliers.find(s => s.id === supplierId);
      const selItem = items.find(i => i.id === itemId);

      const billNo = await createPurchase({
        supplierId,
        supplierName: selSupp ? selSupp.name : '-',
        itemId,
        itemName: selItem ? selItem.name : '-',
        categoryKey: categoryKey || selItem?.categoryKey || 'raw',
        bags: Number(bags),
        costPerBag: Number(costPerBag),
        date,
        notes: notes.trim()
      });

      showToast(`Purchase recorded · ${billNo}`, "success");
      // Reset form
      setSupplierId('');
      setCategoryKey('');
      setItemId('');
      setBags('');
      setCostPerBag('');
      setNotes('');
      
      onSuccess && onSuccess();
      onClose();
    } catch (err) {
      console.error("Error recording purchase:", err);
      showToast(err.message || "Failed to record purchase", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-border flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-5 border-b border-border bg-panel/30">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-gold" />
            <h3 className="font-display font-semibold text-lg text-brownDark">New Purchase (Stock In)</h3>
          </div>
          <button onClick={onClose} className="text-textMuted hover:text-textDark transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          {/* Supplier */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-brownDark">Supplier *</label>
              <button
                type="button"
                onClick={() => setIsAddSupplierOpen(true)}
                className="text-xs text-gold hover:text-gold/80 font-medium flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Supplier
              </button>
            </div>
            <select
              required
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 font-medium"
            >
              <option value="">Select Supplier...</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.phone ? `(${s.phone})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Category */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-brownDark mb-1">Category</label>
              <select
                value={categoryKey}
                onChange={(e) => handleCategoryChange(e.target.value)}
                disabled={loadingData}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 font-medium disabled:opacity-50"
              >
                <option value="">{loadingData ? 'Loading...' : 'All Categories'}</option>
                {categories.map(c => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-brownDark mb-1">Date *</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 font-medium"
              />
            </div>
          </div>

          {/* Item */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-brownDark mb-1">Item *</label>
            <select
              required
              value={itemId}
              onChange={(e) => handleItemChange(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 font-medium"
            >
              <option value="">Select Item...</option>
              {filteredItems.map(i => (
                <option key={i.id} value={i.id}>
                  {i.name} · {i.bagKg || 26}kg bag {i.rate ? `(₹${i.rate})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Bags */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-brownDark mb-1">Number of Bags *</label>
              <input
                type="number"
                min="1"
                required
                placeholder="0"
                value={bags}
                onChange={(e) => setBags(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 font-medium"
              />
            </div>

            {/* Cost Per Bag */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-brownDark mb-1">Cost Per Bag (₹) *</label>
              <input
                type="number"
                min="1"
                required
                placeholder="0"
                value={costPerBag}
                onChange={(e) => setCostPerBag(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 font-medium"
              />
            </div>
          </div>

          {/* TOTAL COST */}
          <div className="bg-panel/60 p-4 rounded-xl border border-border/80 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-brownDark">Total Cost</span>
            <span className="font-display font-bold text-2xl text-gold">
              ₹{totalCost.toLocaleString('en-IN')}
            </span>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-brownDark mb-1">Notes (Optional)</label>
            <textarea
              rows="2"
              placeholder="e.g. lorry no., mill batch"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 text-sm"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl font-medium text-sm text-brownDark border border-border hover:bg-panel transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || loadingData}
              className="px-5 py-2.5 rounded-xl font-medium text-sm bg-gold text-white hover:bg-gold/90 transition-colors disabled:opacity-70 shadow-sm"
            >
              {isSubmitting ? 'Saving...' : 'Save Purchase'}
            </button>
          </div>
        </form>

        <AddSupplierModal
          isOpen={isAddSupplierOpen}
          onClose={() => setIsAddSupplierOpen(false)}
          onSuccess={handleAddSupplierSuccess}
        />
      </div>
    </div>
  );
}
