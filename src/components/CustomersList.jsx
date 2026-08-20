import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Edit2, ChevronRight, Trash2 } from 'lucide-react';
import { getCustomers } from '../firebase/customers';
import { getCustomerStatus } from '../utils/customerStatus';
import { useToast } from '../context/ToastContext';
import { formatDateIST } from '../utils/dateIST';
import AddCustomerModal from './AddCustomerModal';
import DeleteCustomerModal from './DeleteCustomerModal';

export default function CustomersList() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState(null);
  const [customerToDelete, setCustomerToDelete] = useState(null);
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

  const handleAddClick = () => {
    setCustomerToEdit(null);
    setIsModalOpen(true);
  };

  const handleEditClick = (e, customer) => {
    e.stopPropagation(); // Prevent navigating to details
    setCustomerToEdit(customer);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (e, customer) => {
    e.stopPropagation();
    setCustomerToDelete(customer);
  };

  const handleDeleteSuccess = (deletedId) => {
    setCustomers(prev => prev.filter(c => c.id !== deletedId));
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
          onClick={handleAddClick}
          className="flex items-center justify-center gap-2 bg-gold text-white px-4 py-2 rounded-lg hover:bg-gold/90 transition-colors font-medium text-sm shadow-sm whitespace-nowrap min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          Add Customer
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full text-left border-collapse min-w-[650px]">
            <thead className="sticky top-0 z-10 bg-panel shadow-sm">
              <tr className="uppercase text-xs text-textMuted border-b border-border">
                <th className="py-3.5 px-6 font-medium">Customer Name</th>
                <th className="py-3.5 px-6 font-medium">Mobile</th>
                <th className="py-3.5 px-6 font-medium">Status</th>
                <th className="py-3.5 px-6 font-medium text-right">Balance</th>
                <th className="py-3.5 px-6 font-medium text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-textMuted text-sm">Loading customers...</td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-textMuted text-sm">No customers found.</td>
                </tr>
              ) : (
                filteredCustomers.map(customer => {
                  const status = getCustomerStatus(customer);
                  const badgeStyle = status === 'overdue'
                    ? 'bg-debit/10 text-debit border-debit/20'
                    : status === 'active'
                    ? 'bg-credit/10 text-credit border-credit/20'
                    : 'bg-textMuted/10 text-textMuted border-border';
                  const badgeText = status === 'overdue' ? 'Overdue' : status === 'active' ? 'Active' : 'Settled';
                  const balanceAmount = Number(customer.balance) || 0;
                  const hasBalance = balanceAmount > 0;

                  return (
                    <tr 
                      key={customer.id} 
                      onClick={() => navigate(`/customers/${customer.id}`)}
                      className="hover:bg-panel/50 transition-colors cursor-pointer group"
                    >
                      <td className="py-3.5 px-6 text-sm font-medium text-textDark">
                        <span className="group-hover:text-gold transition-colors font-semibold">
                          {customer.name}
                        </span>
                        <div className="text-[11px] text-textMuted font-normal mt-0.5">
                          {customer.txnCount || 0} transactions · Last payment {formatDate(customer.lastPayment)}
                        </div>
                      </td>
                      <td className="py-3.5 px-6 text-sm text-textMuted">{customer.mobile || '-'}</td>
                      <td className="py-3.5 px-6 text-sm">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${badgeStyle}`}>
                          {badgeText}
                        </span>
                      </td>
                      <td className="py-3.5 px-6 text-sm text-right">
                        <span className={`font-bold ${hasBalance ? 'text-debit' : 'text-textMuted'}`}>
                          {hasBalance ? `₹${balanceAmount.toLocaleString('en-IN')}` : 'Settled'}
                        </span>
                      </td>
                      <td className="py-3.5 px-6 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={(e) => handleEditClick(e, customer)}
                            className="p-1.5 text-textMuted hover:text-brownDark transition-colors rounded-lg hover:bg-panel"
                            title="Edit Customer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteClick(e, customer)}
                            className="p-1.5 text-textMuted hover:text-debit transition-colors rounded-lg hover:bg-red-50"
                            title="Delete Customer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddCustomerModal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setCustomerToEdit(null);
        }} 
        onSuccess={handleModalSuccess}
        customerToEdit={customerToEdit}
      />

      <DeleteCustomerModal
        isOpen={!!customerToDelete}
        onClose={() => setCustomerToDelete(null)}
        onSuccess={handleDeleteSuccess}
        customer={customerToDelete}
      />
    </div>
  );
}
