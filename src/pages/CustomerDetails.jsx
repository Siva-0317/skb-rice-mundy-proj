import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { getCustomer, getCustomerLedger, recordPayment } from '../firebase/customers';
import { useToast } from '../context/ToastContext';

export default function CustomerDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [customer, setCustomer] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ledger');

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchCustomerData = async () => {
    try {
      const custData = await getCustomer(id);
      setCustomer(custData);
      
      const ledgerData = await getCustomerLedger(id);
      setLedger(ledgerData);

      const salesQ = query(
        collection(db, "sales"), 
        where("customerId", "==", id),
        orderBy("date", "desc")
      );
      const salesSnap = await getDocs(salesQ);
      setSales(salesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
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

  const handlePayment = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await recordPayment(id, paymentAmount);
      showToast("Payment recorded successfully!");
      setIsPaymentModalOpen(false);
      setPaymentAmount('');
      await fetchCustomerData(); // refresh data
    } catch (error) {
      console.error("Error recording payment:", error);
      showToast(error.message || "Failed to record payment", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    return new Date(timestamp.toDate()).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full text-textMuted">Loading...</div>;
  }

  if (!customer) {
    return <div className="text-center py-10 text-textMuted">Customer not found.</div>;
  }

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
          <h2 className="font-display text-2xl font-bold text-brownDark mb-1">{customer.name}</h2>
          <p className="text-textMuted">{customer.mobile}</p>
        </div>
        
        <div className="flex flex-col md:items-end gap-3">
          <div className="text-left md:text-right">
            <p className="text-sm font-medium text-textMuted mb-1">Current Balance</p>
            <p className={`text-3xl font-bold ${customer.balance > 0 ? 'text-debit' : 'text-textMuted'}`}>
              ₹{customer.balance.toLocaleString('en-IN')}
            </p>
          </div>
          
          <button 
            onClick={() => setIsPaymentModalOpen(true)}
            disabled={customer.balance <= 0}
            className="bg-gold text-white px-6 py-2 rounded-lg hover:bg-gold/90 transition-colors font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Make Payment
          </button>
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
                  </tr>
                </thead>
                <tbody>
                  {ledger.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-8 text-center text-textMuted text-sm">No ledger entries found.</td>
                    </tr>
                  ) : (
                    ledger.map(entry => (
                      <tr key={entry.id} className="border-b border-border hover:bg-panel/50 transition-colors">
                        <td className="py-3 px-6 text-sm text-textMuted">{formatDate(entry.date)}</td>
                        <td className="py-3 px-6 text-sm font-medium text-textDark">{entry.desc}</td>
                        <td className="py-3 px-6 text-sm text-right font-medium text-debit">
                          {entry.debit > 0 ? `₹${entry.debit.toLocaleString('en-IN')}` : '-'}
                        </td>
                        <td className="py-3 px-6 text-sm text-right font-medium text-credit">
                          {entry.credit > 0 ? `₹${entry.credit.toLocaleString('en-IN')}` : '-'}
                        </td>
                        <td className="py-3 px-6 text-sm text-right font-bold text-textDark">
                          ₹{entry.balanceAfter.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
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
                    sales.map(sale => (
                      <tr key={sale.id} className="border-b border-border hover:bg-panel/50 transition-colors">
                        <td className="py-3 px-6 text-sm text-textMuted">{formatDate(sale.date)}</td>
                        <td className="py-3 px-6 text-sm font-medium text-textDark">
                          {sale.items?.map(i => i.name).join(', ') || 'N/A'}
                        </td>
                        <td className="py-3 px-6 text-sm text-right text-textMuted">
                          {sale.items?.reduce((acc, curr) => acc + curr.qty, 0) || 0}
                        </td>
                        <td className="py-3 px-6 text-sm text-right font-medium text-textDark">
                          ₹{sale.totalAmount?.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-border flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-border">
              <h3 className="font-display font-semibold text-lg text-brownDark">Record Payment</h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-textMuted hover:text-textDark transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handlePayment} className="p-5 overflow-y-auto">
              <div className="bg-panel/50 p-4 rounded-lg border border-border mb-6">
                <p className="text-sm text-textMuted mb-1">Customer</p>
                <p className="font-semibold text-textDark mb-3">{customer.name}</p>
                
                <p className="text-sm text-textMuted mb-1">Current Balance</p>
                <p className="font-bold text-debit text-xl">₹{customer.balance.toLocaleString('en-IN')}</p>
              </div>

               <div>
                <label className="block text-sm font-medium text-textDark mb-1">Amount Paid (₹)</label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  max={customer.balance}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 min-h-[44px]"
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 rounded-lg font-medium text-sm text-brownDark border border-brownDark hover:bg-brownDark/5 transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg font-medium text-sm bg-gold text-white hover:bg-gold/90 transition-colors disabled:opacity-70 min-h-[44px]"
                >
                  {isSubmitting ? 'Saving...' : 'Save Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
