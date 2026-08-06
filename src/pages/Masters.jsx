import { useState } from 'react';
import ItemsList from '../components/ItemsList';
import SuppliersList from '../components/SuppliersList';
import CustomersList from '../components/CustomersList';
import CategoriesList from '../components/CategoriesList';

export default function Masters() {
  const [activeTab, setActiveTab] = useState('items');

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="flex border-b border-border">
          <button 
            className={`flex-1 py-4 text-sm font-medium transition-colors ${activeTab === 'items' ? 'text-gold border-b-2 border-gold bg-gold/5' : 'text-textMuted hover:text-textDark hover:bg-panel/50'}`}
            onClick={() => setActiveTab('items')}
          >
            Item Masters
          </button>
          <button 
            className={`flex-1 py-4 text-sm font-medium transition-colors ${activeTab === 'categories' ? 'text-gold border-b-2 border-gold bg-gold/5' : 'text-textMuted hover:text-textDark hover:bg-panel/50'}`}
            onClick={() => setActiveTab('categories')}
          >
            Categories
          </button>
          <button 
            className={`flex-1 py-4 text-sm font-medium transition-colors ${activeTab === 'suppliers' ? 'text-gold border-b-2 border-gold bg-gold/5' : 'text-textMuted hover:text-textDark hover:bg-panel/50'}`}
            onClick={() => setActiveTab('suppliers')}
          >
            Suppliers
          </button>
          <button 
            className={`flex-1 py-4 text-sm font-medium transition-colors ${activeTab === 'customers' ? 'text-gold border-b-2 border-gold bg-gold/5' : 'text-textMuted hover:text-textDark hover:bg-panel/50'}`}
            onClick={() => setActiveTab('customers')}
          >
            Customers
          </button>
        </div>
      </div>

      {/* Content */}
      <div>
        {activeTab === 'items' && <ItemsList />}
        {activeTab === 'categories' && <CategoriesList />}
        {activeTab === 'suppliers' && <SuppliersList />}
        {activeTab === 'customers' && <CustomersList />}
      </div>
    </div>
  );
}
