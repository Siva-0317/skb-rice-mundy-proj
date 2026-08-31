import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, X, Pencil, Trash2, Info } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { getCustomer, getCustomerLedgerPaginated, recordPayment } from '../firebase/customers';
import { editLedgerEntry, deleteLedgerEntry } from '../firebase/ledger';
import { PAYMENT_MODES } from '../utils/constants';
import { getCustomerStatus } from '../utils/customerStatus';
import { useToast } from '../context/ToastContext';
import { formatDateIST } from '../utils/dateIST';
import RecordPaymentModal from '../components/RecordPaymentModal';
import AddCustomerModal from '../components/AddCustomerModal';
import DeleteCustomerModal from '../components/DeleteCustomerModal';

export default function CustomerDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [customer, setCustomer] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ledger');

  const [currentPage, setCurrentPage] = useState(1);
  const [totalLedgerCount, setTotalLedgerCount] = useState(0);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEditCustomerModalOpen, setIsEditCustomerModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [deletingEntryId, setDeletingEntryId] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [editMode, setEditMode] = useState('');
  const [editNote, setEditNote] = useState('');

  const fetchLedgerPage = async (pageTarget = 1) => {
    try {
      const result = await getCustomerLedgerPaginated(id, { pageSize: 20, page: pageTarget });
      setLedger(result.entries);
      setTotalLedgerCount(result.totalCount);
      setCurrentPage(pageTarget);
    } catch (err) {
      console.error("Error loading ledger page:", err);
    }
  };

  const fetchCustomerData = async () => {
    try {
      const custData = await getCustomer(id);
      setCustomer(custData);

      await fetchLedgerPage(1);

      const salesQ = query(
        collection(db, "sales"), 
        where("customerId", "==", id)
      );
      const salesSnap = await getDocs(salesQ);
      const salesList = salesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      salesList.sort((a, b) => {
        const tA = a.date?.toMillis ? a.date.toMillis() : new Date(a.date || 0).getTime();
        const tB = b.date?.toMillis ? b.date.toMillis() : new Date(b.date || 0).getTime();
        return tB - tA;
      });
      setSales(salesList);
    } catch (error) {
      console.error("Error fetching details:", error);
      showToast("Failed to load customer details", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchCustomerData();
  }, [id]);

  const handleOpenEditPayment = (entry) => {
    if (ledger[0]?.id !== entry.id) {
      showToast("Only the most recent payment can be edited", "error");
      return;
    }
    setEditingPayment(entry);
    setEditAmount(String(entry.credit || entry.debit || ''));
    setEditMode(entry.mode || 'Cash');
    setEditNote(entry.note || '');
    setIsEditModalOpen(true);
  };

  const handleSaveEditPayment = async (e) => {
    e.preventDefault();
    if (!editMode) {
      showToast("Please select a payment mode", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      await editLedgerEntry('customer', id, editingPayment.id, {
        amount: editAmount,
        mode: editMode,
        note: editNote
      });
      showToast("Payment updated successfully!");
      setIsEditModalOpen(false);
      setEditingPayment(null);
      await fetchCustomerData();
    } catch (error) {
      console.error("Error updating payment:", error);
      showToast(error.message || "Failed to update payment", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEntry = async (entry) => {
    try {
      setIsSubmitting(true);
      const result = await deleteLedgerEntry('customer', id, entry.id);
      showToast(`Entry deleted. Balance updated to ₹${result.newBalance.toLocaleString('en-IN')}.`, "success");
      setDeletingEntryId(null);
      setCustomer(prev => ({ ...prev, balance: result.newBalance }));
      
      if (ledger.length === 1 && currentPage > 1) {
        fetchLedgerPage(currentPage - 1);
      } else {
        fetchLedgerPage(currentPage);
      }
    } catch (error) {
      console.error("Error deleting entry:", error);
      showToast(error.message || "Failed to delete entry", "error");
      setDeletingEntryId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (timestamp) => formatDateIST(timestamp);

  const startIdx = totalLedgerCount === 0 ? 0 : (currentPage - 1) * 20 + 1;
  const endIdx = Math.min(currentPage * 20, totalLedgerCount);
  const isLastPage = endIdx >= totalLedgerCount || ledger.length < 20;

  if (loading) {
    return <div className="flex items-center justify-center h-full text-textMuted">Loading...</div>;
  }

  if (!customer) {
    return <div className="text-center py-10 text-textMuted">Customer not found.</div>;
  }

  const customerBalance = Number(customer.balance) || 0;

  return (
    <div className="space-y-6">
      <button 
        onClick={() => navigate('/customers')}
        className="flex items-center gap-2 text-sm font-medium text-textMuted hover:text-textDark transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Customers
      </button>

      {/* Header Card */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-border flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="font-display text-2xl font-bold text-brownDark">{customer.name}</h2>
            <button
              onClick={() => setIsEditCustomerModalOpen(true)}
              className="p-1.5 text-textMuted hover:text-gold transition-colors rounded-full hover:bg-panel"
              title="Edit Customer"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsDeleteModalOpen(true)}
              className="text-xs font-semibold text-debit hover:text-red-700 underline underline-offset-2 ml-2 transition-colors"
              title="Delete Customer"
            >
              Delete Customer
            </button>
            {(() => {
              const status = getCustomerStatus(customer);
              const badgeStyle = status === 'overdue'
                ? 'bg-debit/10 text-debit border-debit/20'
                : (status === 'active' || status === 'advance')
                ? 'bg-credit/10 text-credit border-credit/20'
                : 'bg-textMuted/10 text-textMuted border-border';
              const badgeText = status === 'overdue' ? 'Overdue' : status === 'active' ? 'Active' : status === 'advance' ? 'Advance' : 'Settled';
              return (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${badgeStyle}`}>
                  {badgeText}
                </span>
              );
            })()}
          </div>
          <p className="text-textMuted">{customer.mobile}</p>
        </div>
        
        <div className="flex flex-col md:items-end gap-3">
          <div className="text-left md:text-right">
            <p className="text-sm font-medium text-textMuted mb-1">
              {customerBalance < 0 ? 'Advance Balance' : 'Current Balance'}
            </p>
            <p className={`text-3xl font-bold ${customerBalance > 0 ? 'text-debit' : (customerBalance < 0 ? 'text-credit' : 'text-textMuted')}`}>
              ₹{Math.abs(customerBalance).toLocaleString('en-IN')}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/sales', { state: { customerId: id } })}
              className="bg-white text-gold border border-gold px-6 py-2 rounded-lg hover:bg-gold/5 transition-colors font-medium shadow-sm"
            >
              Record Sale
            </button>
            <button
              onClick={() => setIsPaymentModalOpen(true)}
              className="bg-gold text-white px-6 py-2 rounded-lg hover:bg-gold/90 transition-colors font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Record Payment
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="flex border-b border-border">
          <button 
            className={`flex-1 py-4 text-sm font-medium transition-colors ${activeTab === 'ledger' ? 'text-gold border-b-2 border-gold bg-gold/5' : 'text-textMuted hover:text-textDark hover:bg-panel/50'}`}
            onClick={() => setActiveTab('ledger')}
          >
            Ledger
          </button>
          <button 
            className={`flex-1 py-4 text-sm font-medium transition-colors ${activeTab === 'history' ? 'text-gold border-b-2 border-gold bg-gold/5' : 'text-textMuted hover:text-textDark hover:bg-panel/50'}`}
            onClick={() => setActiveTab('history')}
          >
            Purchase History
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-0">
          {activeTab === 'ledger' && (
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead className="sticky top-0 z-10 bg-panel shadow-sm">
                  <tr className="uppercase text-xs text-textMuted border-b border-border">
                    <th className="py-3 px-6 font-medium">Date</th>
                    <th className="py-3 px-6 font-medium">Description</th>
                    <th className="py-3 px-6 font-medium text-right">பற்று Debit</th>
                    <th className="py-3 px-6 font-medium text-right">வரவு Credit</th>
                    <th className="py-3 px-6 font-medium text-right">Balance</th>
                    <th className="py-3 px-6 font-medium text-center w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-8 text-center text-textMuted text-sm">No ledger entries found.</td>
                    </tr>
                  ) : (
                    ledger.map((entry, idx) => {
                      if (deletingEntryId === entry.id) {
                        const effect = (Number(entry.debit) || 0) - (Number(entry.credit) || 0);
                        const effectAmount = Math.abs(effect);
                        const amountStr = (Number(entry.debit) || 0) > 0 ? entry.debit : entry.credit;
                        return (
                          <tr key={`del-${entry.id}`} className="bg-red-50/50 border-b border-red-100">
                            <td colSpan="6" className="py-3 px-6">
                              <div className="flex items-center justify-between">
                                <div className="text-sm text-red-900">
                                  Delete this {entry.type} entry of <span className="font-bold">₹{Number(amountStr).toLocaleString('en-IN')}</span> on {formatDate(entry.date)}? 
                                  Customer balance will be adjusted by <span className="font-bold">₹{effectAmount.toLocaleString('en-IN')}</span>.
                                </div>
                                <div className="flex items-center gap-3">
                                  <button
                                    onClick={() => setDeletingEntryId(null)}
                                    disabled={isSubmitting}
                                    className="text-sm font-medium text-textMuted hover:text-textDark disabled:opacity-50 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleDeleteEntry(entry)}
                                    disabled={isSubmitting}
                                    className="text-sm font-bold text-red-600 hover:text-red-700 disabled:opacity-50 transition-colors"
                                  >
                                    {isSubmitting ? 'Deleting...' : 'Delete Entry'}
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      }
                      
                      return (
                      <tr key={entry.id} className="border-b border-border hover:bg-panel/50 transition-colors group">
                        <td className="py-3 px-6 text-sm text-textMuted">{formatDate(entry.date)}</td>
                        <td className="py-3 px-6 text-sm font-medium text-textDark">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={entry.autoGenerated ? "italic text-textMuted" : ""}>{entry.desc}</span>
                            {entry.autoGenerated && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200 uppercase">
                                auto
                              </span>
                            )}
                            {entry.type === 'payment' && !entry.autoGenerated && idx === 0 && (
                              <button
                                onClick={() => handleOpenEditPayment(entry)}
                                className="p-1 text-textMuted hover:text-gold transition-colors rounded hover:bg-panel/50 inline-flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100"
                                title="Edit Payment"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-6 text-sm text-right font-medium text-debit">
                          {Number(entry.debit) > 0 ? `₹${Number(entry.debit).toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="py-3 px-6 text-sm text-right font-medium text-credit">
                          {Number(entry.credit) > 0 ? `₹${Number(entry.credit).toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="py-3 px-6 text-sm text-right font-bold text-textDark">
                          {Number(entry.balanceAfter || 0) < 0 
                            ? `-₹${Math.abs(Number(entry.balanceAfter || 0)).toLocaleString('en-IN')}`
                            : `₹${Number(entry.balanceAfter || 0).toLocaleString('en-IN')}`
                          }
                        </td>
                        <td className="py-3 px-4 text-center">
                          {(entry.type === 'payment' || entry.type === 'opening') ? (
                            <button
                              onClick={() => setDeletingEntryId(entry.id)}
                              className="p-1.5 text-textMuted hover:text-debit transition-colors rounded hover:bg-red-50 opacity-0 group-hover:opacity-100 focus:opacity-100 inline-flex"
                              title="Delete Entry"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <div className="p-1.5 text-textMuted/50 inline-flex" title="Delete via Sales page">
                              <Info className="w-4 h-4" />
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                    })
                  )}
                </tbody>
              </table>
              <div className="flex items-center justify-between p-4 border-t border-border bg-panel/30">
                <button
                  onClick={() => fetchLedgerPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-border bg-white text-textDark hover:bg-gold/10 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                >
                  ← Newer
                </button>
                <span className="text-xs text-textMuted font-medium">
                  Showing {startIdx}–{endIdx} of {totalLedgerCount} entries
                </span>
                <button
                  onClick={() => fetchLedgerPage(currentPage + 1)}
                  disabled={isLastPage}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-border bg-white text-textDark hover:bg-gold/10 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                >
                  Older →
                </button>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead className="sticky top-0 z-10 bg-panel shadow-sm">
                  <tr className="uppercase text-xs text-textMuted border-b border-border">
                    <th className="py-3 px-6 font-medium">Date</th>
                    <th className="py-3 px-6 font-medium">Item(s)</th>
                    <th className="py-3 px-6 font-medium text-right">Qty</th>
                    <th className="py-3 px-6 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="py-8 text-center text-textMuted text-sm">No purchase history found.</td>
                    </tr>
                  ) : (
                    sales.map(sale => {
                      const itemsTotal = (sale.items && Array.isArray(sale.items))
                        ? sale.items.reduce((sum, i) => sum + (Number(i.amount) || (Number(i.bags || i.qty || 0) * Number(i.rate || 0))), 0)
                        : (Number(sale.totalAmount || 0) + Number(sale.advance || 0));
                      const adv = Number(sale.advance || 0);
                      const due = itemsTotal - adv;
                      return (
                        <tr key={sale.id} className="border-b border-border hover:bg-panel/50 transition-colors">
                          <td className="py-3 px-6 text-sm text-textMuted align-top">{formatDate(sale.date)}</td>
                          <td className="py-3 px-6 text-sm font-medium text-textDark align-top">
                            {sale.items?.map(i => i.item || i.name).join(', ') || 'N/A'}
                          </td>
                          <td className="py-3 px-6 text-sm text-right text-textMuted align-top">
                            {sale.items?.reduce((acc, curr) => acc + Number(curr.bags || curr.qty || 0), 0) || 0}
                          </td>
                          <td className="py-3 px-6 text-sm text-right align-top space-y-0.5">
                            <div className="font-bold text-textDark text-base">
                              ₹{itemsTotal.toLocaleString('en-IN')}
                            </div>
                            {adv > 0 && (
                              <div className="text-xs font-medium text-gold">
                                Adv: ₹{adv.toLocaleString('en-IN')}
                              </div>
                            )}
                            <div className={`text-xs font-semibold ${due > 0 ? 'text-debit' : 'text-credit'}`}>
                              {due > 0 ? `Due: ₹${due.toLocaleString('en-IN')}` : 'Fully Paid'}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Record Payment Modal */}
      <RecordPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onSuccess={() => fetchCustomerData()}
        customers={customer ? [customer] : []}
        preselectedCustomerId={id}
      />

      {/* Edit Customer Modal */}
      <AddCustomerModal
        isOpen={isEditCustomerModalOpen}
        onClose={() => setIsEditCustomerModalOpen(false)}
        onSuccess={() => fetchCustomerData()}
        customerToEdit={customer}
      />

      {/* Delete Customer Modal */}
      <DeleteCustomerModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onSuccess={() => navigate('/customers')}
        customer={customer}
      />

      {/* Edit Payment Modal */}
      {isEditModalOpen && editingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-border flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-border">
              <h3 className="font-display font-semibold text-lg text-brownDark">Edit Payment</h3>
              <button onClick={() => { setIsEditModalOpen(false); setEditingPayment(null); }} className="text-textMuted hover:text-textDark transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSaveEditPayment} className="p-5 overflow-y-auto space-y-4">
              <div>
                <label className="block text-sm font-medium text-textDark mb-1">Payment Mode <span className="text-debit">*</span></label>
                <select
                  required
                  value={editMode}
                  onChange={(e) => setEditMode(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 min-h-[44px] bg-white"
                >
                  <option value="">Select Mode</option>
                  {PAYMENT_MODES.map(mode => (
                    <option key={mode} value={mode}>{mode}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-textDark mb-1">Amount Paid (₹) <span className="text-debit">*</span></label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-textDark mb-1">Note (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Paid via Ramesh's account"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 min-h-[44px]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setIsEditModalOpen(false); setEditingPayment(null); }}
                  className="px-4 py-2 rounded-lg font-medium text-sm text-brownDark border border-brownDark hover:bg-brownDark/5 transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg font-medium text-sm bg-gold text-white hover:bg-gold/90 transition-colors disabled:opacity-70 min-h-[44px]"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
