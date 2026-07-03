import React, { useState, useEffect, useMemo } from 'react';
import { getCategories, getItems, adjustStock, updateItem } from '../firebase/items';
import { Pencil, ChevronDown, ChevronRight, X, AlertTriangle, Package, Boxes, AlertCircle, Plus } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import AddItemModal from '../components/AddItemModal';

const LOW_STOCK_THRESHOLD = 15;

export default function Inventory() {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCats, setExpandedCats] = useState({});
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [newStock, setNewStock] = useState('');
  const [newRate, setNewRate] = useState('');
  const [newMrp, setNewMrp] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { showToast } = useToast();

  const fetchData = async () => {
    try {
      const cats = await getCategories();
      const allItems = await getItems();
      
      // Deduplicate by itemId and item name before rendering
      const seenIds = new Set();
      const seenNames = new Set();
      const uniqueItems = allItems.filter(i => {
        if (seenIds.has(i.id)) return false;
        const n = (i.name || '').trim().toLowerCase();
        if (seenNames.has(n)) return false;
        seenIds.add(i.id);
        seenNames.add(n);
        return true;
      });

      const activeItems = uniqueItems.filter(i => i.active !== false); // Only active items
      
      setCategories(cats);
      setItems(activeItems);
      
      // Expand all categories by default
      const exp = {};
      cats.forEach(c => exp[c.key] = true);
      setExpandedCats(exp);
    } catch (error) {
      console.error("Error fetching inventory data:", error);
      showToast("Failed to load inventory", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleCategory = (key) => setExpandedCats(prev => ({ ...prev, [key]: !prev[key] }));

  const handleOpenModal = (item) => {
    setEditingItem(item);
    setNewStock((item.stock ?? 0).toString());
    setNewRate((item.rate ?? 0).toString());
    setNewMrp((item.mrp !== undefined ? item.mrp : (item.rate ?? 0)).toString());
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setNewStock('');
    setNewRate('');
    setNewMrp('');
  };

  const handleAdjustStock = async (e) => {
    e.preventDefault();
    if (!editingItem) return;
    
    setIsSubmitting(true);
    try {
      await updateItem(editingItem.id, {
        stock: Number(newStock),
        rate: Number(newRate),
        mrp: Number(newMrp)
      });
      showToast(`Stock & prices updated for ${editingItem.name}`, "success");
      await fetchData();
      handleCloseModal();
    } catch (error) {
      console.error("Error adjusting stock:", error);
      showToast("Failed to adjust stock or prices", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Group items with unique keys only
  const itemsByCategory = useMemo(() => {
    const grouped = {};
    const seenCatKeys = new Set();
    categories.forEach(c => {
      if (!seenCatKeys.has(c.key)) {
        seenCatKeys.add(c.key);
        grouped[c.key] = [];
      }
    });
    
    const seenItemIds = new Set();
    items.forEach(item => {
      if (seenItemIds.has(item.id)) return;
      seenItemIds.add(item.id);
      
      if (grouped[item.categoryKey]) {
        grouped[item.categoryKey].push(item);
      } else {
        grouped[item.categoryKey] = [item];
      }
    });
    return grouped;
  }, [items, categories]);

  // Summary Stats
  const totalItems = items.length;
  const totalBags = items.reduce((sum, item) => sum + (Number(item.stock) || 0), 0);
  const lowStockItemsCount = items.filter(i => i.stock < LOW_STOCK_THRESHOLD).length;

  const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  if (loading && items.length === 0) {
    return <div className="flex items-center justify-center h-full text-textMuted py-8">Loading inventory...</div>;
  }

  return (
    <div className="space-y-6">
      
      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-panel rounded-xl p-5 flex items-center shadow-sm border border-border">
          <div className="p-4 bg-white rounded-lg text-gold mr-4 shadow-sm border border-border/50">
            <Package className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-medium text-textMuted mb-1">Total Active Items</p>
            <p className="font-display text-3xl font-bold text-brownDark">{totalItems}</p>
          </div>
        </div>
        
        <div className="bg-panel rounded-xl p-5 flex items-center shadow-sm border border-border">
          <div className="p-4 bg-white rounded-lg text-brownDark mr-4 shadow-sm border border-border/50">
            <Boxes className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-medium text-textMuted mb-1">Total Bags in Stock</p>
            <p className="font-display text-3xl font-bold text-brownDark">{totalBags.toLocaleString('en-IN')}</p>
          </div>
        </div>

        <div className="bg-panel rounded-xl p-5 flex items-center shadow-sm border border-border">
          <div className="p-4 bg-white rounded-lg text-debit mr-4 shadow-sm border border-border/50">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-medium text-textMuted mb-1">Low Stock Items</p>
            <p className="font-display text-3xl font-bold text-debit">{lowStockItemsCount}</p>
          </div>
        </div>
      </div>

      {/* INVENTORY TABLE */}
      <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="p-5 border-b border-border bg-panel/30 flex justify-between items-center">
          <h2 className="font-display text-xl font-semibold text-brownDark">Current Stock</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-textMuted bg-white px-2.5 py-1 rounded-md border border-border">
              Threshold: &lt; {LOW_STOCK_THRESHOLD} bags
            </span>
            <button 
              onClick={() => setIsAddItemModalOpen(true)}
              className="flex items-center gap-2 bg-gold text-white px-4 py-2 rounded-lg hover:bg-gold/90 transition-colors font-medium text-sm shadow-sm"
            >
              <Plus className="w-4 h-4" /> Add Item
            </button>
          </div>
        </div>
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full text-left border-collapse min-w-[850px]">
            <thead className="sticky top-0 z-10 bg-panel shadow-sm">
              <tr className="uppercase text-xs text-textMuted border-b border-border">
                <th className="py-3 px-6 font-medium w-1/4">Item</th>
                <th className="py-3 px-6 font-medium text-right">Bag Size</th>
                <th className="py-3 px-6 font-medium text-right">Rate (₹)</th>
                <th className="py-3 px-6 font-medium text-right">MRP (₹)</th>
                <th className="py-3 px-6 font-medium text-right">Stock (bags)</th>
                <th className="py-3 px-6 font-medium text-right">Stock Value (₹)</th>
                <th className="py-3 px-6 font-medium text-center">Last Updated</th>
                <th className="py-3 px-6 font-medium text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => {
                const catItems = itemsByCategory[category.key] || [];
                const isExpanded = expandedCats[category.key];

                if (catItems.length === 0) return null;

                return (
                  <React.Fragment key={category.key}>
                    <tr 
                      className="bg-bg/50 border-b border-border cursor-pointer hover:bg-bg/80 transition-colors"
                      onClick={() => toggleCategory(category.key)}
                    >
                      <td colSpan="8" className="py-3 px-6">
                        <div className="flex items-center gap-2 min-h-[36px]">
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-textMuted" /> : <ChevronRight className="w-4 h-4 text-textMuted" />}
                          <span className="font-semibold text-textDark">{category.label}</span>
                          <span className="text-sm text-textMuted ml-2">({category.labelTamil})</span>
                          <span className="ml-auto text-xs bg-panel text-textMuted px-2 py-1 rounded-full">{catItems.length} items</span>
                        </div>
                      </td>
                    </tr>

                    {isExpanded && catItems.length === 0 && (
                      <tr className="border-b border-border"><td colSpan="8" className="py-4 text-center text-sm text-textMuted">No items in this category.</td></tr>
                    )}
                    {isExpanded && catItems.map(item => {
                      const isLowStock = Number(item.stock) < LOW_STOCK_THRESHOLD;
                      const effPrice = item.mrp !== undefined ? Number(item.mrp) : Number(item.rate || 0);
                      const stockVal = (Number(item.stock) || 0) * effPrice;
                      
                      return (
                        <tr 
                          key={item.id} 
                          className={`border-b border-border transition-colors ${isLowStock ? 'bg-gold/10 hover:bg-gold/20' : 'hover:bg-panel/50'}`}
                        >
                          <td className="py-3 px-6 pl-12">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-textDark">{item.name}</span>
                              {isLowStock && (
                                <span className="inline-flex items-center gap-1 bg-white px-1.5 py-0.5 rounded text-[10px] font-bold text-debit border border-debit/20 shadow-sm">
                                  <AlertTriangle className="w-3 h-3" />
                                  LOW STOCK
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-6 text-sm text-textDark text-right">{item.bagKg} kg</td>
                          <td className="py-3 px-6 text-sm text-textDark text-right font-medium">₹{Number(item.rate || 0).toLocaleString('en-IN')}</td>
                          <td className="py-3 px-6 text-sm text-textMuted text-right">₹{effPrice.toLocaleString('en-IN')}</td>
                          <td className="py-3 px-6 text-right">
                            <span className={`font-bold text-lg ${isLowStock ? 'text-debit' : 'text-textDark'}`}>
                              {item.stock}
                            </span>
                          </td>
                          <td className="py-3 px-6 text-sm font-semibold text-brownDark text-right">
                            ₹{stockVal.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-6 text-sm text-textMuted text-center">
                            {formatDate(item.updatedAt)}
                          </td>
                          <td className="py-3 px-6 text-center">
                            <button 
                              onClick={() => handleOpenModal(item)}
                              className="p-2.5 text-textMuted hover:text-gold transition-colors bg-white rounded-lg border border-transparent hover:border-gold/30 shadow-sm hover:shadow min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
                              title="Adjust Stock & Prices"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADJUST STOCK & PRICES MODAL */}
      {isModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border border-border flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-border bg-panel/30">
              <h3 className="font-display font-semibold text-lg text-brownDark">Adjust Stock & Prices</h3>
              <button onClick={handleCloseModal} className="text-textMuted hover:text-textDark transition-colors p-2 min-w-[44px] min-h-[44px] inline-flex items-center justify-center">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAdjustStock} className="p-6 max-h-[80vh] overflow-y-auto">
              <div className="mb-6 bg-white p-4 rounded-xl border border-border shadow-sm text-center">
                <p className="text-sm font-medium text-textMuted mb-1">{editingItem.name}</p>
                <p className="text-xs text-textMuted mb-2">Current System Stock</p>
                <p className="text-3xl font-display font-bold text-brownDark">{editingItem.stock} <span className="text-lg text-textMuted font-sans">bags</span></p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-textDark mb-1">New Physical Stock (bags)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={newStock}
                    onChange={(e) => setNewStock(e.target.value)}
                    className="w-full px-4 py-2.5 text-base font-medium rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 bg-panel/30 min-h-[44px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-textDark mb-1">Rate (₹)</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={newRate}
                      onChange={(e) => setNewRate(e.target.value)}
                      className="w-full px-3 py-2.5 text-base font-medium rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 bg-panel/30 min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-textDark mb-1">Selling Price / MRP (₹)</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={newMrp}
                      onChange={(e) => setNewMrp(e.target.value)}
                      className="w-full px-3 py-2.5 text-base font-medium rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 bg-panel/30 min-h-[44px]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-8">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 rounded-lg font-medium text-sm text-brownDark border border-brownDark hover:bg-brownDark/5 transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || newStock === '' || newRate === '' || newMrp === ''}
                  className="px-4 py-2 rounded-lg font-medium text-sm bg-gold text-white hover:bg-gold/90 transition-colors disabled:opacity-70 shadow-sm min-h-[44px]"
                >
                  {isSubmitting ? 'Saving...' : 'Update Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AddItemModal
        isOpen={isAddItemModalOpen}
        onClose={() => setIsAddItemModalOpen(false)}
        onSuccess={fetchData}
        categories={categories}
      />
    </div>
  );
}
