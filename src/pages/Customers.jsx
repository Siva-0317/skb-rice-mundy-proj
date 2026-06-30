import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus } from 'lucide-react';
import { getCustomers } from '../firebase/customers';
import { getCustomerStatus } from '../utils/customerStatus';
import { useToast } from '../context/ToastContext';
import AddCustomerModal from '../components/AddCustomerModal';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();
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

  const handleModalSuccess = () => {
    fetchCustomers();
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.mobile.includes(searchQuery)
  );

  const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    return new Date(timestamp.toDate()).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  };

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

      <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead className="sticky top-0 z-10 bg-panel shadow-sm">
              <tr className="uppercase text-xs text-textMuted border-b border-border">
                <th className="py-3 px-6 font-medium">Name</th>
                <th className="py-3 px-6 font-medium">Mobile</th>
                <th className="py-3 px-6 font-medium text-right">Balance</th>
                <th className="py-3 px-6 font-medium text-center">Status</th>
                <th className="py-3 px-6 font-medium text-center">Transactions</th>
                <th className="py-3 px-6 font-medium text-center">Last Payment</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-textMuted text-sm">Loading customers...</td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-textMuted text-sm">No customers found.</td>
                </tr>
              ) : (
                filteredCustomers.map(customer => (
                  <tr 
                    key={customer.id} 
                    onClick={() => navigate(`/customers/${customer.id}`)}
                    className="border-b border-border hover:bg-panel/50 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-6 text-sm font-medium text-textDark">{customer.name}</td>
                    <td className="py-3 px-6 text-sm text-textMuted">{customer.mobile}</td>
                    <td className="py-3 px-6 text-sm text-right font-medium">
                      {customer.balance > 0 ? (
                        <span className="text-debit">₹{customer.balance.toLocaleString('en-IN')}</span>
                      ) : (
                        <span className="text-textMuted">Settled</span>
                      )}
                    </td>
                    <td className="py-3 px-6 text-center">
                      {(() => {
                        const status = getCustomerStatus(customer);
                        const badgeStyle = status === 'overdue'
                          ? 'bg-debit/10 text-debit border-debit/20'
                          : status === 'active'
                          ? 'bg-credit/10 text-credit border-credit/20'
                          : 'bg-textMuted/10 text-textMuted border-border';
                        const badgeText = status === 'overdue' ? 'Overdue' : status === 'active' ? 'Active' : 'Settled';
                        return (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${badgeStyle}`}>
                            {badgeText}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-3 px-6 text-sm text-textMuted text-center">{customer.txnCount || 0}</td>
                    <td className="py-3 px-6 text-sm text-textMuted text-center">
                      {formatDate(customer.lastPayment)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddCustomerModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={handleModalSuccess} 
      />
    </div>
  );
}
