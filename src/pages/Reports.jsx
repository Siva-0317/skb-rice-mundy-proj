import { useState, useEffect } from 'react';
import { Download, Search, FileText } from 'lucide-react';
import { getCategories } from '../firebase/items';
import { getSalesReport, getPurchasesReport } from '../firebase/reports';
import { useToast } from '../context/ToastContext';

export default function Reports() {
  const [categories, setCategories] = useState([]);
  
  // Filter State
  const [reportType, setReportType] = useState('sales'); // 'sales' | 'purchases'
  
  // Default dates: First day of current month -> today
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const [fromDate, setFromDate] = useState(firstDay.toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(today.toISOString().split('T')[0]);
  
  const [categoryKey, setCategoryKey] = useState('');
  
  // Data State
  const [results, setResults] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  
  const { showToast } = useToast();

  useEffect(() => {
    const fetchCats = async () => {
      try {
        const cats = await getCategories();
        setCategories(cats);
      } catch (error) {
        console.error("Error fetching categories:", error);
      }
    };
    fetchCats();
  }, []);

  const handleGenerate = async () => {
    if (!fromDate || !toDate) {
      showToast("Please select valid date ranges", "error");
      return;
    }
    
    if (new Date(fromDate) > new Date(toDate)) {
      showToast("From Date cannot be later than To Date", "error");
      return;
    }

    setIsGenerating(true);
    setHasGenerated(true);
    
    try {
      let data = [];
      if (reportType === 'sales') {
        data = await getSalesReport({ from: fromDate, to: toDate, categoryKey });
      } else {
        data = await getPurchasesReport({ from: fromDate, to: toDate, categoryKey });
      }
      setResults(data);
      if (data.length === 0) {
        showToast("No records found for this period", "info");
      }
    } catch (error) {
      console.error("Error generating report:", error);
      showToast("Failed to generate report", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportCSV = () => {
    if (results.length === 0) return;

    let csvContent = "";
    
    // Header Row
    if (reportType === 'sales') {
      csvContent += "Date,Bill No,Customer,Items,Total Qty (bags),Amount (Rs)\n";
    } else {
      csvContent += "Date,Bill No,Supplier,Items,Total Qty (bags),Amount (Rs)\n";
    }

    // Data Rows
    results.forEach(row => {
      const dateStr = formatDate(row.date);
      const billNo = row.billNo || '-';
      const counterparty = reportType === 'sales' ? (row.customerName || '-') : (row.supplierName || '-');
      const itemsList = row.items?.map(i => i.item).join('; ') || '';
      const totalQty = row.items?.reduce((sum, i) => sum + Number(i.bags), 0) || 0;
      const amount = row.totalAmount || 0;

      // Escape fields with quotes if they contain commas
      const escapedCounterparty = `"${counterparty.replace(/"/g, '""')}"`;
      const escapedItems = `"${itemsList.replace(/"/g, '""')}"`;

      csvContent += `${dateStr},${billNo},${escapedCounterparty},${escapedItems},${totalQty},${amount}\n`;
    });

    // Create Blob and Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    const fileName = `skb-${reportType}-report-${fromDate}-to-${toDate}.csv`;
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDate = (dateVal) => {
    if (!dateVal) return '-';
    const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const grandTotal = results.reduce((sum, row) => sum + (row.totalAmount || 0), 0);
  const totalBags = results.reduce((sum, row) => sum + (row.items?.reduce((s, i) => s + Number(i.bags), 0) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-border">
        <h2 className="font-display text-xl font-semibold text-brownDark mb-6 flex items-center gap-2">
          <FileText className="w-5 h-5 text-gold" />
          Generate Report
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5 items-end">
          
          <div className="lg:col-span-1">
            <label className="block text-sm font-medium text-textDark mb-1.5">Report Type</label>
            <div className="flex bg-panel rounded-lg p-1 border border-border">
              <button
                onClick={() => { setReportType('sales'); setResults([]); setHasGenerated(false); }}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${reportType === 'sales' ? 'bg-white text-brownDark shadow-sm' : 'text-textMuted hover:text-textDark'}`}
              >
                Sales
              </button>
              <button
                onClick={() => { setReportType('purchases'); setResults([]); setHasGenerated(false); }}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${reportType === 'purchases' ? 'bg-white text-brownDark shadow-sm' : 'text-textMuted hover:text-textDark'}`}
              >
                Purchases
              </button>
            </div>
          </div>

          <div className="lg:col-span-1">
            <label className="block text-sm font-medium text-textDark mb-1.5">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 text-sm"
            />
          </div>

          <div className="lg:col-span-1">
            <label className="block text-sm font-medium text-textDark mb-1.5">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 text-sm"
            />
          </div>

          <div className="lg:col-span-1">
            <label className="block text-sm font-medium text-textDark mb-1.5">Category (Optional)</label>
            <select
              value={categoryKey}
              onChange={(e) => setCategoryKey(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 text-sm bg-white"
            >
              <option value="">All Categories</option>
              {categories.map(c => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-1">
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full bg-gold text-white px-4 py-2.5 rounded-lg hover:bg-gold/90 transition-colors font-medium shadow-sm flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {isGenerating ? 'Generating...' : (
                <>
                  <Search className="w-4 h-4" />
                  Generate
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {hasGenerated && (
        <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden flex flex-col">
          <div className="p-5 border-b border-border bg-panel/30 flex justify-between items-center flex-wrap gap-4">
            <div>
              <h3 className="font-display text-lg font-semibold text-brownDark">
                {reportType === 'sales' ? 'Sales Report' : 'Purchases Report'}
              </h3>
              <p className="text-sm text-textMuted mt-0.5">
                {formatDate(fromDate)} to {formatDate(toDate)} {categoryKey && `• Filtered`}
              </p>
            </div>
            
            <button
              onClick={handleExportCSV}
              disabled={results.length === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-brownDark bg-white border border-border rounded-lg shadow-sm hover:bg-panel transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4 text-textMuted" />
              Export CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-panel uppercase text-xs text-textMuted border-b border-border">
                  <th className="py-3 px-6 font-medium">Date</th>
                  <th className="py-3 px-6 font-medium">Bill No</th>
                  <th className="py-3 px-6 font-medium">{reportType === 'sales' ? 'Customer' : 'Supplier'}</th>
                  <th className="py-3 px-6 font-medium">Items</th>
                  <th className="py-3 px-6 font-medium text-right">Total Qty (bags)</th>
                  <th className="py-3 px-6 font-medium text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {results.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-12 text-center text-textMuted">
                      No records found for the selected criteria.
                    </td>
                  </tr>
                ) : (
                  results.map((row) => (
                    <tr key={row.id} className="border-b border-border hover:bg-panel/50 transition-colors">
                      <td className="py-3 px-6 text-sm text-textMuted">{formatDate(row.date)}</td>
                      <td className="py-3 px-6 text-sm font-medium text-textDark">{row.billNo}</td>
                      <td className="py-3 px-6 text-sm font-medium text-textDark">
                        {reportType === 'sales' ? row.customerName : row.supplierName}
                      </td>
                      <td className="py-3 px-6 text-sm text-textMuted max-w-xs truncate" title={row.items?.map(i => i.item).join(', ')}>
                        {row.items?.map(i => i.item).join(', ')}
                      </td>
                      <td className="py-3 px-6 text-sm text-right text-textDark">
                        {row.items?.reduce((sum, i) => sum + Number(i.bags), 0)}
                      </td>
                      <td className="py-3 px-6 text-sm font-medium text-right text-textDark">
                        {row.totalAmount?.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {results.length > 0 && (
                <tfoot className="bg-panel/50 border-t-2 border-border">
                  <tr>
                    <td colSpan="4" className="py-4 px-6 text-right font-display font-semibold text-brownDark">
                      Total
                    </td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">
                      {totalBags}
                    </td>
                    <td className="py-4 px-6 text-right font-bold text-debit text-lg">
                      ₹{grandTotal.toLocaleString('en-IN')}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
