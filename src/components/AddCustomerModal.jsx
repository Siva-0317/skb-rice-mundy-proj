import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { addCustomer, updateCustomer } from '../firebase/customers';
import { useToast } from '../context/ToastContext';

export default function AddCustomerModal({ isOpen, onClose, onSuccess, customerToEdit = null }) {
  const [formData, setFormData] = useState({ name: '', mobile: '', openingBalance: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      if (customerToEdit) {
        setFormData({
          name: customerToEdit.name || '',
          mobile: customerToEdit.mobile || '',
          openingBalance: customerToEdit.balance || ''
        });
      } else {
        setFormData({ name: '', mobile: '', openingBalance: '' });
      }
    }
  }, [isOpen, customerToEdit]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.mobile) {
      const mobileRegex = /^[0-9\-\+\s]+$/;
      if (!mobileRegex.test(formData.mobile)) {
        showToast("Mobile number must contain only numbers, spaces, +, or -", "error");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (customerToEdit) {
        await updateCustomer(customerToEdit.id, formData);
        showToast("Customer updated successfully!");
        onSuccess && onSuccess({ id: customerToEdit.id, ...formData });
      } else {
        const id = await addCustomer(formData);
        showToast("Customer added successfully!");
        onSuccess && onSuccess({ id, ...formData });
      }
      onClose();
    } catch (error) {
      console.error("Error saving customer:", error);
      showToast(error.message || "Failed to save customer", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-border flex flex-col">
        <div className="flex justify-between items-center p-5 border-b border-border">
          <h3 className="font-display font-semibold text-lg text-brownDark">
            {customerToEdit ? 'Edit Customer' : 'Add Customer'}
          </h3>
          <button onClick={onClose} className="text-textMuted hover:text-textDark transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-textDark mb-1">Customer Name</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-border text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 min-h-[44px]"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-textDark mb-1">MOBILE NUMBER (optional)</label>
              <input
                type="tel"
                value={formData.mobile}
                onChange={(e) => setFormData({...formData, mobile: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-border text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 min-h-[44px]"
              />
            </div>

            {!customerToEdit && (
              <div>
                <label className="block text-sm font-medium text-textDark mb-1">Opening Balance (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.openingBalance}
                  onChange={(e) => setFormData({...formData, openingBalance: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg border border-border text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 min-h-[44px]"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-8">
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
              {isSubmitting ? 'Saving...' : (customerToEdit ? 'Update Customer' : 'Save Customer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
