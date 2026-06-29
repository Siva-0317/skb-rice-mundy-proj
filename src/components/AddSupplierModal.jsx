import { useState } from 'react';
import { X } from 'lucide-react';
import { addSupplier } from '../firebase/suppliers';
import { useToast } from '../context/ToastContext';

export default function AddSupplierModal({ isOpen, onClose, onSuccess }) {
  const [formData, setFormData] = useState({ name: '', phone: '', openingBalance: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const id = await addSupplier(formData);
      showToast("Supplier added successfully!");
      onSuccess && onSuccess({ id, ...formData });
      onClose();
    } catch (error) {
      console.error("Error adding supplier:", error);
      showToast("Failed to add supplier", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-border flex flex-col">
        <div className="flex justify-between items-center p-5 border-b border-border">
          <h3 className="font-display font-semibold text-lg text-brownDark">Add Supplier</h3>
          <button onClick={onClose} className="text-textMuted hover:text-textDark transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-textDark mb-1">Supplier Name</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-gold/50"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-textDark mb-1">Phone Number</label>
              <input
                type="tel"
                required
                pattern="[0-9]{10}"
                title="10 digit phone number"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-gold/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-textDark mb-1">Opening Balance Owed (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.openingBalance}
                onChange={(e) => setFormData({...formData, openingBalance: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-gold/50"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-8">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg font-medium text-sm text-brownDark border border-brownDark hover:bg-brownDark/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg font-medium text-sm bg-gold text-white hover:bg-gold/90 transition-colors disabled:opacity-70"
            >
              {isSubmitting ? 'Saving...' : 'Save Supplier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
