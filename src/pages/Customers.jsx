import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Plus, ChevronRight } from 'lucide-react';
import { getCustomers } from '../firebase/customers';
import { getCustomerStatus } from '../utils/customerStatus';
import { useToast } from '../context/ToastContext';
import { formatDateIST } from '../utils/dateIST';
import AddCustomerModal from '../components/AddCustomerModal';
import RecordPaymentModal from '../components/RecordPaymentModal';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();

  const fetchCustomers = async () => {
    try {
      const data = await getCustomers();
      setCustomers(data);
    } catch (error) {
      console.error("Error fetching customers:", error);
      showToast("Failed to load customers", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (searchParams.get('action') === 'payment') {
      setIsPaymentModalOpen(true);
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('action');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleModalSuccess = () => {
    fetchCustomers();
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.mobile.includes(searchQuery)
  );

  const formatDate = (timestamp) => formatDateIST(timestamp);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
          <input 
            type="text" 
            placeholder="Search by name or mobile..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-border rounded-lg pl-10 pr-4 py-2 text-base sm:text-sm text-textDark focus:outline-none focus:ring-2 focus:ring-gold/50 shadow-sm min-h-[44px]"
          />
        </div>
        
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-2 bg-gold text-white px-4 py-2 rounded-lg hover:bg-gold/90 transition-colors font-medium text-sm shadow-sm whitespace-nowrap min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          Add Customer
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-textMuted text-sm">Loading customers...</div>
      ) : filteredCustomers.length === 0 ? (
        <div className="py-16 text-center text-textMuted text-sm">No customers found.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredCustomers.map(customer => {
            const status = getCustomerStatus(customer);
            const badgeStyle = status === 'overdue'
              ? 'bg-debit/10 text-debit border-debit/20'
              : (status === 'active' || status === 'advance')
              ? 'bg-credit/10 text-credit border-credit/20'
              : 'bg-textMuted/10 text-textMuted border-border';
            const badgeText = status === 'overdue' ? 'Overdue' : status === 'active' ? 'Active' : status === 'advance' ? 'Advance' : 'Settled';
            const balanceAmount = Number(customer.balance) || 0;
            const hasBalance = balanceAmount > 0;

            return (
              <div
                key={customer.id}
                onClick={() => navigate(`/customers/${customer.id}`)}
                className="bg-panel/40 border border-border rounded-2xl p-5 sm:p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-panel/60 hover:shadow-sm transition-all"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-display text-lg font-bold text-textDark truncate">{customer.name}</h3>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 ${badgeStyle}`}>
                      {badgeText}
                    </span>
                  </div>
                  <p className="text-sm text-textMuted mt-0.5">{customer.mobile}</p>

                  <p className={`text-2xl font-bold mt-4 ${hasBalance ? 'text-debit' : (balanceAmount < 0 ? 'text-credit' : 'text-textMuted')}`}>
                    {hasBalance ? `₹${balanceAmount.toLocaleString('en-IN')}` : (balanceAmount < 0 ? `₹${Math.abs(balanceAmount).toLocaleString('en-IN')}` : 'Settled')}
                  </p>
                  <p className="text-xs text-textMuted mt-0.5">
                    {hasBalance ? 'Outstanding balance' : (balanceAmount < 0 ? 'Advance balance' : 'No dues')}
                  </p>

                  <p className="text-[11px] text-textMuted/70 mt-2">
                    {customer.txnCount || 0} transactions · Last payment {formatDate(customer.lastPayment)}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-textMuted shrink-0" />
              </div>
            );
          })}
        </div>
      )}

      <AddCustomerModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={handleModalSuccess} 
      />

      <RecordPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onSuccess={handleModalSuccess}
        customers={customers}
      />
    </div>
  );
}
