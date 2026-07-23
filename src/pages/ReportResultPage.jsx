import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Download, Users, BarChart3, Package, Calendar, 
  CalendarDays, Tag, Loader2, ArrowLeft, RefreshCw, AlertCircle,
  Truck, Scale, Warehouse, Wallet, Boxes, Layers
} from 'lucide-react';
import { 
  getCustomerWiseBalanceReport, 
  getCustomerWiseSalesReport, 
  getTotalInventoryReport, 
  getDateWiseSalesReport, 
  getMonthWiseSalesReport, 
  getItemWiseSalesReport,
  getpurchasesReport,
  getCategoryPnL,
  getItemPurchaseData,
  getCategoryStockValueReport,
  getDateWisePurchaseReport,
  getSupplierBalanceReport,
  getStockSummaryByVariety,
  getCurrentStockReport
} from '../firebase/reports';
import { useToast } from '../context/ToastContext';
import { formatDateIST, getISTTodayDateString } from '../utils/dateIST';

export default function ReportResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const state = location.state || {};
  const { reportType, filters = {} } = state;
  const { from: fromDate, to: toDate, selectedMonth } = filters;

  const [reportData, setReportData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const currentYear = Number(getISTTodayDateString().slice(0, 4));

  const reportsList = [
    { id: "customer-wise-balance", title: "Customer-wise Balance", description: "Outstanding & credit by customer.", icon: Users, slug: "customer-wise-balance" },
    { id: "customer-wise-sales", title: "Customer-wise Sales", description: "Total sales value per customer.", icon: BarChart3, slug: "customer-wise-sales" },
    { id: "total-inventory-data", title: "Total Inventory Data", description: "Stock & value across all items.", icon: Package, slug: "total-inventory-data" },
    { id: "total-sales-date-wise", title: "Total Sales (Date-wise)", description: "Daily sales totals for a range.", icon: Calendar, slug: "total-sales-date-wise" },
    { id: "total-sales-month-wise", title: "Total Sales (Month-wise)", description: "Monthly sales totals this year.", icon: CalendarDays, slug: "total-sales-month-wise" },
    { id: "item-wise-sales-data", title: "Item-wise Sales Data", description: "Quantity & value sold per item.", icon: Tag, slug: "item-wise-sales-data" },
    { id: "sales-current-stock", title: "Current Stock Report", description: "Bags in stock per item with current MRP value.", icon: Boxes, slug: "sales-current-stock" }
  ];

  const purchaseReportsList = [
    { id: "purchase-supplier-wise", title: "Supplier-wise Purchases", description: "Total purchase value per supplier.", icon: Truck, slug: "purchase-supplier-wise" },
    { id: "purchase-category-pnl", title: "Category-wise Purchase vs Sale (P&L)", description: "Profit or loss per category based on buying and selling prices.", icon: Scale, slug: "purchase-category-pnl" },
    { id: "purchase-item-wise", title: "Item-wise Purchase Data", description: "Quantity and cost per item purchased.", icon: Tag, slug: "purchase-item-wise" },
    { id: "purchase-category-stock", title: "Current Stock by Category (Value)", description: "Stock remaining and its value per category.", icon: Warehouse, slug: "purchase-category-stock" },
    { id: "purchase-date-wise", title: "Purchase History (Date-wise)", description: "Daily purchase totals for a range.", icon: Calendar, slug: "purchase-date-wise" },
    { id: "purchase-supplier-balance", title: "Supplier Balance Report", description: "How much is owed to each supplier.", icon: Wallet, slug: "purchase-supplier-balance" },
    { id: "purchase-stock-by-variety", title: "Stock Summary by Variety", description: "Total bags and stock value grouped by category.", icon: Layers, slug: "purchase-stock-by-variety" }
  ];

  const allReportsList = [...reportsList, ...purchaseReportsList];
  const activeReportObj = allReportsList.find(r => r.id === reportType);

  const formatDateDisplay = (dateVal) => formatDateIST(dateVal);

  const fetchReport = async () => {
    if (!reportType) return;
    setIsLoading(true);
    setError(false);
    try {
      let data = null;
      if (reportType === "customer-wise-balance") {
        data = await getCustomerWiseBalanceReport({ from: fromDate, to: toDate });
      } else if (reportType === "customer-wise-sales") {
        data = await getCustomerWiseSalesReport({ from: fromDate, to: toDate });
      } else if (reportType === "total-inventory-data") {
        data = await getTotalInventoryReport();
      } else if (reportType === "total-sales-date-wise") {
        data = await getDateWiseSalesReport({ from: fromDate, to: toDate });
      } else if (reportType === "total-sales-month-wise") {
        const y = fromDate ? (new Date(fromDate).getUTCFullYear() || currentYear) : currentYear;
        data = await getMonthWiseSalesReport({ year: y });
      } else if (reportType === "item-wise-sales-data") {
        data = await getItemWiseSalesReport({ from: fromDate, to: toDate });
      } else if (reportType === "purchase-supplier-wise") {
        data = await getpurchasesReport({ from: fromDate, to: toDate });
      } else if (reportType === "purchase-category-pnl") {
        data = await getCategoryPnL({ from: fromDate, to: toDate });
      } else if (reportType === "purchase-item-wise") {
        data = await getItemPurchaseData({ from: fromDate, to: toDate });
      } else if (reportType === "purchase-category-stock") {
        data = await getCategoryStockValueReport();
      } else if (reportType === "purchase-date-wise") {
        data = await getDateWisePurchaseReport({ from: fromDate, to: toDate });
      } else if (reportType === "sales-current-stock") {
        data = await getCurrentStockReport();
      } else if (reportType === "purchase-supplier-balance") {
        data = await getSupplierBalanceReport({ from: fromDate, to: toDate });
      } else if (reportType === "purchase-stock-by-variety") {
        data = await getStockSummaryByVariety();
      }
      setReportData(data);
    } catch (err) {
      console.error("Error generating report:", err);
      setError(true);
      showToast("Failed to generate report", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [reportType, fromDate, toDate]);

  if (!reportType || !activeReportObj) {
    return (
      <div className="bg-white rounded-2xl p-12 text-center border border-border shadow-sm max-w-lg mx-auto mt-12 space-y-4">
        <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
        <h3 className="font-display text-xl font-semibold text-brownDark">No Report Specified</h3>
        <p className="text-sm text-textMuted">Please choose a report from the Reports page to view its results.</p>
        <button
          onClick={() => navigate('/reports')}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gold text-white rounded-xl font-medium shadow-sm hover:bg-gold/90 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Go to Reports Menu
        </button>
      </div>
    );
  }

  const handleExportCSV = () => {
    if (!reportData || !reportData.rows || reportData.rows.length === 0) return;
    let csvContent = "";

    if (reportType === "customer-wise-balance") {
      csvContent += "Customer Name,Mobile,Total Balance (Rs),Status,Last Payment,Last Purchase\n";
      reportData.rows.forEach(r => {
        csvContent += `"${(r.name || '').replace(/"/g, '""')}","${r.phone || ''}",${r.balance || 0},"${r.status || ''}","${formatDateDisplay(r.lastPayment)}","${formatDateDisplay(r.lastPurchase)}"\n`;
      });
      csvContent += `Total Outstanding,,${reportData.summary?.totalOutstanding || 0},,,\n`;
    } else if (reportType === "customer-wise-sales") {
      csvContent += "Customer Name,No. of Bills,Total Bags,Total Kgs,Total (Rs)\n";
      reportData.rows.forEach(r => {
        csvContent += `"${(r.name || '').replace(/"/g, '""')}",${r.bills || 0},${r.bags || 0},${r.kgs || 0},${r.total || 0}\n`;
      });
      csvContent += `Grand Total,${reportData.summary?.bills || 0},${reportData.summary?.bags || 0},${reportData.summary?.kgs || 0},${reportData.summary?.total || 0}\n`;
    } else if (reportType === "total-inventory-data") {
      csvContent += "Item,Category,Bag Size,Stock (Bags),Stock (Kg),MRP (Rs),Stock Value (Rs)\n";
      reportData.rows.forEach(r => {
        csvContent += `"${(r.name || '').replace(/"/g, '""')}","${(r.category || '').replace(/"/g, '""')}","${r.bagSize || ''}",${r.stockBags || 0},${r.stockKg || 0},${r.mrp || 0},${r.stockValue || 0}\n`;
      });
      csvContent += `Total Stock Value,,,${reportData.summary?.stockBags || 0},${reportData.summary?.stockKg || 0},,${reportData.summary?.stockValue || 0}\n`;
    } else if (reportType === "total-sales-date-wise") {
      csvContent += "Date,No. of Bills,Total Bags,Total Kgs,Total (Rs)\n";
      reportData.rows.forEach(r => {
        csvContent += `"${formatDateDisplay(r.dateObj || r.dateStr)}",${r.bills || 0},${r.bags || 0},${r.kgs || 0},${r.total || 0}\n`;
      });
      csvContent += `Total for the range,${reportData.summary?.bills || 0},${reportData.summary?.bags || 0},${reportData.summary?.kgs || 0},${reportData.summary?.total || 0}\n`;
    } else if (reportType === "total-sales-month-wise") {
      csvContent += "Month,No. of Bills,Total Bags,Total Kgs,Total (Rs)\n";
      reportData.rows.forEach(r => {
        csvContent += `"${r.month || ''}",${r.bills || 0},${r.bags || 0},${r.kgs || 0},${r.total || 0}\n`;
      });
      csvContent += `Year Total,${reportData.summary?.bills || 0},${reportData.summary?.bags || 0},${reportData.summary?.kgs || 0},${reportData.summary?.total || 0}\n`;
    } else if (reportType === "item-wise-sales-data") {
      csvContent += "Item,Category,No. of Bills,Total Bags,Total Kgs,Total (Rs)\n";
      reportData.rows.forEach(r => {
        csvContent += `"${(r.name || '').replace(/"/g, '""')}","${(r.category || '').replace(/"/g, '""')}",${r.bills || 0},${r.bags || 0},${r.kgs || 0},${r.total || 0}\n`;
      });
      csvContent += `Grand Total,,${reportData.summary?.bills || 0},${reportData.summary?.bags || 0},${reportData.summary?.kgs || 0},${reportData.summary?.total || 0}\n`;
    } else if (reportType === "purchase-supplier-wise") {
      csvContent += "Supplier Name,No. of Bills,Total Bags,Total Kgs,Total Cost (Rs)\n";
      reportData.rows.forEach(r => {
        csvContent += `"${(r.supplierName || '').replace(/"/g, '""')}",${r.bills || 0},${r.bags || 0},${r.kgs || 0},${r.totalCost || 0}\n`;
      });
      csvContent += `Grand Total,${reportData.summary?.bills || 0},${reportData.summary?.bags || 0},${reportData.summary?.kgs || 0},${reportData.summary?.totalCost || 0}\n`;
    } else if (reportType === "purchase-category-pnl") {
      csvContent += "Category,Bags Bought,Avg Buy Price (Rs),Bags Sold,Avg Sell Price (Rs),Gross Profit (Rs),Margin (%)\n";
      reportData.rows.forEach(r => {
        csvContent += `"${(r.category || '').replace(/"/g, '""')}",${r.bagsBought || 0},${r.avgBuyPrice !== null ? r.avgBuyPrice.toFixed(2) : '-'},${r.bagsSold || 0},${r.avgSellPrice ? r.avgSellPrice.toFixed(2) : '0.00'},${r.grossProfit !== null ? r.grossProfit.toFixed(2) : '-'},${r.margin !== null ? r.margin.toFixed(2) + '%' : '-'}\n`;
      });
      csvContent += `Overall Summary,,,,,${reportData.summary?.overallGrossProfit?.toFixed(2) || 0},${reportData.summary?.overallMargin?.toFixed(2) || 0}%\n`;
    } else if (reportType === "purchase-item-wise") {
      csvContent += "Item,Category,No. of Bills,Bags Bought,Total Kgs,Avg Cost/Bag (Rs),Total Cost (Rs)\n";
      reportData.rows.forEach(r => {
        csvContent += `"${(r.itemName || '').replace(/"/g, '""')}","${(r.category || '').replace(/"/g, '""')}",${r.bills || 0},${r.bagsBought || 0},${r.totalKgs || 0},${r.avgCostPerBag?.toFixed(2) || 0},${r.totalCost || 0}\n`;
      });
      csvContent += `Grand Total,,${reportData.summary?.bills || 0},${reportData.summary?.bagsBought || 0},${reportData.summary?.totalKgs || 0},,${reportData.summary?.totalCost || 0}\n`;
    } else if (reportType === "purchase-category-stock") {
      csvContent += "Category,No. of Items,Total Bags in Stock,Total Kgs,Avg MRP (Rs/bag),Stock Value (Rs)\n";
      reportData.rows.forEach(r => {
        csvContent += `"${(r.category || '').replace(/"/g, '""')}",${r.itemCount || 0},${r.totalBags || 0},${r.totalKgs || 0},${r.avgRate?.toFixed(2) || 0},${r.stockValue || 0}\n`;
      });
      csvContent += `Total Stock Value across all categories,${reportData.summary?.itemCount || 0},${reportData.summary?.totalBags || 0},${reportData.summary?.totalKgs || 0},,${reportData.summary?.stockValue || 0}\n`;
    } else if (reportType === "purchase-date-wise") {
      csvContent += "Date,No. of Bills,Bags,Total Cost (Rs)\n";
      reportData.rows.forEach(r => {
        csvContent += `"${formatDateDisplay(r.dateObj || r.dateStr)}",${r.bills || 0},${r.bags || 0},${r.totalCost || 0}\n`;
      });
      csvContent += `Total for the range,${reportData.summary?.bills || 0},${reportData.summary?.bags || 0},${reportData.summary?.totalCost || 0}\n`;
    } else if (reportType === "sales-current-stock") {
      csvContent += "Item,Category,Bags in Stock,MRP (Rs/bag),Stock Value (Rs)\n";
      reportData.rows.forEach(r => {
        csvContent += `"${(r.name || '').replace(/"/g, '""')}","${(r.category || '').replace(/"/g, '""')}",${r.bagsInStock || 0},${r.mrp || 0},${r.stockValue || 0}\n`;
      });
      csvContent += `Total Stock,,${reportData.summary?.totalBags || 0},,${reportData.summary?.stockValue || 0}\n`;
    } else if (reportType === "purchase-supplier-balance") {
      csvContent += "Supplier Name,Phone,Location,Total Purchased (Rs),Total Paid (Rs),Balance Payable (Rs)\n";
      reportData.rows.forEach(r => {
        csvContent += `"${(r.supplierName || '').replace(/"/g, '""')}","${r.phone || ''}","${(r.location || '').replace(/"/g, '""')}",${r.totalPurchased || 0},${r.totalPaid || 0},${r.balancePayable || 0}\n`;
      });
      csvContent += `Total Summary,,,${reportData.summary?.totalPurchased || 0},${reportData.summary?.totalPaid || 0},${reportData.summary?.totalBalancePayable || 0}\n`;
    } else if (reportType === "purchase-stock-by-variety") {
      csvContent += "Category,No. of Items,Total Bags in Stock,Stock Value (Rs)\n";
      reportData.rows.forEach(r => {
        csvContent += `"${(r.category || '').replace(/"/g, '""')}",${r.itemCount || 0},${r.totalBags || 0},${r.stockValue || 0}\n`;
      });
      csvContent += `Total across all varieties,${reportData.summary?.itemCount || 0},${reportData.summary?.totalBags || 0},${reportData.summary?.stockValue || 0}\n`;
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const fileName = `skb-${activeReportObj.slug}-${fromDate || 'all'}-to-${toDate || 'all'}.csv`;
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const IconComponent = activeReportObj.icon;

  const getSubLine = () => {
    if (reportType === "total-inventory-data" || reportType === "purchase-category-stock" || reportType === "sales-current-stock" || reportType === "purchase-stock-by-variety") {
      return "Stock as of now";
    }
    if (reportType === "total-sales-month-wise") {
      return `Showing monthly data for ${reportData?.year || (fromDate ? new Date(fromDate).getUTCFullYear() : currentYear)}`;
    }
    if (fromDate && toDate) {
      return `${formatDateDisplay(fromDate)} – ${formatDateDisplay(toDate)}`;
    }
    return "All Time";
  };

  return (
    <div className="space-y-6 pb-12">
      {/* TOP NAVIGATION BAR */}
      <div>
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-brownDark hover:text-gold transition-colors mb-4 group"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          Back to Reports
        </button>

        <div className="bg-white rounded-2xl shadow-sm border border-border p-5 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gold/15 text-gold flex items-center justify-center shrink-0">
              <IconComponent className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-brownDark">
                {activeReportObj.title}
              </h1>
              <p className="text-sm text-textMuted mt-0.5">
                {getSubLine()}
              </p>
            </div>
          </div>

          <button
            onClick={handleExportCSV}
            disabled={isLoading || error || !reportData || !reportData.rows || reportData.rows.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-brownDark bg-white border border-border rounded-xl shadow-sm hover:bg-panel transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 min-h-[44px]"
          >
            <Download className="w-4 h-4 text-textMuted" />
            Export CSV
          </button>
        </div>
      </div>

      {(reportType === "total-inventory-data" || reportType === "purchase-category-stock" || reportType === "sales-current-stock" || reportType === "purchase-stock-by-variety") && (
        <div className="bg-amber-50 border border-amber-200/60 rounded-xl px-5 py-3 text-xs font-medium text-amber-800">
          Note: Stock as of now (point-in-time snapshot, date range filters do not apply).
        </div>
      )}

      {reportType === "purchase-category-pnl" && (
        <div className="bg-blue-50 border border-blue-200/60 rounded-xl px-5 py-3 text-xs font-medium text-blue-800">
          Note: Avg buy price is computed from purchases in the selected date range. If no purchases exist in the range, buy price shows as '—' and P&L cannot be computed for that category.
        </div>
      )}

      {/* RESULTS TABLE CONTAINER */}
      <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-4 animate-pulse">
            <div className="h-10 bg-panel rounded-xl w-full"></div>
            <div className="space-y-3 pt-2">
              <div className="h-12 bg-panel/70 rounded-lg w-full"></div>
              <div className="h-12 bg-panel/70 rounded-lg w-full"></div>
              <div className="h-12 bg-panel/70 rounded-lg w-full"></div>
            </div>
          </div>
        ) : error ? (
          <div className="p-16 text-center text-textMuted flex flex-col items-center justify-center gap-4">
            <AlertCircle className="w-10 h-10 text-debit" />
            <div>
              <p className="font-semibold text-brownDark text-base">Could not load report</p>
              <p className="text-sm text-textMuted mt-1">Check your connection and try again.</p>
            </div>
            <button
              onClick={fetchReport}
              className="inline-flex items-center gap-2 px-4 py-2 bg-panel text-brownDark font-medium text-sm rounded-xl hover:bg-gold/15 transition-colors shadow-sm min-h-[44px]"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </div>
        ) : !reportData || !reportData.rows || reportData.rows.length === 0 ? (
          <div className="p-16 text-center text-textMuted">
            No records found matching the selected criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* TABLE 1: Customer-wise Balance */}
            {reportType === "customer-wise-balance" && (
              <table className="w-full text-left border-collapse min-w-[850px]">
                <thead>
                  <tr className="bg-panel uppercase text-xs text-textMuted border-b border-border">
                    <th className="py-3.5 px-6 font-semibold">Customer Name</th>
                    <th className="py-3.5 px-6 font-semibold">Mobile</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Total Balance (₹)</th>
                    <th className="py-3.5 px-6 font-semibold text-center">Status</th>
                    <th className="py-3.5 px-6 font-semibold">Last Payment</th>
                    <th className="py-3.5 px-6 font-semibold">Last Purchase</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reportData.rows.map(row => (
                    <tr key={row.id} className="hover:bg-panel/50 transition-colors">
                      <td className="py-3.5 px-6 text-sm font-medium text-textDark">{row.name}</td>
                      <td className="py-3.5 px-6 text-sm text-textMuted">{row.phone}</td>
                      <td className="py-3.5 px-6 text-sm font-semibold text-right text-textDark">
                        ₹{row.balance.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-6 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          row.status === 'overdue' ? 'bg-red-100 text-debit' :
                          row.status === 'active' ? 'bg-amber-100 text-amber-800' :
                          'bg-green-100 text-credit'
                        }`}>
                          {row.status ? row.status.charAt(0).toUpperCase() + row.status.slice(1) : 'Active'}
                        </span>
                      </td>
                      <td className={`py-3.5 px-6 text-sm ${row.isPaymentOutsideRange ? 'text-textMuted/50 line-through' : 'text-textMuted'}`}>
                        {formatDateDisplay(row.lastPayment)}
                      </td>
                      <td className="py-3.5 px-6 text-sm text-textMuted">
                        {formatDateDisplay(row.lastPurchase)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-panel/60 border-t-2 border-border font-semibold">
                  <tr>
                    <td colSpan="2" className="py-4 px-6 text-right font-display text-brownDark">Total Outstanding</td>
                    <td className="py-4 px-6 text-right font-bold text-debit text-base">
                      ₹{reportData.summary?.totalOutstanding.toLocaleString('en-IN')}
                    </td>
                    <td colSpan="3"></td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* TABLE 2: Customer-wise Sales */}
            {reportType === "customer-wise-sales" && (
              <table className="w-full text-left border-collapse min-w-[750px]">
                <thead>
                  <tr className="bg-panel uppercase text-xs text-textMuted border-b border-border">
                    <th className="py-3.5 px-6 font-semibold">Customer Name</th>
                    <th className="py-3.5 px-6 font-semibold text-right">No. of Bills</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Total Bags</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Total Kgs</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reportData.rows.map(row => (
                    <tr key={row.id} className="hover:bg-panel/50 transition-colors">
                      <td className="py-3.5 px-6 text-sm font-medium text-textDark">{row.name}</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textMuted">{row.bills}</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textDark">{row.bags.toLocaleString('en-IN')}</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textDark">{row.kgs.toLocaleString('en-IN')} kg</td>
                      <td className="py-3.5 px-6 text-sm font-semibold text-right text-textDark">
                        ₹{row.total.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-panel/60 border-t-2 border-border font-semibold">
                  <tr>
                    <td className="py-4 px-6 text-right font-display text-brownDark">Grand Total</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.bills}</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.bags.toLocaleString('en-IN')}</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.kgs.toLocaleString('en-IN')} kg</td>
                    <td className="py-4 px-6 text-right font-bold text-gold text-base">₹{reportData.summary?.total.toLocaleString('en-IN')}</td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* TABLE 3: Total Inventory Data */}
            {reportType === "total-inventory-data" && (
              <table className="w-full text-left border-collapse min-w-[850px]">
                <thead>
                  <tr className="bg-panel uppercase text-xs text-textMuted border-b border-border">
                    <th className="py-3.5 px-6 font-semibold">Item</th>
                    <th className="py-3.5 px-6 font-semibold">Category</th>
                    <th className="py-3.5 px-6 font-semibold">Bag Size</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Stock (Bags)</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Stock (Kg)</th>
                    <th className="py-3.5 px-6 font-semibold text-right">MRP (₹)</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Stock Value (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reportData.rows.map(row => (
                    <tr key={row.id} className="hover:bg-panel/50 transition-colors">
                      <td className="py-3.5 px-6 text-sm font-medium text-textDark">{row.name}</td>
                      <td className="py-3.5 px-6 text-sm text-textMuted">{row.category}</td>
                      <td className="py-3.5 px-6 text-sm text-textMuted">{row.bagSize}</td>
                      <td className={`py-3.5 px-6 text-sm text-right font-medium ${row.stockBags <= 15 ? 'text-debit font-semibold' : 'text-textDark'}`}>
                        {row.stockBags.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-6 text-sm text-right text-textDark">{row.stockKg.toLocaleString('en-IN')} kg</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textMuted">₹{(row.mrp !== undefined ? row.mrp : (row.rate || 0)).toLocaleString('en-IN')}</td>
                      <td className="py-3.5 px-6 text-sm font-semibold text-right text-textDark">
                        ₹{row.stockValue.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-panel/60 border-t-2 border-border font-semibold">
                  <tr>
                    <td colSpan="3" className="py-4 px-6 text-right font-display text-brownDark">Total Stock</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.stockBags.toLocaleString('en-IN')}</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.stockKg.toLocaleString('en-IN')} kg</td>
                    <td></td>
                    <td className="py-4 px-6 text-right font-bold text-gold text-base">₹{reportData.summary?.stockValue.toLocaleString('en-IN')}</td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* TABLE 4: Total Sales (Date-wise) */}
            {reportType === "total-sales-date-wise" && (
              <table className="w-full text-left border-collapse min-w-[750px]">
                <thead>
                  <tr className="bg-panel uppercase text-xs text-textMuted border-b border-border">
                    <th className="py-3.5 px-6 font-semibold">Date</th>
                    <th className="py-3.5 px-6 font-semibold text-right">No. of Bills</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Total Bags</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Total Kgs</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reportData.rows.map(row => (
                    <tr key={row.dateStr} className="hover:bg-panel/50 transition-colors">
                      <td className="py-3.5 px-6 text-sm font-medium text-textDark">
                        {formatDateDisplay(row.dateObj || row.dateStr)}
                      </td>
                      <td className="py-3.5 px-6 text-sm text-right text-textMuted">{row.bills}</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textDark">{row.bags.toLocaleString('en-IN')}</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textDark">{row.kgs.toLocaleString('en-IN')} kg</td>
                      <td className="py-3.5 px-6 text-sm font-semibold text-right text-textDark">
                        ₹{row.total.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-panel/60 border-t-2 border-border font-semibold">
                  <tr>
                    <td className="py-4 px-6 text-right font-display text-brownDark">Total for the range</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.bills}</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.bags.toLocaleString('en-IN')}</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.kgs.toLocaleString('en-IN')} kg</td>
                    <td className="py-4 px-6 text-right font-bold text-gold text-base">₹{reportData.summary?.total.toLocaleString('en-IN')}</td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* TABLE 5: Total Sales (Month-wise) */}
            {reportType === "total-sales-month-wise" && (
              <table className="w-full text-left border-collapse min-w-[750px]">
                <thead>
                  <tr className="bg-panel uppercase text-xs text-textMuted border-b border-border">
                    <th className="py-3.5 px-6 font-semibold">Month</th>
                    <th className="py-3.5 px-6 font-semibold text-right">No. of Bills</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Total Bags</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Total Kgs</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reportData.rows.map(row => (
                    <tr key={row.month} className="hover:bg-panel/50 transition-colors">
                      <td className="py-3.5 px-6 text-sm font-medium text-textDark">{row.month}</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textMuted">{row.bills}</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textDark">{row.bags.toLocaleString('en-IN')}</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textDark">{row.kgs.toLocaleString('en-IN')} kg</td>
                      <td className="py-3.5 px-6 text-sm font-semibold text-right text-textDark">
                        ₹{row.total.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-panel/60 border-t-2 border-border font-semibold">
                  <tr>
                    <td className="py-4 px-6 text-right font-display text-brownDark">Year Total</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.bills}</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.bags.toLocaleString('en-IN')}</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.kgs.toLocaleString('en-IN')} kg</td>
                    <td className="py-4 px-6 text-right font-bold text-gold text-base">₹{reportData.summary?.total.toLocaleString('en-IN')}</td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* TABLE 6: Item-wise Sales Data */}
            {reportType === "item-wise-sales-data" && (
              <table className="w-full text-left border-collapse min-w-[750px]">
                <thead>
                  <tr className="bg-panel uppercase text-xs text-textMuted border-b border-border">
                    <th className="py-3.5 px-6 font-semibold">Item</th>
                    <th className="py-3.5 px-6 font-semibold">Category</th>
                    <th className="py-3.5 px-6 font-semibold text-right">No. of Bills</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Total Bags</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Total Kgs</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reportData.rows.map(row => (
                    <tr key={row.itemId} className="hover:bg-panel/50 transition-colors">
                      <td className="py-3.5 px-6 text-sm font-medium text-textDark">{row.name}</td>
                      <td className="py-3.5 px-6 text-sm text-textMuted">{row.category}</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textMuted">{row.bills}</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textDark">{row.bags.toLocaleString('en-IN')}</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textDark">{row.kgs.toLocaleString('en-IN')} kg</td>
                      <td className="py-3.5 px-6 text-sm font-semibold text-right text-textDark">
                        ₹{row.total.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-panel/60 border-t-2 border-border font-semibold">
                  <tr>
                    <td colSpan="2" className="py-4 px-6 text-right font-display text-brownDark">Grand Total</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.bills}</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.bags.toLocaleString('en-IN')}</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.kgs.toLocaleString('en-IN')} kg</td>
                    <td className="py-4 px-6 text-right font-bold text-gold text-base">₹{reportData.summary?.total.toLocaleString('en-IN')}</td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* TABLE 7: Supplier-wise Purchases */}
            {reportType === "purchase-supplier-wise" && (
              <table className="w-full text-left border-collapse min-w-[750px]">
                <thead>
                  <tr className="bg-panel uppercase text-xs text-textMuted border-b border-border">
                    <th className="py-3.5 px-6 font-semibold">Supplier Name</th>
                    <th className="py-3.5 px-6 font-semibold text-right">No. of Bills</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Total Bags</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Total Kgs</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Total Cost (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reportData.rows.map(row => (
                    <tr key={row.supplierId || row.supplierName} className="hover:bg-panel/50 transition-colors">
                      <td className="py-3.5 px-6 text-sm font-medium text-textDark">{row.supplierName}</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textMuted">{row.bills}</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textDark">{row.bags.toLocaleString('en-IN')}</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textDark">{row.kgs.toLocaleString('en-IN')} kg</td>
                      <td className="py-3.5 px-6 text-sm font-bold text-right text-brownDark">
                        ₹{row.totalCost.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-panel/60 border-t-2 border-border font-semibold">
                  <tr>
                    <td className="py-4 px-6 text-right font-display text-brownDark">Grand Total</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.bills}</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.bags.toLocaleString('en-IN')}</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.kgs.toLocaleString('en-IN')} kg</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark text-base">₹{reportData.summary?.totalCost.toLocaleString('en-IN')}</td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* TABLE 8: Category-wise Purchase vs Sale (P&L) */}
            {reportType === "purchase-category-pnl" && (
              <table className="w-full text-left border-collapse min-w-[850px]">
                <thead>
                  <tr className="bg-panel uppercase text-xs text-textMuted border-b border-border">
                    <th className="py-3.5 px-6 font-semibold">Category</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Bags Bought</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Avg Buy Price (₹)</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Bags Sold</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Avg Sell Price (₹)</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Gross Profit (₹)</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reportData.rows.map(row => {
                    const isProfit = row.grossProfit > 0;
                    const isLoss = row.grossProfit < 0;

                    return (
                      <tr key={row.categoryKey} className="hover:bg-panel/50 transition-colors">
                        <td className="py-3.5 px-6 text-sm font-medium text-textDark">{row.category}</td>
                        <td className="py-3.5 px-6 text-sm text-right text-textDark">{row.bagsBought.toLocaleString('en-IN')}</td>
                        <td className="py-3.5 px-6 text-sm text-right text-textMuted">
                          {row.avgBuyPrice !== null ? `₹${row.avgBuyPrice.toFixed(2)}` : '—'}
                        </td>
                        <td className="py-3.5 px-6 text-sm text-right text-textDark">{row.bagsSold.toLocaleString('en-IN')}</td>
                        <td className="py-3.5 px-6 text-sm text-right text-textMuted">
                          {row.avgSellPrice ? `₹${row.avgSellPrice.toFixed(2)}` : '₹0.00'}
                        </td>
                        <td className={`py-3.5 px-6 text-sm font-bold text-right ${
                          isProfit ? 'text-credit' : isLoss ? 'text-debit' : 'text-textMuted'
                        }`}>
                          {row.grossProfit !== null ? `₹${row.grossProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                        </td>
                        <td className="py-3.5 px-6 text-sm font-semibold text-right">
                          {row.margin !== null ? (
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              isProfit ? 'bg-green-100 text-credit' : isLoss ? 'bg-red-100 text-debit' : 'bg-gray-100 text-textMuted'
                            }`}>
                              {row.margin.toFixed(2)}%
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-panel/60 border-t-2 border-border font-semibold">
                  <tr>
                    <td colSpan="5" className="py-4 px-6 text-right font-display text-brownDark">Overall Summary (Categories with Buy & Sell data)</td>
                    <td className={`py-4 px-6 text-right font-bold text-base ${
                      (reportData.summary?.overallGrossProfit || 0) >= 0 ? 'text-credit' : 'text-debit'
                    }`}>
                      ₹{reportData.summary?.overallGrossProfit?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                    </td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">
                      {reportData.summary?.overallMargin?.toFixed(2) || '0.00'}%
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* TABLE 9: Item-wise Purchase Data */}
            {reportType === "purchase-item-wise" && (
              <table className="w-full text-left border-collapse min-w-[850px]">
                <thead>
                  <tr className="bg-panel uppercase text-xs text-textMuted border-b border-border">
                    <th className="py-3.5 px-6 font-semibold">Item</th>
                    <th className="py-3.5 px-6 font-semibold">Category</th>
                    <th className="py-3.5 px-6 font-semibold text-right">No. of Bills</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Bags Bought</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Total Kgs</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Avg Cost/Bag (₹)</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Total Cost (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reportData.rows.map(row => (
                    <tr key={row.itemId} className="hover:bg-panel/50 transition-colors">
                      <td className="py-3.5 px-6 text-sm font-medium text-textDark">{row.itemName}</td>
                      <td className="py-3.5 px-6 text-sm text-textMuted">{row.category}</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textMuted">{row.bills}</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textDark">{row.bagsBought.toLocaleString('en-IN')}</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textDark">{row.totalKgs.toLocaleString('en-IN')} kg</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textMuted">₹{row.avgCostPerBag?.toFixed(2) || '0.00'}</td>
                      <td className="py-3.5 px-6 text-sm font-bold text-right text-brownDark">
                        ₹{row.totalCost.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-panel/60 border-t-2 border-border font-semibold">
                  <tr>
                    <td colSpan="2" className="py-4 px-6 text-right font-display text-brownDark">Grand Total</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.bills}</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.bagsBought.toLocaleString('en-IN')}</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.totalKgs.toLocaleString('en-IN')} kg</td>
                    <td></td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark text-base">₹{reportData.summary?.totalCost.toLocaleString('en-IN')}</td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* TABLE 10: Current Stock by Category (Value) */}
            {reportType === "purchase-category-stock" && (
              <table className="w-full text-left border-collapse min-w-[750px]">
                <thead>
                  <tr className="bg-panel uppercase text-xs text-textMuted border-b border-border">
                    <th className="py-3.5 px-6 font-semibold">Category</th>
                    <th className="py-3.5 px-6 font-semibold text-right">No. of Items</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Total Bags in Stock</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Total Kgs</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Avg MRP (₹/bag)</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Stock Value (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reportData.rows.map(row => (
                    <tr key={row.categoryKey} className="hover:bg-panel/50 transition-colors">
                      <td className="py-3.5 px-6 text-sm font-medium text-textDark">{row.category}</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textMuted">{row.itemCount}</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textDark">{row.totalBags.toLocaleString('en-IN')}</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textDark">{row.totalKgs.toLocaleString('en-IN')} kg</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textMuted">₹{row.avgRate?.toFixed(2) || '0.00'}</td>
                      <td className="py-3.5 px-6 text-sm font-bold text-right text-credit">
                        ₹{row.stockValue.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-panel/60 border-t-2 border-border font-semibold">
                  <tr>
                    <td className="py-4 px-6 text-right font-display text-brownDark">Total Stock Value across all categories</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.itemCount}</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.totalBags.toLocaleString('en-IN')}</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.totalKgs.toLocaleString('en-IN')} kg</td>
                    <td></td>
                    <td className="py-4 px-6 text-right font-bold text-credit text-base">₹{reportData.summary?.stockValue.toLocaleString('en-IN')}</td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* TABLE 11: Purchase History (Date-wise) */}
            {reportType === "purchase-date-wise" && (
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-panel uppercase text-xs text-textMuted border-b border-border">
                    <th className="py-3.5 px-6 font-semibold">Date</th>
                    <th className="py-3.5 px-6 font-semibold text-right">No. of Bills</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Bags</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Total Cost (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reportData.rows.map(row => (
                    <tr key={row.dateStr} className="hover:bg-panel/50 transition-colors">
                      <td className="py-3.5 px-6 text-sm font-medium text-textDark">
                        {formatDateDisplay(row.dateObj || row.dateStr)}
                      </td>
                      <td className="py-3.5 px-6 text-sm text-right text-textMuted">{row.bills}</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textDark">{row.bags.toLocaleString('en-IN')}</td>
                      <td className="py-3.5 px-6 text-sm font-bold text-right text-brownDark">
                        ₹{row.totalCost.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-panel/60 border-t-2 border-border font-semibold">
                  <tr>
                    <td className="py-4 px-6 text-right font-display text-brownDark">Total for the range</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.bills}</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.bags.toLocaleString('en-IN')}</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark text-base">₹{reportData.summary?.totalCost.toLocaleString('en-IN')}</td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* TABLE 12: Current Stock Report (Sales) */}
            {reportType === "sales-current-stock" && (
              <table className="w-full text-left border-collapse min-w-[750px]">
                <thead>
                  <tr className="bg-panel uppercase text-xs text-textMuted border-b border-border">
                    <th className="py-3.5 px-6 font-semibold">Item</th>
                    <th className="py-3.5 px-6 font-semibold">Category</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Bags in Stock</th>
                    <th className="py-3.5 px-6 font-semibold text-right">MRP (₹/bag)</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Stock Value (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reportData.rows.map(row => (
                    <tr key={row.id} className="hover:bg-panel/50 transition-colors">
                      <td className="py-3.5 px-6 text-sm font-medium text-textDark">{row.name}</td>
                      <td className="py-3.5 px-6 text-sm text-textMuted">{row.category}</td>
                      <td className="py-3.5 px-6 text-sm text-right font-medium text-textDark">{row.bagsInStock.toLocaleString('en-IN')}</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textMuted">₹{row.mrp.toLocaleString('en-IN')}</td>
                      <td className="py-3.5 px-6 text-sm font-bold text-right text-brownDark">₹{row.stockValue.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-panel/60 border-t-2 border-border font-semibold">
                  <tr>
                    <td colSpan="2" className="py-4 px-6 text-right font-display text-brownDark">Total Stock</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.totalBags.toLocaleString('en-IN')}</td>
                    <td></td>
                    <td className="py-4 px-6 text-right font-bold text-gold text-base">₹{reportData.summary?.stockValue.toLocaleString('en-IN')}</td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* TABLE 13: Supplier Balance Report (Purchase) */}
            {reportType === "purchase-supplier-balance" && (
              <table className="w-full text-left border-collapse min-w-[850px]">
                <thead>
                  <tr className="bg-panel uppercase text-xs text-textMuted border-b border-border">
                    <th className="py-3.5 px-6 font-semibold">Supplier Name</th>
                    <th className="py-3.5 px-6 font-semibold">Phone</th>
                    <th className="py-3.5 px-6 font-semibold">Location</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Total Purchased (₹)</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Total Paid (₹)</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Balance Payable (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reportData.rows.map(row => (
                    <tr key={row.id} className="hover:bg-panel/50 transition-colors">
                      <td className="py-3.5 px-6 text-sm font-medium text-textDark">{row.supplierName}</td>
                      <td className="py-3.5 px-6 text-sm text-textMuted">{row.phone}</td>
                      <td className="py-3.5 px-6 text-sm text-textMuted">{row.location}</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textDark">₹{row.totalPurchased.toLocaleString('en-IN')}</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textMuted">₹{row.totalPaid.toLocaleString('en-IN')}</td>
                      <td className={`py-3.5 px-6 text-sm font-bold text-right ${row.balancePayable > 0 ? 'text-debit' : 'text-textDark'}`}>
                        ₹{row.balancePayable.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-panel/60 border-t-2 border-border font-semibold">
                  <tr>
                    <td colSpan="3" className="py-4 px-6 text-right font-display text-brownDark">Total Summary</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">₹{reportData.summary?.totalPurchased.toLocaleString('en-IN')}</td>
                    <td className="py-4 px-6 text-right font-bold text-textMuted">₹{reportData.summary?.totalPaid.toLocaleString('en-IN')}</td>
                    <td className="py-4 px-6 text-right font-bold text-debit text-base">₹{reportData.summary?.totalBalancePayable.toLocaleString('en-IN')}</td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* TABLE 14: Stock Summary by Variety (Purchase) */}
            {reportType === "purchase-stock-by-variety" && (
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-panel uppercase text-xs text-textMuted border-b border-border">
                    <th className="py-3.5 px-6 font-semibold">Category</th>
                    <th className="py-3.5 px-6 font-semibold text-right">No. of Items</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Total Bags in Stock</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Stock Value (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reportData.rows.map(row => (
                    <tr key={row.categoryKey} className="hover:bg-panel/50 transition-colors">
                      <td className="py-3.5 px-6 text-sm font-medium text-textDark">{row.category}</td>
                      <td className="py-3.5 px-6 text-sm text-right text-textMuted">{row.itemCount}</td>
                      <td className="py-3.5 px-6 text-sm text-right font-medium text-textDark">{row.totalBags.toLocaleString('en-IN')}</td>
                      <td className="py-3.5 px-6 text-sm font-bold text-right text-brownDark">₹{row.stockValue.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-panel/60 border-t-2 border-border font-semibold">
                  <tr>
                    <td className="py-4 px-6 text-right font-display text-brownDark">Total across all varieties</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.itemCount}</td>
                    <td className="py-4 px-6 text-right font-bold text-brownDark">{reportData.summary?.totalBags.toLocaleString('en-IN')}</td>
                    <td className="py-4 px-6 text-right font-bold text-gold text-base">₹{reportData.summary?.stockValue.toLocaleString('en-IN')}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
