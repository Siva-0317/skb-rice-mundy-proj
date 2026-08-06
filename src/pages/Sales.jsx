import { useState, useEffect, useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Trash2, ChevronDown, ChevronRight, IndianRupee, Pencil } from 'lucide-react';
import { getCustomers } from '../firebase/customers';
import { getItems } from '../firebase/items';
import { createSale, editSale, getNextBillNo, getRecentSales, getSalesByMonth } from '../firebase/sales';
import { useToast } from '../context/ToastContext';
import { AuthContext } from '../context/AuthContext';
import { CategoryContext } from '../context/CategoryContext';
import { formatDateIST, getISTTodayDateString } from '../utils/dateIST';
import AddCustomerModal from '../components/AddCustomerModal';
import InvoiceRowsTable from '../components/InvoiceRowsTable';

export default function Sales() {
  const { user } = useContext(AuthContext);
  const { categoryMap } = useContext(CategoryContext);
  const location = useLocation();
  const navigate = useNavigate();
  // Master Data
  const [customers, setCustomers] = useState([]);
  const [items, setItems] = useState([]);
  const [recentSales, setRecentSales] = useState([]);
  const [nextBillNo, setNextBillNo] = useState('');
  
  // UI State
  const [loading, setLoading] = useState(true);
  const [salesLoading, setSalesLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [recentSalesOpen, setRecentSalesOpen] = useState(true);
  const [editingSaleId, setEditingSaleId] = useState(null);
  const [editingBillNo, setEditingBillNo] = useState('');
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const { showToast } = useToast();

  const [selectedMonthDate, setSelectedMonthDate] = useState(() => {
    // "Today" here means today in IST, regardless of the viewing device's own timezone.
    const [y, m] = getISTTodayDateString().split('-').map(Number);
    return new Date(y, m - 1, 1);
  });

  // Form State
  const [customerId, setCustomerId] = useState('');
  const [date, setDate] = useState(getISTTodayDateString());
  const [advance, setAdvance] = useState('');
  const [remarks, setRemarks] = useState('');
  const [rows, setRows] = useState([
    { id: Date.now(), categoryKey: '', itemId: '', item: null, bags: '', bagKg: '', rate: '' }
  ]);
  const [rowErrors, setRowErrors] = useState({});
  const [rowWarnings, setRowWarnings] = useState({});
  const [editingOldBagsMap, setEditingOldBagsMap] = useState({});
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash');



  const fetchMonthSales = async (dateObj = selectedMonthDate) => {
    try {
      setSalesLoading(true);
      const data = await getSalesByMonth(dateObj.getFullYear(), dateObj.getMonth());
      setRecentSales(data || []);
    } catch (err) {
      console.error("Error loading monthly sales:", err);
    } finally {
      setSalesLoading(false);
    }
  };

  const loadData = async () => {
    try {
      const [initYear, initMonthIdx] = getISTTodayDateString().split('-').map(Number).map((n, i) => i === 1 ? n - 1 : n);
      const [custData, itemData, recentData, billNo] = await Promise.all([
        getCustomers(),
        getItems(),
        getSalesByMonth(initYear, initMonthIdx),
        getNextBillNo()
      ]);
      setCustomers(custData);
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

  useEffect(() => {
    if (!loading && location.state?.customerId) {
      setCustomerId(location.state.customerId);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [loading, location.state]);

  useEffect(() => {
    if (!loading) {
      fetchMonthSales(selectedMonthDate);
    }
  }, [selectedMonthDate]);

  const handleAddRow = () => {
    setRows([...rows, { id: Date.now(), categoryKey: '', itemId: '', item: null, bags: '', bagKg: '', rate: '', mrp: '', priceField: 'mrp' }]);
  };

  const handleRemoveRow = (id) => {
    if (rows.length > 1) {
      setRows(rows.filter(r => r.id !== id));
      setRowErrors(prev => { const c = { ...prev }; delete c[id]; return c; });
      setRowWarnings(prev => { const c = { ...prev }; delete c[id]; return c; });
    }
  };

  const handleRowChange = (id, field, value) => {
    if (rowErrors[id]) {
      setRowErrors(prev => { const c = { ...prev }; delete c[id]; return c; });
    }

    setRows(rows.map(row => {
      if (row.id === id) {
        const updatedRow = { ...row, [field]: value };
        
        // If item changes, auto-fill category, bagKg, rate, mrp
        if (field === 'itemId') {
          const selectedItem = items.find(i => i.id === value);
          if (selectedItem) {
            updatedRow.item = selectedItem;
            updatedRow.categoryKey = selectedItem.categoryKey || '';
            updatedRow.bagKg = selectedItem.bagKg;
            updatedRow.rate = selectedItem.rate;
            updatedRow.mrp = selectedItem.mrp !== undefined ? selectedItem.mrp : selectedItem.rate;
            updatedRow.priceField = 'mrp';
            // Also reset bags
            updatedRow.bags = '';
          } else {
            updatedRow.item = null;
            updatedRow.categoryKey = '';
            updatedRow.bagKg = '';
            updatedRow.rate = '';
            updatedRow.mrp = '';
            updatedRow.priceField = 'mrp';
          }
        }

        if (field === 'bags' || field === 'itemId') {
          const checkItemId = updatedRow.itemId;
          if (checkItemId && updatedRow.bags !== '' && !isNaN(Number(updatedRow.bags))) {
            const masterItem = items.find(i => i.id === checkItemId);
            const currentStock = masterItem ? (Number(masterItem.stock) || 0) : 0;
            const oldBags = (editingSaleId && editingOldBagsMap[checkItemId]) ? editingOldBagsMap[checkItemId] : 0;
            const effectiveAvailable = currentStock + oldBags;
            if (Number(updatedRow.bags) <= effectiveAvailable) {
              setRowWarnings(prev => {
                if (!prev[id]) return prev;
                const c = { ...prev }; delete c[id]; return c;
              });
            }
          } else {
            setRowWarnings(prev => {
              if (!prev[id]) return prev;
              const c = { ...prev }; delete c[id]; return c;
            });
          }
        }

        return updatedRow;
      }
      return row;
    }));
  };

  const handleRowBlur = (id) => {
    const row = rows.find(r => r.id === id);
    if (!row || !row.itemId || row.bags === '' || isNaN(Number(row.bags))) return;
    const masterItem = items.find(i => i.id === row.itemId);
    const currentStock = masterItem ? (Number(masterItem.stock) || 0) : 0;
    const oldBags = (editingSaleId && editingOldBagsMap[row.itemId]) ? editingOldBagsMap[row.itemId] : 0;
    const effectiveAvailable = currentStock + oldBags;

    if (Number(row.bags) > effectiveAvailable) {
      setRowWarnings(prev => ({ ...prev, [id]: `⚠ Only ${effectiveAvailable} bags in stock` }));
    } else {
      setRowWarnings(prev => {
        if (!prev[id]) return prev;
        const c = { ...prev };
        delete c[id];
        return c;
      });
    }
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
    const unitPrice = row.priceField === 'rate' ? Number(row.rate || 0) : Number(row.mrp !== undefined && row.mrp !== '' ? row.mrp : (row.rate || 0));
    const amount = (Number(row.bags) || 0) * unitPrice;
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
    
    let formattedDate = getISTTodayDateString();
    if (sale.date) {
      const d = typeof sale.date === 'string' ? new Date(sale.date) : (sale.date.toDate ? sale.date.toDate() : new Date(sale.date));
      if (!isNaN(d.getTime())) {
        formattedDate = d.toISOString().split('T')[0];
      }
    }
    setDate(formattedDate);
    setAdvance(sale.advance !== undefined ? String(sale.advance) : '');
    setRemarks(sale.remarks || '');

    const oldBagsMap = {};
    if (sale.items && Array.isArray(sale.items) && sale.items.length > 0) {
      const formRows = sale.items.map((item, idx) => {
        if (item.itemId) {
          oldBagsMap[item.itemId] = (oldBagsMap[item.itemId] || 0) + (Number(item.bags) || 0);
        }
        const masterItem = items.find(i => i.id === item.itemId) || { id: item.itemId, name: item.item, bagKg: item.bagKg, rate: item.rate, mrp: item.mrp };
        return {
          id: Date.now() + idx,
          categoryKey: item.cat || masterItem.categoryKey || '',
          itemId: item.itemId,
          item: masterItem,
          bags: String(item.bags || ''),
          bagKg: String(item.bagKg || ''),
          rate: String(item.rate || ''),
          mrp: String(item.mrp !== undefined ? item.mrp : (item.rate || '')),
          priceField: item.priceField || 'mrp',
          amount: item.amount
        };
      });
      setRows(formRows);
    } else {
      setRows([{ id: Date.now(), categoryKey: '', itemId: '', item: null, bags: '', bagKg: '', rate: '', mrp: '', priceField: 'mrp' }]);
    }

    setEditingOldBagsMap(oldBagsMap);
    setPaymentAmount('');
    setPaymentMode('Cash');
    setRowErrors({});
    setRowWarnings({});
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingSaleId(null);
    setEditingBillNo('');
    setCustomerId('');
    setDate(getISTTodayDateString());
    setAdvance('');
    setRemarks('');
    setRows([{ id: Date.now(), categoryKey: '', itemId: '', item: null, bags: '', bagKg: '', rate: '', mrp: '', priceField: 'mrp' }]);
    setEditingOldBagsMap({});
    setPaymentAmount('');
    setPaymentMode('Cash');
    setRowErrors({});
    setRowWarnings({});
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
          rate: Number(r.rate),
          mrp: Number(r.mrp !== undefined && r.mrp !== '' ? r.mrp : r.rate),
          priceField: r.priceField || 'mrp',
          amount: Number(r.amount)
        }));

      if (editingSaleId) {
        // Capture the current saleId and monthDate before any state changes
        const saleIdToEdit = editingSaleId;
        const monthDateSnapshot = selectedMonthDate;
        const billNoFallback = editingBillNo;

        const result = await editSale(saleIdToEdit, {
          customerId,
          customerName: selectedCustomer?.name || '',
          date,
          advance: numAdvance,
          remarks,
          rows: payloadRows,
          paymentAmount: Number(paymentAmount) || 0,
          paymentMode
        }, user?.uid);

        // result is { billNo } — extract as string, never access .path on it
        const updatedBillNo = (result && typeof result === 'object' && result.billNo)
          ? String(result.billNo)
          : String(billNoFallback || '');

        // Fetch refreshed data BEFORE resetting form state
        const [recentData, nextBill] = await Promise.all([
          getSalesByMonth(monthDateSnapshot.getFullYear(), monthDateSnapshot.getMonth()),
          getNextBillNo()
        ]);

        // Now batch all state resets together
        showToast(`Bill ${updatedBillNo} updated`, 'success');
        setEditingSaleId(null);
        setEditingBillNo('');
        setCustomerId('');
        setDate(getISTTodayDateString());
        setAdvance('');
        setRemarks('');
        setRows([{ id: Date.now(), categoryKey: '', itemId: '', item: null, bags: '', bagKg: '', rate: '', mrp: '', priceField: 'mrp' }]);
        setEditingOldBagsMap({});
        setPaymentAmount('');
        setPaymentMode('Cash');
        setRowErrors({});
        setRowWarnings({});
        setRecentSales(recentData || []);
        setNextBillNo(nextBill);

      } else {
        const billNo = await createSale({
          customerId,
          customerName: selectedCustomer?.name || '',
          date,
          advance: numAdvance,
          remarks,
          rows: payloadRows
        });

        showToast(`Bill ${billNo} created successfully!`, "success");
        
        // Reset Form
        setCustomerId('');
        setDate(getISTTodayDateString());
        setAdvance('');
        setRemarks('');
        setRows([{ id: Date.now(), categoryKey: '', itemId: '', item: null, bags: '', bagKg: '', rate: '', mrp: '', priceField: 'mrp' }]);
        setRowErrors({});
        setRowWarnings({});
        setEditingOldBagsMap({});

        const [recentData, nextBill] = await Promise.all([
          getSalesByMonth(selectedMonthDate.getFullYear(), selectedMonthDate.getMonth()),
          getNextBillNo()
        ]);
        setRecentSales(recentData || []);
        setNextBillNo(nextBill);
      }
    } catch (error) {
      console.error("Sale error:", error);
      if (error.code === 'INSUFFICIENT_STOCK' && error.failures) {
        const errorsMap = {};
        error.failures.forEach(f => {
          rows.forEach(r => {
            if (r.itemId === f.itemId) {
              errorsMap[r.id] = `Only ${f.available} bags available in stock`;
            }
          });
        });
        setRowErrors(errorsMap);
      } else {
        showToast(error.message || (editingSaleId ? "Failed to update sale" : "Failed to create sale"), "error");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateStr) => formatDateIST(dateStr);

  if (loading) return <div className="p-8 text-center text-textMuted">Loading...</div>;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* NEW SALE FORM */}
      <div className="w-full flex flex-col gap-6">
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
                  <option value="">Select or search customer...</option>
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
                  placeholder="DD-MM-YYYY"
                  title="DD-MM-YYYY"
                  className="w-full px-3 py-2.5 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-gold/50"
                />
              </div>
            </div>

            {/* Items Table */}
            <InvoiceRowsTable
              rows={calculatedRows}
              items={items}
              onAddRow={handleAddRow}
              onRemoveRow={handleRemoveRow}
              onRowChange={handleRowChange}
              onRowBlur={handleRowBlur}
              rowErrors={rowErrors}
              rowWarnings={rowWarnings}
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
                    placeholder="e.g. delivery to godown, lorry no."
                    className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-textDark mb-1">AMOUNT PAID NOW (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={advance}
                    onChange={(e) => setAdvance(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 text-sm"
                  />
                  <p className="text-xs text-textMuted mt-1">
                    Enter the amount the customer is paying today. If equal to or greater than the bill total, the bill is fully settled. Any excess is auto-applied to their outstanding balance.
                  </p>
                </div>
              </div>

              <div className="w-full md:w-auto bg-panel/30 p-5 rounded-xl border border-border min-w-[250px]">
                <div className="flex justify-between items-center mb-2 text-sm text-textMuted">
                  <span>Subtotal</span>
                  <span>₹{totalItemsAmount.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center mb-4 text-sm text-textMuted">
                  <span>Paid Now</span>
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

            {editingSaleId && (
              <div className="pt-6 border-t border-border space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <h3 className="font-display font-semibold text-base text-brownDark">
                    Record Payment Against This Bill (optional)
                  </h3>
                  <div className="font-bold text-debit text-base">
                    Due: ₹{finalTotal.toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-textDark mb-1">Amount Now Paid (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 text-sm"
                    />
                    <p className="text-xs text-textMuted mt-1">
                      Leave blank if no payment is being collected with this edit.
                    </p>
                  </div>
                  {Number(paymentAmount) > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-textDark mb-1">Mode <span className="text-debit">*</span></label>
                      <select
                        value={paymentMode}
                        onChange={(e) => setPaymentMode(e.target.value)}
                        required
                        className="w-full px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-gold/50 text-sm"
                      >
                        <option value="Cash">Cash</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                        <option value="UPI">UPI</option>
                        <option value="Cheque">Cheque</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            )}

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

      {/* RECENT SALES — Card Layout */}
      <div className="w-full">
        {(() => {
          const fullMonthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
          const curYear = selectedMonthDate.getFullYear();
          const curMonthIdx = selectedMonthDate.getMonth();
          const prevDate = new Date(curYear, curMonthIdx - 1, 1);
          const nextDate = new Date(curYear, curMonthIdx + 1, 1);
          // "Now" here means today in IST, regardless of the viewing device's own timezone.
          const [nowYear, nowMonthIdx] = getISTTodayDateString().split('-').map(Number).map((n, i) => i === 1 ? n - 1 : n);
          const isCurrentOrFutureMonth = (curYear > nowYear) ||
            (curYear === nowYear && curMonthIdx >= nowMonthIdx);

          return (
            <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden">
              {/* Section Header */}
              <button
                onClick={() => setRecentSalesOpen(!recentSalesOpen)}
                className="w-full p-5 border-b border-border flex justify-between items-center bg-panel/30 hover:bg-panel/50 transition-colors"
              >
                <h2 className="font-display text-lg font-semibold text-brownDark">Recent Sales</h2>
                {recentSalesOpen ? <ChevronDown className="w-5 h-5 text-textMuted" /> : <ChevronRight className="w-5 h-5 text-textMuted" />}
              </button>

              {recentSalesOpen && (
                <div>
                  {/* Monthly Toggle */}
                  <div className="flex items-center justify-between px-5 py-3.5 bg-panel/20 border-b border-border">
                    <button
                      type="button"
                      onClick={() => setSelectedMonthDate(prevDate)}
                      className="px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium bg-white border border-border hover:bg-gold/10 text-textDark transition-colors"
                    >
                      ← {fullMonthNames[prevDate.getMonth()]}
                    </button>
                    <span className="font-display font-semibold text-sm sm:text-base text-brownDark">
                      {fullMonthNames[curMonthIdx]} {curYear}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedMonthDate(nextDate)}
                      disabled={isCurrentOrFutureMonth}
                      className="px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium bg-white border border-border hover:bg-gold/10 text-textDark disabled:opacity-40 disabled:pointer-events-none transition-colors"
                    >
                      {fullMonthNames[nextDate.getMonth()]} →
                    </button>
                  </div>

                  {/* Column Headers — shown once above the cards */}
                  {!salesLoading && recentSales.length > 0 && (
                    <div className="hidden sm:grid grid-cols-[2fr_3fr_1fr_1.2fr_1.2fr] gap-x-3 px-5 pt-3 pb-1.5 text-sm uppercase tracking-wider font-semibold text-textMuted border-b border-border/50">
                      <span>Category</span>
                      <span>Item</span>
                      <span className="text-right">Bags</span>
                      <span className="text-right">MRP (₹/bag)</span>
                      <span className="text-right">Amount (₹)</span>
                    </div>
                  )}

                  {/* Cards List */}
                  <div className="divide-y divide-border/60 overflow-y-auto max-h-[700px]">
                    {salesLoading ? (
                      /* Loading skeleton */
                      <div className="p-5 space-y-3">
                        {[1, 2, 3].map(n => (
                          <div key={n} className="animate-pulse rounded-xl border border-border p-4 space-y-3">
                            <div className="flex justify-between">
                              <div className="h-4 bg-panel rounded w-32" />
                              <div className="h-4 bg-panel rounded w-24" />
                              <div className="h-4 bg-panel rounded w-20" />
                            </div>
                            <div className="h-3 bg-panel/70 rounded w-full" />
                            <div className="h-3 bg-panel/70 rounded w-3/4" />
                          </div>
                        ))}
                      </div>
                    ) : recentSales.length === 0 ? (
                      <div className="p-10 text-center text-sm text-textMuted">
                        No sales in {fullMonthNames[curMonthIdx]} {curYear}.
                      </div>
                    ) : (
                      <div className="p-4 space-y-3">
                        {recentSales.map(sale => {
                          const saleItems = sale.items && Array.isArray(sale.items) ? sale.items : [];
                          const itemsTotal = saleItems.length > 0
                            ? saleItems.reduce((sum, i) => sum + (Number(i.amount) || (Number(i.bags || 0) * Number(i.mrp ?? i.rate ?? 0))), 0)
                            : Number(sale.totalAmount || 0);
                          const adv = Number(sale.advance || 0);
                          const due = Math.max(0, itemsTotal - adv);
                          const paymentMode = sale.paymentMode || null;

                          return (
                            <div
                              key={sale.id}
                              className="rounded-xl border border-border bg-white shadow-sm hover:shadow-md hover:border-gold/30 transition-all duration-150"
                            >
                              {/* ── TOP LINE: Customer | Bill Pill | Total ── */}
                              <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2.5 border-b border-border/50">
                                <span className="font-bold text-textDark text-base truncate max-w-[35%]">
                                  {sale.customerName}
                                </span>
                                <span className="text-sm font-semibold text-textMuted bg-panel border border-border/70 px-2.5 py-0.5 rounded-full shrink-0">
                                  {sale.billNo}
                                </span>
                                <span className="font-bold text-textDark text-base shrink-0">
                                  ₹{itemsTotal.toLocaleString('en-IN')}
                                </span>
                              </div>

                              {/* ── MIDDLE: Item rows table ── */}
                              <div className="px-4 py-2 space-y-0.5">
                                {saleItems.length === 0 ? (
                                  <p className="text-sm text-textMuted italic py-1">No item details recorded.</p>
                                ) : (
                                  saleItems.map((item, idx) => {
                                    const unitMrp = Number(item.mrp ?? item.rate ?? 0);
                                    const lineAmt = Number(item.amount) || (Number(item.bags || 0) * unitMrp);
                                    const catLabel = categoryMap[item.cat || item.categoryKey] || item.cat || item.categoryKey || '—';
                                    const itemLabel = item.item || item.itemName || item.name || '—';
                                    return (
                                      <div
                                        key={idx}
                                        className="grid grid-cols-[2fr_3fr_1fr_1.2fr_1.2fr] gap-x-3 items-center py-1 text-sm"
                                      >
                                        <span className="text-textMuted truncate">{catLabel}</span>
                                        <span className="font-medium text-textDark truncate">{itemLabel}</span>
                                        <span className="text-right text-textDark tabular-nums">{Number(item.bags || 0).toLocaleString('en-IN')}</span>
                                        <span className="text-right text-textMuted tabular-nums">₹{unitMrp.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</span>
                                        <span className="text-right font-semibold text-textDark tabular-nums">₹{lineAmt.toLocaleString('en-IN')}</span>
                                      </div>
                                    );
                                  })
                                )}
                              </div>

                              {/* ── BOTTOM LINE: Date/Remarks | Payment Info | Edit ── */}
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5 border-t border-border/50 bg-panel/20 rounded-b-xl">
                                {/* Left: Date + Remarks */}
                                <div className="text-sm text-textMuted space-y-0.5 min-w-0">
                                  <div className="font-medium text-textDark">{formatDate(sale.date)}</div>
                                  {sale.remarks && (
                                    <div className="truncate max-w-[200px] italic">{sale.remarks}</div>
                                  )}
                                </div>

                                {/* Center: Payment pills */}
                                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                                  <span className="font-semibold text-credit bg-green-50 border border-green-200/70 px-2 py-0.5 rounded-full">
                                    Paid: ₹{adv.toLocaleString('en-IN')}
                                  </span>
                                  {due > 0 ? (
                                    <span className="font-semibold text-debit bg-red-50 border border-red-200/70 px-2 py-0.5 rounded-full">
                                      Due: ₹{due.toLocaleString('en-IN')}
                                    </span>
                                  ) : (
                                    <span className="font-semibold text-credit bg-green-100 border border-green-300/70 px-2 py-0.5 rounded-full">
                                      Fully Paid
                                    </span>
                                  )}
                                  {paymentMode && (
                                    <span className="text-textMuted bg-panel border border-border px-2 py-0.5 rounded-full">
                                      {paymentMode}
                                    </span>
                                  )}
                                </div>

                                {/* Right: Edit button */}
                                <button
                                  onClick={() => handleEditClick(sale)}
                                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-gold/80 hover:text-gold border border-gold/20 hover:border-gold/50 hover:bg-gold/5 rounded-lg transition-all"
                                  title="Edit Sale"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                  Edit
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
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
