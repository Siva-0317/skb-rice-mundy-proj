import { useState, useEffect, useContext } from 'react';
import { ChevronDown, ChevronRight, IndianRupee, Pencil } from 'lucide-react';
import { getSuppliers } from '../firebase/suppliers';
import { getCategories, getItems } from '../firebase/items';
import { createPurchase, editPurchase, getNextPurchaseBill, getRecentPurchases } from '../firebase/purchases';
import { useToast } from '../context/ToastContext';
import { AuthContext } from '../context/AuthContext';
import AddSupplierModal from '../components/AddSupplierModal';
import InvoiceRowsTable from '../components/InvoiceRowsTable';

export default function Purchase() {
  const { user } = useContext(AuthContext);
  // Master Data
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [recentPurchases, setRecentPurchases] = useState([]);
  const [nextBillNo, setNextBillNo] = useState('');
  
  // UI State
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  const [recentPurchasesOpen, setRecentPurchasesOpen] = useState(true);
  const [editingPurchaseId, setEditingPurchaseId] = useState(null);
  const [editingBillNo, setEditingBillNo] = useState('');
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const { showToast } = useToast();

  // Form State
  const [supplierId, setSupplierId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [advance, setAdvance] = useState('');
  const [remarks, setRemarks] = useState('');
  const [rows, setRows] = useState([
    { id: Date.now(), categoryKey: '', itemId: '', item: null, bags: '', bagKg: '', rate: '' }
  ]);

  const loadData = async () => {
    try {
      const [supData, catData, itemData, recentData, billNo] = await Promise.all([
        getSuppliers(),
        getCategories(),
        getItems(),
        getRecentPurchases(),
        getNextPurchaseBill()
      ]);
      setSuppliers(supData);
      setCategories(catData);
      setItems(itemData);
      setRecentPurchases(recentData);
      setNextBillNo(billNo);
    } catch (error) {
      console.error("Error loading purchase data:", error);
      showToast("Failed to load initial data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddRow = () => {
    setRows([...rows, { id: Date.now(), categoryKey: '', itemId: '', item: null, bags: '', bagKg: '', rate: '' }]);
  };

  const handleRemoveRow = (id) => {
    if (rows.length > 1) {
      setRows(rows.filter(r => r.id !== id));
    }
  };

  const handleRowChange = (id, field, value) => {
    setRows(rows.map(row => {
      if (row.id === id) {
        const updatedRow = { ...row, [field]: value };
        
        if (field === 'itemId') {
          const selectedItem = items.find(i => i.id === value);
          if (selectedItem) {
            updatedRow.item = selectedItem;
            updatedRow.bagKg = selectedItem.bagKg;
            updatedRow.rate = selectedItem.rate;
            updatedRow.bags = '';
          } else {
            updatedRow.item = null;
            updatedRow.bagKg = '';
            updatedRow.rate = '';
          }
        }
        
        if (field === 'categoryKey') {
          updatedRow.itemId = '';
          updatedRow.item = null;
          updatedRow.bagKg = '';
          updatedRow.rate = '';
          updatedRow.bags = '';
        }

        return updatedRow;
      }
      return row;
    }));
  };

  const handleSupplierAdded = (newSupplier) => {
    getSuppliers().then(data => {
      setSuppliers(data);
      setSupplierId(newSupplier.id);
    });
  };

  // Calculations
  const calculatedRows = rows.map(row => {
    const amount = (Number(row.bags) || 0) * (Number(row.rate) || 0);
    return { ...row, amount };
  });

  const totalItemsAmount = calculatedRows.reduce((sum, row) => sum + row.amount, 0);
  const numAdvance = Number(advance) || 0;
  const finalTotal = totalItemsAmount - numAdvance;
  const isValidPurchase = supplierId && calculatedRows.some(r => r.itemId && Number(r.bags) > 0);

  const handleEditClick = (purchase) => {
    setEditingPurchaseId(purchase.id);
    setEditingBillNo(purchase.billNo);
    setSupplierId(purchase.supplierId);
    
    let formattedDate = new Date().toISOString().split('T')[0];
    if (purchase.date) {
      const d = typeof purchase.date === 'string' ? new Date(purchase.date) : (purchase.date.toDate ? purchase.date.toDate() : new Date(purchase.date));
      if (!isNaN(d.getTime())) {
        formattedDate = d.toISOString().split('T')[0];
      }
    }
    setDate(formattedDate);
    setAdvance(purchase.advance !== undefined ? String(purchase.advance) : '');
    setRemarks(purchase.remarks || '');

    if (purchase.items && Array.isArray(purchase.items) && purchase.items.length > 0) {
      const formRows = purchase.items.map((item, idx) => {
        const masterItem = items.find(i => i.id === item.itemId) || { id: item.itemId, name: item.item, bagKg: item.bagKg, rate: item.rate };
        return {
          id: Date.now() + idx,
          categoryKey: item.cat || masterItem.categoryKey || '',
          itemId: item.itemId,
          item: masterItem,
          bags: String(item.bags || ''),
          bagKg: String(item.bagKg || ''),
          rate: String(item.rate || '')
        };
      });
      setRows(formRows);
    } else {
      setRows([{ id: Date.now(), categoryKey: '', itemId: '', item: null, bags: '', bagKg: '', rate: '' }]);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingPurchaseId(null);
    setEditingBillNo('');
    setSupplierId('');
    setDate(new Date().toISOString().split('T')[0]);
    setAdvance('');
    setRemarks('');
    setRows([{ id: Date.now(), categoryKey: '', itemId: '', item: null, bags: '', bagKg: '', rate: '' }]);
  };

  const handleSubmit = async () => {
    if (!isValidPurchase) return;
    if (editingPurchaseId) {
      setConfirmModalOpen(true);
      return;
    }
    await executeSave();
  };

  const executeSave = async () => {
    if (!isValidPurchase) return;
    setIsSubmitting(true);
    setConfirmModalOpen(false);
    try {
      const selectedSupplier = suppliers.find(s => s.id === supplierId);
      
      const payloadRows = calculatedRows
        .filter(r => r.itemId && Number(r.bags) > 0)
        .map(r => ({
          itemId: r.itemId,
          item: r.item?.name || r.item,
          cat: r.categoryKey,
          bags: Number(r.bags),
          bagKg: Number(r.bagKg),
          rate: Number(r.rate)
        }));

      if (editingPurchaseId) {
        await editPurchase(editingPurchaseId, {
          supplierId,
          supplierName: selectedSupplier.name,
          date,
          advance: numAdvance,
          remarks,
          rows: payloadRows
        }, user?.uid);

        showToast(`Bill ${editingBillNo} updated`, "success");
        handleCancelEdit();
      } else {
        const billNo = await createPurchase({
          supplierId,
          supplierName: selectedSupplier.name,
          date,
          advance: numAdvance,
          remarks,
          rows: payloadRows
        });

        showToast(`Bill ${billNo} created successfully!`, "success");
        
        setSupplierId('');
        setDate(new Date().toISOString().split('T')[0]);
        setAdvance('');
        setRemarks('');
        setRows([{ id: Date.now(), categoryKey: '', itemId: '', item: null, bags: '', bagKg: '', rate: '' }]);
      }
      
      await loadData();
    } catch (error) {
      console.error("Purchase error:", error);
      showToast(editingPurchaseId ? "Failed to update purchase" : "Failed to create purchase", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = typeof dateStr === 'string' ? new Date(dateStr) : new Date(dateStr.toDate());
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  if (loading) return <div className="p-8 text-center text-textMuted">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* NEW PURCHASE FORM */}
        <div className="lg:w-2/3 flex flex-col gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-5 border-b border-border flex justify-between items-center bg-panel/30">
              <div className="flex items-center gap-3">
                <h2 className="font-display text-xl font-semibold text-brownDark">
                  {editingPurchaseId ? `Editing Bill ${editingBillNo}` : 'New Purchase Invoice'}
                </h2>
                {editingPurchaseId && (
                  <button 
                    onClick={handleCancelEdit} 
                    className="text-xs text-textMuted hover:text-debit underline font-medium"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
              <span className="text-sm font-medium text-textMuted bg-white px-3 py-1 rounded-full border border-border">
                {editingPurchaseId ? `Bill: ${editingBillNo}` : `Next: ${nextBillNo}`}
              </span>
            </div>
            
            <div className="p-5 space-y-6">
              {/* Header Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="md:col-span-2">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-sm font-medium text-textDark">Supplier</label>
                    <button 
                      onClick={() => setIsAddSupplierOpen(true)}
                      className="text-xs font-medium text-gold hover:text-gold/80 transition-colors"
                    >
                      + New
                    </button>
                  </div>
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 bg-white"
                  >
                    <option value="">Select a supplier...</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.phone})</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-textDark mb-1">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-gold/50"
                  />
                </div>
              </div>

              {/* Items Table */}
              <InvoiceRowsTable 
                rows={calculatedRows}
                categories={categories}
                items={items}
                onAddRow={handleAddRow}
                onRemoveRow={handleRemoveRow}
                onRowChange={handleRowChange}
              />

              {/* Totals & Actions */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pt-4 border-t border-border">
                <div className="w-full md:w-1/2 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-textDark mb-1">Remarks</label>
                    <input
                      type="text"
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder="Optional notes..."
                      className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-textDark mb-1">Advance Paid (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={advance}
                      onChange={(e) => setAdvance(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 text-sm"
                    />
                  </div>
                </div>

                <div className="w-full md:w-auto bg-panel/30 p-5 rounded-xl border border-border min-w-[250px]">
                  <div className="flex justify-between items-center mb-2 text-sm text-textMuted">
                    <span>Subtotal</span>
                    <span>₹{totalItemsAmount.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between items-center mb-4 text-sm text-textMuted">
                    <span>Advance</span>
                    <span className="text-credit">- ₹{numAdvance.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-border/60">
                    <span className="font-medium text-textDark">Total Payable</span>
                    <span className="text-2xl font-bold text-debit flex items-center">
                      <IndianRupee className="w-5 h-5 mr-0.5" />
                      {finalTotal.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end items-center gap-3 pt-4">
                {editingPurchaseId && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="px-6 py-3 rounded-xl font-medium border border-border text-textDark hover:bg-panel/30 transition-colors"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={handleSubmit}
                  disabled={!isValidPurchase || isSubmitting}
                  className="bg-gold text-white px-8 py-3 rounded-xl font-medium shadow-sm hover:bg-gold/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Saving...' : (editingPurchaseId ? 'Update Purchase' : 'Save Purchase Invoice')}
                </button>
              </div>

            </div>
          </div>
        </div>

        {/* RECENT PURCHASES */}
        <div className="lg:w-1/3">
          <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden sticky top-6">
            <button 
              onClick={() => setRecentPurchasesOpen(!recentPurchasesOpen)}
              className="w-full p-5 border-b border-border flex justify-between items-center bg-panel/30 hover:bg-panel/50 transition-colors"
            >
              <h2 className="font-display text-lg font-semibold text-brownDark">Recent Purchases</h2>
              {recentPurchasesOpen ? <ChevronDown className="w-5 h-5 text-textMuted" /> : <ChevronRight className="w-5 h-5 text-textMuted" />}
            </button>
            
            {recentPurchasesOpen && (
              <div className="divide-y divide-border overflow-y-auto max-h-[600px]">
                {recentPurchases.length === 0 ? (
                  <div className="p-8 text-center text-sm text-textMuted">No recent purchases.</div>
                ) : (
                  recentPurchases.map(purchase => (
                    <div key={purchase.id} className="p-4 hover:bg-panel/20 transition-colors">
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-medium text-textDark">{purchase.supplierName}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-textMuted bg-bg px-2 py-0.5 rounded border border-border">
                            {purchase.billNo.split('-').pop()}
                          </span>
                          <button 
                            onClick={() => handleEditClick(purchase)} 
                            className="p-1.5 text-textMuted hover:text-gold transition-colors rounded hover:bg-panel/50 inline-flex items-center justify-center"
                            title="Edit Purchase"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="text-xs text-textMuted mb-2">
                        {formatDate(purchase.date)}
                      </div>
                      <div className="flex justify-between items-end">
                        <div className="text-sm text-textMuted truncate max-w-[150px]" title={purchase.items?.map(i => i.item).join(', ')}>
                          {purchase.items?.map(i => i.item).join(', ')}
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-textMuted mb-0.5">
                            {purchase.items?.reduce((sum, i) => sum + i.bags, 0)} bags
                          </div>
                          <div className="font-semibold text-textDark">
                            ₹{purchase.totalAmount.toLocaleString('en-IN')}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <AddSupplierModal 
        isOpen={isAddSupplierOpen}
        onClose={() => setIsAddSupplierOpen(false)}
        onSuccess={handleSupplierAdded}
      />

      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-border">
            <h3 className="font-display text-lg font-semibold text-brownDark mb-2">
              Save changes to Bill {editingBillNo}?
            </h3>
            <p className="text-sm text-textMuted mb-6">
              This will adjust stock and {suppliers.find(s => s.id === supplierId)?.name || 'supplier'}'s balance accordingly.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmModalOpen(false)}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-textDark hover:bg-panel/30 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeSave}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-lg bg-gold text-white text-sm font-medium shadow-sm hover:bg-gold/90 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Updating...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
