import { useState, useEffect, useContext } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, IndianRupee, Pencil } from 'lucide-react';
import { getCustomers } from '../firebase/customers';
import { getCategories, getItems } from '../firebase/items';
import { createSale, editSale, getNextBillNo, getRecentSales } from '../firebase/sales';
import { useToast } from '../context/ToastContext';
import { AuthContext } from '../context/AuthContext';
import AddCustomerModal from '../components/AddCustomerModal';
import InvoiceRowsTable from '../components/InvoiceRowsTable';

export default function Sales() {
  const { user } = useContext(AuthContext);
  // Master Data
  const [customers, setCustomers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [recentSales, setRecentSales] = useState([]);
  const [nextBillNo, setNextBillNo] = useState('');
  
  // UI State
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [recentSalesOpen, setRecentSalesOpen] = useState(true);
  const [editingSaleId, setEditingSaleId] = useState(null);
  const [editingBillNo, setEditingBillNo] = useState('');
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const { showToast } = useToast();

  // Form State
  const [customerId, setCustomerId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [advance, setAdvance] = useState('');
  const [remarks, setRemarks] = useState('');
  const [rows, setRows] = useState([
    { id: Date.now(), categoryKey: '', itemId: '', item: null, bags: '', bagKg: '', rate: '' }
  ]);

  const loadData = async () => {
    try {
      const [custData, catData, itemData, recentData, billNo] = await Promise.all([
        getCustomers(),
        getCategories(),
        getItems(),
        getRecentSales(),
        getNextBillNo()
      ]);
      setCustomers(custData);
      setCategories(catData);
      setItems(itemData);
      setRecentSales(recentData);
      setNextBillNo(billNo);
    } catch (error) {
      console.error("Error loading sales data:", error);
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
        
        // If item changes, auto-fill bagKg and rate
        if (field === 'itemId') {
          const selectedItem = items.find(i => i.id === value);
          if (selectedItem) {
            updatedRow.item = selectedItem;
            updatedRow.bagKg = selectedItem.bagKg;
            updatedRow.rate = selectedItem.rate;
            // Also reset bags
            updatedRow.bags = '';
          } else {
            updatedRow.item = null;
            updatedRow.bagKg = '';
            updatedRow.rate = '';
          }
        }
        
        // If category changes, reset item
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

  const handleCustomerAdded = (newCustomer) => {
    // Reload customers to get the new one in the list
    getCustomers().then(data => {
      setCustomers(data);
      setCustomerId(newCustomer.id);
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
  const isValidSale = customerId && calculatedRows.some(r => r.itemId && Number(r.bags) > 0);

  const handleEditClick = (sale) => {
    setEditingSaleId(sale.id);
    setEditingBillNo(sale.billNo);
    setCustomerId(sale.customerId);
    
    let formattedDate = new Date().toISOString().split('T')[0];
    if (sale.date) {
      const d = typeof sale.date === 'string' ? new Date(sale.date) : (sale.date.toDate ? sale.date.toDate() : new Date(sale.date));
      if (!isNaN(d.getTime())) {
        formattedDate = d.toISOString().split('T')[0];
      }
    }
    setDate(formattedDate);
    setAdvance(sale.advance !== undefined ? String(sale.advance) : '');
    setRemarks(sale.remarks || '');

    if (sale.items && Array.isArray(sale.items) && sale.items.length > 0) {
      const formRows = sale.items.map((item, idx) => {
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
    setEditingSaleId(null);
    setEditingBillNo('');
    setCustomerId('');
    setDate(new Date().toISOString().split('T')[0]);
    setAdvance('');
    setRemarks('');
    setRows([{ id: Date.now(), categoryKey: '', itemId: '', item: null, bags: '', bagKg: '', rate: '' }]);
  };

  const handleSubmit = async () => {
    if (!isValidSale) return;
    if (editingSaleId) {
      setConfirmModalOpen(true);
      return;
    }
    await executeSave();
  };

  const executeSave = async () => {
    if (!isValidSale) return;
    setIsSubmitting(true);
    setConfirmModalOpen(false);
    try {
      const selectedCustomer = customers.find(c => c.id === customerId);
      
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

      // Check stock client-side for warnings
      payloadRows.forEach(pr => {
        const masterItem = items.find(i => i.id === pr.itemId);
        if (masterItem && masterItem.stock < pr.bags) {
          showToast(`Warning: ${pr.item} stock will go below zero.`, "error");
        }
      });

      if (editingSaleId) {
        await editSale(editingSaleId, {
          customerId,
          customerName: selectedCustomer.name,
          date,
          advance: numAdvance,
          remarks,
          rows: payloadRows
        }, user?.uid);

        showToast(`Bill ${editingBillNo} updated`, "success");
        handleCancelEdit();
      } else {
        const billNo = await createSale({
          customerId,
          customerName: selectedCustomer.name,
          date,
          advance: numAdvance,
          remarks,
          rows: payloadRows
        });

        showToast(`Bill ${billNo} created successfully!`, "success");
        
        // Reset Form
        setCustomerId('');
        setDate(new Date().toISOString().split('T')[0]);
        setAdvance('');
        setRemarks('');
        setRows([{ id: Date.now(), categoryKey: '', itemId: '', item: null, bags: '', bagKg: '', rate: '' }]);
      }
      
      await loadData();
    } catch (error) {
      console.error("Sale error:", error);
      showToast(editingSaleId ? "Failed to update sale" : "Failed to create sale", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    // Handle both string dates and firestore timestamps
    const d = typeof dateStr === 'string' ? new Date(dateStr) : new Date(dateStr.toDate());
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  if (loading) return <div className="p-8 text-center text-textMuted">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* NEW SALE FORM */}
        <div className="lg:w-2/3 flex flex-col gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-5 border-b border-border flex justify-between items-center bg-panel/30">
              <div className="flex items-center gap-3">
                <h2 className="font-display text-xl font-semibold text-brownDark">
                  {editingSaleId ? `Editing Bill ${editingBillNo}` : 'New Sale Invoice'}
                </h2>
                {editingSaleId && (
                  <button 
                    onClick={handleCancelEdit} 
                    className="text-xs text-textMuted hover:text-debit underline font-medium"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
              <span className="text-sm font-medium text-textMuted bg-white px-3 py-1 rounded-full border border-border">
                {editingSaleId ? `Bill: ${editingBillNo}` : `Next: ${nextBillNo}`}
              </span>
            </div>
            
            <div className="p-5 space-y-6">
              {/* Header Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="md:col-span-2">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-sm font-medium text-textDark">Customer</label>
                    <button 
                      onClick={() => setIsAddCustomerOpen(true)}
                      className="text-xs font-medium text-gold hover:text-gold/80 transition-colors"
                    >
                      + New
                    </button>
                  </div>
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 bg-white"
                  >
                    <option value="">Select a customer...</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.mobile})</option>
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
                    <label className="block text-sm font-medium text-textDark mb-1">Advance Received (₹)</label>
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
                    <span className="font-medium text-textDark">Total Due</span>
                    <span className="text-2xl font-bold text-debit flex items-center">
                      <IndianRupee className="w-5 h-5 mr-0.5" />
                      {finalTotal.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end items-center gap-3 pt-4">
                {editingSaleId && (
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
                  disabled={!isValidSale || isSubmitting}
                  className="bg-gold text-white px-8 py-3 rounded-xl font-medium shadow-sm hover:bg-gold/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Saving...' : (editingSaleId ? 'Update Sale' : 'Save Sale Invoice')}
                </button>
              </div>

            </div>
          </div>
        </div>

        {/* RECENT SALES */}
        <div className="lg:w-1/3">
          <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden sticky top-6">
            <button 
              onClick={() => setRecentSalesOpen(!recentSalesOpen)}
              className="w-full p-5 border-b border-border flex justify-between items-center bg-panel/30 hover:bg-panel/50 transition-colors"
            >
              <h2 className="font-display text-lg font-semibold text-brownDark">Recent Sales</h2>
              {recentSalesOpen ? <ChevronDown className="w-5 h-5 text-textMuted" /> : <ChevronRight className="w-5 h-5 text-textMuted" />}
            </button>
            
            {recentSalesOpen && (
              <div className="divide-y divide-border overflow-y-auto max-h-[600px]">
                {recentSales.length === 0 ? (
                  <div className="p-8 text-center text-sm text-textMuted">No recent sales.</div>
                ) : (
                  recentSales.map(sale => (
                    <div key={sale.id} className="p-4 hover:bg-panel/20 transition-colors">
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-medium text-textDark">{sale.customerName}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-textMuted bg-bg px-2 py-0.5 rounded border border-border">
                            {sale.billNo.split('-').pop()}
                          </span>
                          <button 
                            onClick={() => handleEditClick(sale)} 
                            className="p-1.5 text-textMuted hover:text-gold transition-colors rounded hover:bg-panel/50 inline-flex items-center justify-center"
                            title="Edit Sale"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="text-xs text-textMuted mb-2">
                        {formatDate(sale.date)}
                      </div>
                      <div className="flex justify-between items-end">
                        <div className="text-sm text-textMuted truncate max-w-[150px]" title={sale.items?.map(i => i.item).join(', ')}>
                          {sale.items?.map(i => i.item).join(', ')}
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-textMuted mb-0.5">
                            {sale.items?.reduce((sum, i) => sum + i.bags, 0)} bags
                          </div>
                          <div className="font-semibold text-textDark">
                            ₹{sale.totalAmount.toLocaleString('en-IN')}
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

      <AddCustomerModal 
        isOpen={isAddCustomerOpen}
        onClose={() => setIsAddCustomerOpen(false)}
        onSuccess={handleCustomerAdded}
      />

      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-border">
            <h3 className="font-display text-lg font-semibold text-brownDark mb-2">
              Save changes to Bill {editingBillNo}?
            </h3>
            <p className="text-sm text-textMuted mb-6">
              This will adjust stock and {customers.find(c => c.id === customerId)?.name || 'customer'}'s balance accordingly.
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
