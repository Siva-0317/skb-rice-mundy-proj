import React, { useState, useEffect, useContext } from 'react';
import { X } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { addItem, updateItem } from '../firebase/items';
import { useToast } from '../context/ToastContext';

export default function AddItemModal({ isOpen, onClose, onSuccess, categories = [], editingItem = null }) {
  const { user } = useContext(AuthContext);
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    categoryKey: '',
    bagKg: '',
    mrp: '',
    stock: ''
  });

  useEffect(() => {
    if (isOpen) {
      if (editingItem) {
        setFormData({
          name: editingItem.name || '',
          categoryKey: editingItem.categoryKey || '',
          bagKg: editingItem.bagKg || '',
          mrp: editingItem.mrp !== undefined && editingItem.mrp !== null ? editingItem.mrp : (editingItem.rate || ''),
          stock: editingItem.stock || ''
        });
      } else {
        setFormData({
          name: '',
          categoryKey: categories[0]?.key || '',
          bagKg: '',
          mrp: '',
          stock: ''
        });
      }
    }
  }, [isOpen, editingItem, categories]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numMrp = Number(formData.mrp);
    if (isNaN(numMrp) || numMrp <= 0) {
      showToast("Selling Price / MRP must be greater than 0", "error");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        name: formData.name,
        categoryKey: formData.categoryKey,
        bagKg: Number(formData.bagKg),
        mrp: numMrp,
        stock: editingItem ? editingItem.stock : Number(formData.stock),
        active: editingItem ? editingItem.active : true
      };

      if (editingItem) {
        await updateItem(editingItem.id, {
          categoryKey: payload.categoryKey,
          bagKg: payload.bagKg,
          mrp: payload.mrp
        });
        showToast("Item updated successfully.");
      } else {
        await addItem(payload);
        showToast("Item added successfully.");
      }

      if (onSuccess) {
        await onSuccess();
      }
      onClose();
    } catch (error) {
      console.error("Error saving item:", error);
      showToast("Failed to save item", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-border flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-5 border-b border-border">
          <h3 className="font-display font-semibold text-lg text-brownDark">{editingItem ? 'Edit Item' : 'Add Item'}</h3>
          <button onClick={onClose} className="text-textMuted hover:text-textDark transition-colors p-2"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-textDark mb-1">Item Name</label>
              <input
                type="text"
                required
                disabled={!!editingItem}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 disabled:bg-panel disabled:text-textMuted min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-textDark mb-1">Category</label>
              <select
                required
                value={formData.categoryKey}
                onChange={(e) => setFormData({ ...formData, categoryKey: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 bg-white min-h-[44px]"
              >
                {categories.map(cat => <option key={cat.key} value={cat.key}>{cat.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-textDark mb-1">Bag Size (kg)</label>
              <input
                type="number"
                required
                min="1"
                step="0.1"
                value={formData.bagKg}
                onChange={(e) => setFormData({ ...formData, bagKg: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-textDark mb-1">Selling Price / MRP (₹)</label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={formData.mrp}
                onChange={(e) => setFormData({ ...formData, mrp: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-textDark mb-1">Opening Stock (bags)</label>
              <input
                type="number"
                required={!editingItem}
                disabled={!!editingItem}
                min="0"
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 disabled:bg-panel disabled:text-textMuted min-h-[44px]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-8">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg font-medium text-sm text-brownDark border border-brownDark hover:bg-brownDark/5 transition-colors min-h-[44px]">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="px-4 py-2 rounded-lg font-medium text-sm bg-gold text-white hover:bg-gold/90 transition-colors disabled:opacity-70 min-h-[44px]">{isSubmitting ? 'Saving...' : 'Save Item'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
