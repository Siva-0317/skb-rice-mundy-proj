import React, { useContext, useState } from 'react';
import { Search, Plus, Edit2, Trash2 } from 'lucide-react';
import { CategoryContext } from '../context/CategoryContext';
import { deleteCategory } from '../firebase/items';
import { useToast } from '../context/ToastContext';
import AddCategoryModal from './AddCategoryModal';

export default function CategoriesList() {
  const { categories, loading, refreshCategories } = useContext(CategoryContext);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [categoryToEdit, setCategoryToEdit] = useState(null);
  const { showToast } = useToast();

  const handleAddClick = () => {
    setCategoryToEdit(null);
    setIsModalOpen(true);
  };

  const handleEditClick = (category) => {
    setCategoryToEdit(category);
    setIsModalOpen(true);
  };

  const handleDeleteClick = async (category) => {
    if (window.confirm(`Are you sure you want to delete category "${category.label}"?`)) {
      try {
        await deleteCategory(category.id);
        showToast("Category deleted", "success");
        refreshCategories();
      } catch (err) {
        console.error(err);
        showToast("Failed to delete category", "error");
      }
    }
  };

  const filteredCategories = categories.filter(c => 
    c.label?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.key?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
          <input 
            type="text" 
            placeholder="Search categories..." 
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
          Add Category
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full text-left border-collapse min-w-[500px]">
            <thead className="sticky top-0 z-10 bg-panel shadow-sm">
              <tr className="uppercase text-xs text-textMuted border-b border-border">
                <th className="py-3.5 px-6 font-medium">Category Name</th>
                <th className="py-3.5 px-6 font-medium">Key</th>
                <th className="py-3.5 px-6 font-medium text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan="3" className="py-8 text-center text-textMuted text-sm">Loading categories...</td>
                </tr>
              ) : filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan="3" className="py-8 text-center text-textMuted text-sm">No categories found.</td>
                </tr>
              ) : (
                filteredCategories.map(cat => (
                  <tr key={cat.id || cat.key} className="hover:bg-panel/50 transition-colors">
                    <td className="py-3.5 px-6 text-sm font-medium text-textDark">{cat.label}</td>
                    <td className="py-3.5 px-6 text-sm text-textMuted font-mono text-xs bg-panel/30 px-2 py-1 rounded inline-block mt-2 ml-4">
                      {cat.key}
                    </td>
                    <td className="py-3.5 px-6 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEditClick(cat)}
                          className="p-1.5 text-textMuted hover:text-brownDark transition-colors rounded-lg hover:bg-panel"
                          title="Edit Category"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(cat)}
                          className="p-1.5 text-textMuted hover:text-debit transition-colors rounded-lg hover:bg-panel"
                          title="Delete Category"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddCategoryModal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setCategoryToEdit(null);
        }} 
        onSuccess={refreshCategories}
        categoryToEdit={categoryToEdit}
      />
    </div>
  );
}
