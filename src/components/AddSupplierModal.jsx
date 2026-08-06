import { useState, useEffect, useContext } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { addSupplier, updateSupplier } from '../firebase/suppliers';
import { useToast } from '../context/ToastContext';
import { CategoryContext } from '../context/CategoryContext';

export default function AddSupplierModal({ isOpen, onClose, onSuccess, supplierToEdit = null }) {
  const { categories, categoryMap } = useContext(CategoryContext);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [supplyRows, setSupplyRows] = useState([
    { id: Date.now(), categoryKey: '', typicalQtyPerMonth: '' }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (!isOpen) return;
    if (supplierToEdit) {
      setName(supplierToEdit.name || '');
      setPhone(supplierToEdit.phone || '');
      setLocation(supplierToEdit.location || '');
      setNotes(supplierToEdit.notes || '');
      
      if (supplierToEdit.supplyCategories && Array.isArray(supplierToEdit.supplyCategories) && supplierToEdit.supplyCategories.length > 0) {
        setSupplyRows(
          supplierToEdit.supplyCategories.map((item, idx) => ({
            id: Date.now() + idx,
            categoryKey: item.categoryKey || '',
            typicalQtyPerMonth: item.typicalQtyPerMonth !== undefined && item.typicalQtyPerMonth !== null && item.typicalQtyPerMonth !== 0
              ? String(item.typicalQtyPerMonth)
              : ''
          }))
        );
      } else {
        setSupplyRows([{ id: Date.now(), categoryKey: '', typicalQtyPerMonth: '' }]);
      }
    } else {
      setName('');
      setPhone('');
      setLocation('');
      setNotes('');
      setSupplyRows([{ id: Date.now(), categoryKey: '', typicalQtyPerMonth: '' }]);
    }
  }, [isOpen, supplierToEdit]);

  if (!isOpen) return null;

  const handleAddRow = () => {
    setSupplyRows([...supplyRows, { id: Date.now(), categoryKey: '', typicalQtyPerMonth: '' }]);
  };

  const handleRemoveRow = (id) => {
    if (supplyRows.length > 1) {
      setSupplyRows(supplyRows.filter(r => r.id !== id));
    } else {
      setSupplyRows([{ id: Date.now(), categoryKey: '', typicalQtyPerMonth: '' }]);
    }
  };

  const handleRowChange = (id, field, value) => {
    setSupplyRows(supplyRows.map(row => {
      if (row.id === id) {
        return { ...row, [field]: value };
      }
      return row;
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const validRows = supplyRows
        .filter(r => r.categoryKey && r.categoryKey.trim() !== '')
        .map(r => ({
          categoryKey: r.categoryKey,
          typicalQtyPerMonth: r.typicalQtyPerMonth !== '' && !isNaN(Number(r.typicalQtyPerMonth))
            ? Number(r.typicalQtyPerMonth)
            : 0
        }));

      const categoriesStr = validRows.map(r => categoryMap[r.categoryKey] || r.categoryKey).join(', ');

      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        location: location.trim(),
        notes: notes.trim(),
        supplyCategories: validRows,
        categories: categoriesStr
      };

      let finalId = null;
      if (supplierToEdit) {
        await updateSupplier(supplierToEdit.id, payload);
        finalId = supplierToEdit.id;
        showToast("Supplier updated successfully!");
      } else {
        finalId = await addSupplier(payload);
        showToast("Supplier added successfully!");
      }
      
      onSuccess && onSuccess({ id: finalId, name: payload.name });
      onClose();
    } catch (error) {
      console.error("Error saving supplier:", error);
      showToast(supplierToEdit ? "Failed to update supplier" : "Failed to add supplier", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-border flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-5 border-b border-border bg-panel/30">
          <h3 className="font-display font-semibold text-lg text-brownDark">
            {supplierToEdit ? 'Edit Supplier' : 'Add Supplier'}
          </h3>
          <button onClick={onClose} className="text-textMuted hover:text-textDark transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-textDark mb-1">Supplier Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sri Murugan Traders"
                className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 text-sm"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-textDark mb-1">Phone Number *</label>
              <input
                type="tel"
                required
                pattern="[0-9]{10}"
                title="10 digit phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10 digit mobile number"
                className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-textDark mb-1">LOCATION (optional)</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Coimbatore, Salem Market, Anna Nagar Chennai"
                className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 text-sm"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-border space-y-3">
            <div className="flex justify-between items-center">
              <label className="block text-xs font-bold uppercase tracking-wider text-brownDark">
                Supply Details (Optional)
              </label>
            </div>

            <div className="space-y-2.5">
              {supplyRows.map((row) => (
                <div key={row.id} className="flex items-center gap-2 bg-panel/40 p-2.5 rounded-xl border border-border/80">
                  <div className="flex-1">
                    <select
                      value={row.categoryKey}
                      onChange={(e) => handleRowChange(row.id, 'categoryKey', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/50"
                    >
                      <option value="">Select Category...</option>
                      {categories.map(cat => (
                        <option key={cat.key} value={cat.key}>{cat.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-36">
                    <input
                      type="number"
                      min="0"
                      placeholder="Qty (bags/mo)"
                      value={row.typicalQtyPerMonth}
                      onChange={(e) => handleRowChange(row.id, 'typicalQtyPerMonth', e.target.value)}
                      className="w-full px-2.5 py-2 rounded-lg border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/50"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveRow(row.id)}
                    className="p-2 text-textMuted hover:text-debit transition-colors rounded-lg hover:bg-white"
                    title="Remove row"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleAddRow}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gold hover:text-gold/80 transition-colors pt-1"
            >
              <Plus className="w-4 h-4" />
              Add another category
            </button>
          </div>

          <div className="pt-2 border-t border-border">
            <label className="block text-sm font-medium text-textDark mb-1">Notes (Optional)</label>
            <textarea
              rows="3"
              placeholder="e.g. delivers every Tuesday, minimum order 50 bags"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 text-sm"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-border">
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
              className="px-5 py-2 rounded-lg font-medium text-sm bg-gold text-white hover:bg-gold/90 transition-colors disabled:opacity-70 shadow-sm"
            >
              {isSubmitting ? 'Saving...' : supplierToEdit ? 'Update Supplier' : 'Save Supplier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
