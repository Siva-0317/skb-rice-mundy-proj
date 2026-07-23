import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Phone } from 'lucide-react';
import { getSupplier, getSupplierLedgerPaginated } from '../firebase/suppliers';
import { getSupplierPurchases } from '../firebase/purchases';
import { useToast } from '../context/ToastContext';
import { formatDateIST } from '../utils/dateIST';
import RecordSupplierPaymentModal from '../components/RecordSupplierPaymentModal';

const CATEGORY_LABELS = {
  raw: 'Raw Rice',
  boiled: 'Boiled Rice',
  steam: 'Half Boiled Rice',
  basmathi: 'Basmathi',
  seeraga: 'Seeraga Samba'
};

export default function SupplierDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [supplier, setSupplier] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ledger');

  const [currentPage, setCurrentPage] = useState(1);
  const [totalLedgerCount, setTotalLedgerCount] = useState(0);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const fetchLedgerPage = async (pageTarget = 1) => {
    try {
      const result = await getSupplierLedgerPaginated(id, { pageSize: 20, page: pageTarget });
      setLedger(result.entries);
      setTotalLedgerCount(result.totalCount);
      setCurrentPage(pageTarget);
    } catch (err) {
      console.error("Error loading supplier ledger page:", err);
    }
  };

  const fetchSupplierData = async () => {
    try {
      setLoading(true);
      const [suppData, purchasesData] = await Promise.all([
        getSupplier(id),
        getSupplierPurchases(id)
      ]);
      setSupplier(suppData);
      setPurchases(purchasesData || []);
      await fetchLedgerPage(1);
    } catch (error) {
      console.error("Error loading supplier details:", error);
      showToast("Failed to load supplier details", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSupplierData();
  }, [id]);

  const formatDate = (dateVal) => formatDateIST(dateVal);

  const startIdx = totalLedgerCount === 0 ? 0 : (currentPage - 1) * 20 + 1;
  const endIdx = Math.min(currentPage * 20, totalLedgerCount);
  const isLastPage = endIdx >= totalLedgerCount || ledger.length < 20;

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-textMuted text-sm">Loading supplier details...</div>;
  }

  if (!supplier) {
    return (
      <div className="text-center py-20">
        <p className="text-textMuted mb-4">Supplier not found.</p>
        <button
          onClick={() => navigate('/masters')}
          className="bg-gold text-white px-4 py-2 rounded-lg font-medium text-sm"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <button 
        onClick={() => navigate('/masters')}
        className="flex items-center gap-2 text-sm font-medium text-textMuted hover:text-textDark transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Masters
      </button>

      {/* Header Card */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-border flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-brownDark mb-2">{supplier.name}</h2>
          <div className="space-y-1.5 text-sm text-textMuted">
            {supplier.phone && (
              <div className="flex items-center gap-1.5 font-medium">
                <Phone className="w-4 h-4 text-gold" />
                <span>{supplier.phone}</span>
              </div>
            )}
            {supplier.location && (
              <div className="flex items-center gap-1.5 font-medium">
                <MapPin className="w-4 h-4 text-gold" />
                <span>{supplier.location}</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex flex-col md:items-end gap-3">
          <div className="text-left md:text-right">
            <p className="text-sm font-medium text-textMuted mb-1">Balance Payable</p>
            <p className={`text-3xl font-bold ${supplier.balance > 0 ? 'text-debit' : 'text-textMuted'}`}>
              ₹{(supplier.balance || 0).toLocaleString('en-IN')}
            </p>
          </div>
          
          <button 
            onClick={() => setIsPaymentModalOpen(true)}
            disabled={(supplier.balance || 0) <= 0}
            className="bg-gold text-white px-6 py-2.5 rounded-xl hover:bg-gold/90 transition-colors font-medium text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Record Payment
          </button>
        </div>
      </div>

      {/* Tabs Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden">
        <div className="flex border-b border-border">
          <button 
            className={`flex-1 py-4 text-sm font-medium transition-colors ${activeTab === 'ledger' ? 'text-gold border-b-2 border-gold bg-gold/5 font-semibold' : 'text-textMuted hover:text-textDark hover:bg-panel/50'}`}
            onClick={() => setActiveTab('ledger')}
          >
            Ledger
          </button>
          <button 
            className={`flex-1 py-4 text-sm font-medium transition-colors ${activeTab === 'purchases' ? 'text-gold border-b-2 border-gold bg-gold/5 font-semibold' : 'text-textMuted hover:text-textDark hover:bg-panel/50'}`}
            onClick={() => setActiveTab('purchases')}
          >
            Purchase History
          </button>
        </div>

        <div className="p-0">
          {activeTab === 'ledger' && (
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead className="sticky top-0 z-10 bg-panel shadow-sm">
                  <tr className="uppercase text-xs text-textMuted border-b border-border">
                    <th className="py-3.5 px-6 font-semibold w-[18%]">Date</th>
                    <th className="py-3.5 px-6 font-semibold w-[42%]">Description</th>
                    <th className="py-3.5 px-6 font-semibold text-right w-[13%]">பற்று Debit</th>
                    <th className="py-3.5 px-6 font-semibold text-right w-[13%]">வரவு Credit</th>
                    <th className="py-3.5 px-6 font-semibold text-right w-[14%]">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ledger.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-12 text-center text-textMuted text-sm">No ledger entries found.</td>
                    </tr>
                  ) : (
                    ledger.map(entry => (
                      <tr key={entry.id} className="hover:bg-panel/50 transition-colors">
                        <td className="py-3.5 px-6 text-sm text-textMuted font-medium">{formatDate(entry.date)}</td>
                        <td className="py-3.5 px-6 text-sm font-medium text-textDark">
                          <span>{entry.desc || '-'}</span>
                        </td>
                        <td className="py-3.5 px-6 text-sm text-right font-medium text-debit">
                          {Number(entry.debit) > 0 ? `₹${Number(entry.debit).toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="py-3.5 px-6 text-sm text-right font-medium text-credit">
                          {Number(entry.credit) > 0 ? `₹${Number(entry.credit).toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="py-3.5 px-6 text-sm text-right font-bold text-textDark">
                          {Number(entry.balanceAfter || 0) < 0 
                            ? `-₹${Math.abs(Number(entry.balanceAfter || 0)).toLocaleString('en-IN')}`
                            : `₹${Number(entry.balanceAfter || 0).toLocaleString('en-IN')}`
                          }
                        </td>
                      </tr>
                    ))
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

          {activeTab === 'purchases' && (
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead className="sticky top-0 z-10 bg-panel shadow-sm">
                  <tr className="uppercase text-xs text-textMuted border-b border-border">
                    <th className="py-3.5 px-6 font-semibold w-[18%]">Date</th>
                    <th className="py-3.5 px-6 font-semibold w-[20%]">Bill No</th>
                    <th className="py-3.5 px-6 font-semibold w-[24%]">Item & Category</th>
                    <th className="py-3.5 px-6 font-semibold text-right w-[12%]">Bags</th>
                    <th className="py-3.5 px-6 font-semibold text-right w-[13%]">Cost/Bag (₹)</th>
                    <th className="py-3.5 px-6 font-semibold text-right w-[13%]">Total Cost (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {purchases.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-12 text-center text-textMuted text-sm">No purchases recorded from this supplier.</td>
                    </tr>
                  ) : (
                    purchases.map(p => {
                      const catLabel = CATEGORY_LABELS[p.categoryKey] || p.categoryKey || '-';
                      return (
                        <tr key={p.id} className="hover:bg-panel/50 transition-colors">
                          <td className="py-3.5 px-6 text-sm text-textMuted font-medium">{formatDate(p.date || p.createdAt)}</td>
                          <td className="py-3.5 px-6 text-sm font-semibold text-brownDark">{p.billNo || '-'}</td>
                          <td className="py-3.5 px-6 text-sm text-textDark">
                            <span className="font-medium block">{p.itemName || '-'}</span>
                            <span className="text-xs text-textMuted">{catLabel}</span>
                          </td>
                          <td className="py-3.5 px-6 text-sm text-right font-semibold text-textDark">
                            {Number(p.bags || 0).toLocaleString('en-IN')}
                          </td>
                          <td className="py-3.5 px-6 text-sm text-right text-textMuted">
                            ₹{Number(p.costPerBag || 0).toLocaleString('en-IN')}
                          </td>
                          <td className="py-3.5 px-6 text-sm font-bold text-right text-gold text-base">
                            ₹{Number(p.total || p.totalAmount || 0).toLocaleString('en-IN')}
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

      <RecordSupplierPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onSuccess={fetchSupplierData}
        supplierId={supplier.id}
        supplierName={supplier.name}
        supplierBalance={supplier.balance}
      />
    </div>
  );
}
