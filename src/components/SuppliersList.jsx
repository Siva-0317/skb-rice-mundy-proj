import { useState, useEffect } from 'react';
import { Search, Plus, Edit2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getSuppliers } from '../firebase/suppliers';
import { useToast } from '../context/ToastContext';
import AddSupplierModal from './AddSupplierModal';
import { useContext } from 'react';
import { CategoryContext } from '../context/CategoryContext';

export default function SuppliersList() {
  const { categoryMap } = useContext(CategoryContext);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [supplierToEdit, setSupplierToEdit] = useState(null);
  const { showToast } = useToast();

  const fetchSuppliers = async () => {
    try {
      const data = await getSuppliers();
      setSuppliers(data);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
      showToast("Failed to load suppliers", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const handleModalSuccess = () => {
    fetchSuppliers();
  };

  const handleAddClick = () => {
    setSupplierToEdit(null);
    setIsModalOpen(true);
  };

  const handleEditClick = (supplier) => {
    setSupplierToEdit(supplier);
    setIsModalOpen(true);
  };

  const filteredSuppliers = suppliers.filter(s => {
    const q = searchQuery.toLowerCase();
    const nameMatch = s.name && s.name.toLowerCase().includes(q);
    const phoneMatch = s.phone && String(s.phone).includes(q);
    const locationMatch = s.location && s.location.toLowerCase().includes(q);
    const notesMatch = s.notes && s.notes.toLowerCase().includes(q);
    const catMatch = s.categories && s.categories.toLowerCase().includes(q);
    const supplyCatMatch = s.supplyCategories && s.supplyCategories.some(sc => 
      (categoryMap[sc.categoryKey] || sc.categoryKey).toLowerCase().includes(q)
    );
    return nameMatch || phoneMatch || locationMatch || notesMatch || catMatch || supplyCatMatch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
          <input 
            type="text" 
            placeholder="Search by name, phone, location..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-border rounded-lg pl-10 pr-4 py-2 text-base sm:text-sm text-textDark focus:outline-none focus:ring-2 focus:ring-gold/50 shadow-sm min-h-[44px]"
          />
        </div>
        
        <button 
          onClick={handleAddClick}
          className="flex items-center justify-center gap-2 bg-gold text-white px-4 py-2 rounded-lg hover:bg-gold/90 transition-colors font-medium text-sm shadow-sm whitespace-nowrap min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          Add Supplier
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full text-left border-collapse min-w-[750px]">
            <thead className="sticky top-0 z-10 bg-panel shadow-sm">
              <tr className="uppercase text-xs text-textMuted border-b border-border">
                <th className="py-3.5 px-6 font-medium">Name</th>
                <th className="py-3.5 px-6 font-medium">Phone</th>
                <th className="py-3.5 px-6 font-medium">Location</th>
                <th className="py-3.5 px-6 font-medium">Supplies</th>
                <th className="py-3.5 px-6 font-medium">Notes</th>
                <th className="py-3.5 px-6 font-medium text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-textMuted text-sm">Loading suppliers...</td>
                </tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-textMuted text-sm">No suppliers found.</td>
                </tr>
              ) : (
                filteredSuppliers.map(supplier => {
                  const hasSupplyCats = supplier.supplyCategories && Array.isArray(supplier.supplyCategories) && supplier.supplyCategories.length > 0;
                  const hasOldCats = supplier.categories && supplier.categories.trim() !== '';

                  return (
                    <tr 
                      key={supplier.id} 
                      className="hover:bg-panel/50 transition-colors"
                    >
                      <td className="py-3.5 px-6 text-sm font-medium text-textDark">
                        <Link to={`/suppliers/${supplier.id}`} className="hover:text-gold transition-colors font-semibold underline-offset-2 hover:underline">
                          {supplier.name || '-'}
                        </Link>
                      </td>
                      <td className="py-3.5 px-6 text-sm text-textMuted">{supplier.phone || '-'}</td>
                      <td className="py-3.5 px-6 text-sm text-textMuted">{supplier.location || '—'}</td>
                      <td className="py-3.5 px-6 text-sm text-textDark">
                        {hasSupplyCats ? (
                          <div className="flex flex-wrap gap-1.5">
                            {supplier.supplyCategories.map((item, idx) => {
                              const label = categoryMap[item.categoryKey] || item.categoryKey;
                              return (
                                <span 
                                  key={idx} 
                                  className="px-2.5 py-0.5 bg-gold/10 text-brownDark border border-gold/20 rounded-full text-xs font-medium inline-flex items-center gap-1"
                                >
                                  <span>{label}</span>
                                  {item.typicalQtyPerMonth ? (
                                    <span className="text-textMuted text-[11px]">· ~{item.typicalQtyPerMonth}/mo</span>
                                  ) : null}
                                </span>
                              );
                            })}
                          </div>
                        ) : hasOldCats ? (
                          <span className="text-sm text-textDark">{supplier.categories}</span>
                        ) : (
                          <span className="text-textMuted">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-6 text-sm text-textMuted">
                        {supplier.notes ? (
                          <span className="line-clamp-2" title={supplier.notes}>{supplier.notes}</span>
                        ) : (
                          <span className="text-textMuted">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-6 text-center">
                        <button
                          onClick={() => handleEditClick(supplier)}
                          className="p-1.5 text-textMuted hover:text-brownDark transition-colors rounded-lg hover:bg-panel"
                          title="Edit Supplier"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddSupplierModal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setSupplierToEdit(null);
        }} 
        onSuccess={handleModalSuccess} 
        supplierToEdit={supplierToEdit}
      />
    </div>
  );
}
