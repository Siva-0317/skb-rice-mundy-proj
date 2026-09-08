import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { addCategory, updateCategory } from '../firebase/items';
import { useToast } from '../context/ToastContext';

export default function AddCategoryModal({ isOpen, onClose, onSuccess, categoryToEdit = null }) {
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    label: '',
    labelTamil: '',
    key: '',
  });

  useEffect(() => {
    if (isOpen) {
      if (categoryToEdit) {
        setFormData({
          label: categoryToEdit.label || categoryToEdit.category || '',
          labelTamil: categoryToEdit.labelTamil || '',
          key: categoryToEdit.key || categoryToEdit.categoryKey || '',
        });
      } else {
        setFormData({ label: '', labelTamil: '', key: '' });
      }
    }
  }, [isOpen, categoryToEdit]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.label.trim()) {
      showToast("Category name is required", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        label: formData.label.trim(),
        labelTamil: formData.labelTamil.trim(),
      };
      
      // Auto-generate key for new categories if missing
      if (!categoryToEdit) {
        payload.key = formData.key.trim() || formData.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
        await addCategory(payload);
        showToast("Category added successfully");
      } else {
        // Can optionally allow updating key if needed, but it's risky for existing references.
        await updateCategory(categoryToEdit.id, payload);
        showToast("Category updated successfully");
      }

      if (onSuccess) await onSuccess();
      onClose();
    } catch (error) {
      console.error("Error saving category:", error);
      showToast(error.message || "Failed to save category", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border border-border">
        <div className="flex justify-between items-center p-5 border-b border-border">
          <h3 className="font-display font-semibold text-lg text-brownDark">
            {categoryToEdit ? 'Edit Category' : 'New Category'}
          </h3>
          <button onClick={onClose} className="text-textMuted hover:text-textDark transition-colors p-2">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-textDark mb-1">Category Name</label>
            <input
              type="text"
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              placeholder="e.g. Broken Rice"
              required
              className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-gold/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-textDark mb-1">Tamil Name (optional)</label>
            <input
              type="text"
              value={formData.labelTamil}
              onChange={(e) => setFormData({ ...formData, labelTamil: e.target.value })}
              placeholder="e.g. நொய் அரிசி"
              className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-gold/50"
            />
          </div>
          
          <div className="pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-textMuted hover:text-textDark transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-gold hover:bg-gold/90 text-white text-sm font-medium rounded-lg transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center min-w-[100px]"
            >
              {isSubmitting ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
