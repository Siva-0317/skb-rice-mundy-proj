import React, { useState, useEffect, useMemo, useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { canEditMasters } from '../utils/permissions';
import { getCategories, getItems, setItemActive, seedIfEmpty } from '../firebase/items';
import { Pencil, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import AddItemModal from './AddItemModal';

export default function ItemsList() {
  const location = useLocation();
  const highlightItemId = location.state?.highlightItemId;
  const { user } = useContext(AuthContext);
  const isOwner = canEditMasters(user?.role);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCats, setExpandedCats] = useState({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const cats = await getCategories();
      const itms = await getItems();
      setCategories(cats);
      setItems(itms);
      
      const exp = {};
      cats.forEach(c => exp[c.key] = true);
      setExpandedCats(exp);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      await seedIfEmpty();
      await fetchData();
    };
    init();
  }, []);

  useEffect(() => {
    if (!loading && highlightItemId && items.length > 0) {
      const targetItem = items.find(i => i.id === highlightItemId);
      if (targetItem) {
        setExpandedCats(prev => ({ ...prev, [targetItem.categoryKey]: true }));
        setTimeout(() => {
          const el = document.getElementById(`item-row-${highlightItemId}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 150);
      }
    }
  }, [loading, highlightItemId, items]);

  const toggleCategory = (key) => setExpandedCats(prev => ({ ...prev, [key]: !prev[key] }));

  const handleToggleActive = async (item) => {
    try {
      await setItemActive(item.id, !item.active);
      await fetchData();
    } catch (error) {
      console.error("Error toggling active status:", error);
    }
  };

  const handleOpenModal = (item = null) => {
    setEditingItem(item);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const itemsByCategory = useMemo(() => {
    const grouped = {};
    categories.forEach(c => grouped[c.key] = []);
    items.forEach(item => {
      if (grouped[item.categoryKey]) {
        grouped[item.categoryKey].push(item);
      } else {
        grouped[item.categoryKey] = [item];
      }
    });
    return grouped;
  }, [items, categories]);

  if (loading && items.length === 0) {
    return <div className="flex items-center justify-center h-full text-textMuted py-8">Loading items...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-textDark">Item Masters</h2>
        <button 
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 bg-gold text-white px-4 py-2 rounded-lg hover:bg-gold/90 transition-colors font-medium text-sm shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add Item
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead className="sticky top-0 z-10 bg-panel shadow-sm">
            <tr className="uppercase text-xs text-textMuted border-b border-border">
              <th className="py-3 px-6 font-medium w-1/3">Item Name</th>
              <th className="py-3 px-6 font-medium text-right">Bag Size</th>
              <th className="py-3 px-6 font-medium text-right">Rate (₹)</th>
              <th className="py-3 px-6 font-medium text-right">MRP (₹)</th>
              <th className="py-3 px-6 font-medium text-right">Current Stock</th>
              <th className="py-3 px-6 font-medium text-center">Active</th>
              <th className="py-3 px-6 font-medium text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => {
              const catItems = itemsByCategory[category.key] || [];
              const isExpanded = expandedCats[category.key];

              return (
                <React.Fragment key={category.key}>
                  <tr 
                    className="bg-bg/50 border-b border-border cursor-pointer hover:bg-bg/80 transition-colors"
                    onClick={() => toggleCategory(category.key)}
                  >
                    <td colSpan="7" className="py-3 px-6">
                      <div className="flex items-center gap-2 min-h-[36px]">
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-textMuted" /> : <ChevronRight className="w-4 h-4 text-textMuted" />}
                        <span className="font-semibold text-textDark">{category.label}</span>
                        <span className="text-sm text-textMuted ml-2">({category.labelTamil})</span>
                        <span className="ml-auto text-xs bg-panel text-textMuted px-2 py-1 rounded-full">{catItems.length} items</span>
                      </div>
                    </td>
                  </tr>

                  {isExpanded && catItems.length === 0 && (
                    <tr className="border-b border-border"><td colSpan="7" className="py-4 text-center text-sm text-textMuted">No items in this category.</td></tr>
                  )}
                  {isExpanded && catItems.map(item => {
                    const isHighlighted = highlightItemId === item.id;
                    return (
                      <tr 
                        key={item.id} 
                        id={`item-row-${item.id}`}
                        className={`border-b border-border transition-all duration-500 ${isHighlighted ? 'bg-gold/30 ring-2 ring-gold' : 'hover:bg-panel/50'}`}
                      >
                        <td className="py-3 px-6 text-sm font-medium text-textDark pl-12">{item.name}</td>
                      <td className="py-3 px-6 text-sm text-textDark text-right">{item.bagKg} kg</td>
                      <td className="py-3 px-6 text-sm text-textDark text-right font-medium">₹{item.rate}</td>
                      <td className="py-3 px-6 text-sm text-textMuted text-right">₹{item.mrp !== undefined ? item.mrp : item.rate}</td>
                      <td className="py-3 px-6 text-sm text-textDark text-right">{item.stock}</td>
                      <td className="py-3 px-6 text-center">
                        <button 
                          onClick={() => handleToggleActive(item)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${item.active ? 'bg-credit' : 'bg-textMuted/40'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${item.active ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </td>
                        <td className="py-3 px-6 text-center">
                          <button onClick={() => handleOpenModal(item)} className="p-2.5 text-textMuted hover:text-gold transition-colors min-w-[44px] min-h-[44px] inline-flex items-center justify-center">
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

      <AddItemModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSuccess={fetchData}
        categories={categories}
        editingItem={editingItem}
      />
    </div>
  );
}
