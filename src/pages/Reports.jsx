import { useState } from 'react';
import { 
  Download, Users, BarChart3, Package, Calendar, 
  CalendarDays, Tag, Loader2, ArrowRight, Filter, RefreshCw 
} from 'lucide-react';
import { 
  getCustomerWiseBalanceReport, 
  getCustomerWiseSalesReport, 
  getTotalInventoryReport, 
  getDateWiseSalesReport, 
  getMonthWiseSalesReport, 
  getItemWiseSalesReport 
} from '../firebase/reports';
import { useToast } from '../context/ToastContext';

export default function Reports() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonthIdx = today.getMonth();

  // Helper to format Date -> YYYY-MM-DD string
  const toISODate = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getFirstDayOfMonth = (year, monthIdx) => new Date(year, monthIdx, 1);
  const getLastDayOfMonth = (year, monthIdx) => new Date(year, monthIdx + 1, 0);

  // Generate month options from Jan 2026 up to current month
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", 
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];
  
  const monthOptions = [];
  const startYear = 2026;
  for (let y = startYear; y <= currentYear; y++) {
    const maxM = (y === currentYear) ? currentMonthIdx : 11;
    for (let m = 0; m <= maxM; m++) {
      monthOptions.push({
        value: `${y}-${String(m).padStart(2, '0')}`,
        label: `${monthNames[m]} ${y}`,
        year: y,
        monthIdx: m
      });
    }
  }

  const defaultMonthOpt = monthOptions.length > 0 ? monthOptions[monthOptions.length - 1] : {
    value: `${currentYear}-${String(currentMonthIdx).padStart(2, '0')}`,
    label: `${monthNames[currentMonthIdx]} ${currentYear}`,
    year: currentYear,
    monthIdx: currentMonthIdx
  };

  const [selectedMonth, setSelectedMonth] = useState(defaultMonthOpt.value);
  const [fromDate, setFromDate] = useState(toISODate(getFirstDayOfMonth(defaultMonthOpt.year, defaultMonthOpt.monthIdx)));
  const [toDate, setToDate] = useState(toISODate(getLastDayOfMonth(defaultMonthOpt.year, defaultMonthOpt.monthIdx)));
  const [activePill, setActivePill] = useState("This Month");

  // Report state
  const [activeReportId, setActiveReportId] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeRangeLabel, setActiveRangeLabel] = useState('');

  const { showToast } = useToast();

  const handleMonthChange = (val) => {
    setSelectedMonth(val);
    setActivePill("");
    if (!val) return;
    const [yStr, mStr] = val.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    setFromDate(toISODate(getFirstDayOfMonth(y, m)));
    setToDate(toISODate(getLastDayOfMonth(y, m)));
  };

  const handlePillClick = (pill) => {
    setActivePill(pill);
    const now = new Date();
    if (pill === "Today") {
      const dStr = toISODate(now);
      setFromDate(dStr);
      setToDate(dStr);
      setSelectedMonth("");
    } else if (pill === "This Week") {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday start
      const startOfWeek = new Date(now.setDate(diff));
      setFromDate(toISODate(startOfWeek));
      setToDate(toISODate(new Date()));
      setSelectedMonth("");
    } else if (pill === "This Month" || pill === "Clear filters") {
      setSelectedMonth(defaultMonthOpt.value);
      setFromDate(toISODate(getFirstDayOfMonth(defaultMonthOpt.year, defaultMonthOpt.monthIdx)));
      setToDate(toISODate(getLastDayOfMonth(defaultMonthOpt.year, defaultMonthOpt.monthIdx)));
      if (pill === "Clear filters") setActivePill("This Month");
    }
  };

  const formatDateDisplay = (dateVal) => {
    if (!dateVal) return '-';
    const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const reportsList = [
    {
      id: "customer-wise-balance",
      title: "Customer-wise Balance",
      description: "Outstanding & credit by customer.",
      icon: Users,
      slug: "customer-wise-balance"
    },
    {
      id: "customer-wise-sales",
      title: "Customer-wise Sales",
      description: "Total sales value per customer.",
      icon: BarChart3,
      slug: "customer-wise-sales"
    },
    {
      id: "total-inventory-data",
      title: "Total Inventory Data",
      description: "Stock & value across all items.",
      icon: Package,
      slug: "total-inventory-data"
    },
    {
      id: "total-sales-date-wise",
      title: "Total Sales (Date-wise)",
      description: "Daily sales totals for a range.",
      icon: Calendar,
      slug: "total-sales-date-wise"
    },
    {
      id: "total-sales-month-wise",
      title: "Total Sales (Month-wise)",
      description: "Monthly sales totals this year.",
      icon: CalendarDays,
      slug: "total-sales-month-wise"
    },
    {
      id: "item-wise-sales-data",
      title: "Item-wise Sales Data",
      description: "Quantity & value sold per item.",
      icon: Tag,
      slug: "item-wise-sales-data"
    }
  ];

  const handleGenerateReport = async (repId) => {
    if (!fromDate || !toDate) {
      showToast("Please select valid From and To dates", "error");
      return;
    }
    if (new Date(fromDate) > new Date(toDate)) {
      showToast("From Date cannot be later than To Date", "error");
      return;
    }

    setIsGenerating(true);
    setActiveReportId(repId);
    setReportData(null);

    const rangeStr = `${formatDateDisplay(fromDate)} to ${formatDateDisplay(toDate)}`;
    setActiveRangeLabel(rangeStr);

    try {
      let data = null;
      if (repId === "customer-wise-balance") {
        data = await getCustomerWiseBalanceReport({ from: fromDate, to: toDate });
      } else if (repId === "customer-wise-sales") {
        data = await getCustomerWiseSalesReport({ from: fromDate, to: toDate });
      } else if (repId === "total-inventory-data") {
        data = await getTotalInventoryReport();
      } else if (repId === "total-sales-date-wise") {
        data = await getDateWiseSalesReport({ from: fromDate, to: toDate });
      } else if (repId === "total-sales-month-wise") {
        const y = new Date(fromDate).getFullYear() || currentYear;
        data = await getMonthWiseSalesReport({ year: y });
      } else if (repId === "item-wise-sales-data") {
        data = await getItemWiseSalesReport({ from: fromDate, to: toDate });
      }

      setReportData(data);
      if (!data || !data.rows || data.rows.length === 0) {
        showToast("No records found for this report", "info");
      }
    } catch (err) {
      console.error("Error generating report:", err);
      showToast("Failed to generate report", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportCSV = () => {
    if (!reportData || !reportData.rows || reportData.rows.length === 0) return;
    const rep = reportsList.find(r => r.id === activeReportId);
    if (!rep) return;

    let csvContent = "";

    if (activeReportId === "customer-wise-balance") {
      csvContent += "Customer Name,Mobile,Total Balance (Rs),Status,Last Payment,Last Purchase\n";
      reportData.rows.forEach(r => {
        csvContent += `"${(r.name || '').replace(/"/g, '""')}","${r.phone || ''}",${r.balance || 0},"${r.status || ''}","${formatDateDisplay(r.lastPayment)}","${formatDateDisplay(r.lastPurchase)}"\n`;
      });
      csvContent += `Total Outstanding,,${reportData.summary?.totalOutstanding || 0},,,\n`;
    } else if (activeReportId === "customer-wise-sales") {
      csvContent += "Customer Name,No. of Bills,Total Bags,Total Kgs,Total (Rs)\n";
      reportData.rows.forEach(r => {
        csvContent += `"${(r.name || '').replace(/"/g, '""')}",${r.bills || 0},${r.bags || 0},${r.kgs || 0},${r.total || 0}\n`;
      });
      csvContent += `Grand Total,${reportData.summary?.bills || 0},${reportData.summary?.bags || 0},${reportData.summary?.kgs || 0},${reportData.summary?.total || 0}\n`;
    } else if (activeReportId === "total-inventory-data") {
      csvContent += "Item,Category,Bag Size,Stock (Bags),Stock (Kg),Rate (Rs),Stock Value (Rs)\n";
      reportData.rows.forEach(r => {
        csvContent += `"${(r.name || '').replace(/"/g, '""')}","${(r.category || '').replace(/"/g, '""')}","${r.bagSize || ''}",${r.stockBags || 0},${r.stockKg || 0},${r.rate || 0},${r.stockValue || 0}\n`;
      });
      csvContent += `Total Stock Value,,,${reportData.summary?.stockBags || 0},${reportData.summary?.stockKg || 0},,${reportData.summary?.stockValue || 0}\n`;
    } else if (activeReportId === "total-sales-date-wise") {
      csvContent += "Date,No. of Bills,Total Bags,Total Kgs,Total (Rs)\n";
      reportData.rows.forEach(r => {
        csvContent += `"${formatDateDisplay(r.dateObj || r.dateStr)}",${r.bills || 0},${r.bags || 0},${r.kgs || 0},${r.total || 0}\n`;
      });
      csvContent += `Total for the range,${reportData.summary?.bills || 0},${reportData.summary?.bags || 0},${reportData.summary?.kgs || 0},${reportData.summary?.total || 0}\n`;
    } else if (activeReportId === "total-sales-month-wise") {
      csvContent += "Month,No. of Bills,Total Bags,Total Kgs,Total (Rs)\n";
      reportData.rows.forEach(r => {
        csvContent += `"${r.month || ''}",${r.bills || 0},${r.bags || 0},${r.kgs || 0},${r.total || 0}\n`;
      });
      csvContent += `Year Total,${reportData.summary?.bills || 0},${reportData.summary?.bags || 0},${reportData.summary?.kgs || 0},${reportData.summary?.total || 0}\n`;
    } else if (activeReportId === "item-wise-sales-data") {
      csvContent += "Item,Category,No. of Bills,Total Bags,Total Kgs,Total (Rs)\n";
      reportData.rows.forEach(r => {
        csvContent += `"${(r.name || '').replace(/"/g, '""')}","${(r.category || '').replace(/"/g, '""')}",${r.bills || 0},${r.bags || 0},${r.kgs || 0},${r.total || 0}\n`;
      });
      csvContent += `Grand Total,,${reportData.summary?.bills || 0},${reportData.summary?.bags || 0},${reportData.summary?.kgs || 0},${reportData.summary?.total || 0}\n`;
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const fileName = `skb-${rep.slug}-${fromDate}-to-${toDate}.csv`;
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const activeReportObj = reportsList.find(r => r.id === activeReportId);

  return (
    <div className="space-y-8 pb-12">
      {/* FILTER BAR */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-border">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gold" />
            <h2 className="font-display text-lg font-semibold text-brownDark">
              Report Filters
            </h2>
          </div>

          {/* Quick Select Pills */}
          <div className="flex flex-wrap gap-2">
            {["Today", "This Week", "This Month", "Clear filters"].map((pill) => (
              <button
                key={pill}
                onClick={() => handlePillClick(pill)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                  activePill === pill
                    ? "bg-brownDark text-white shadow-sm"
                    : "bg-panel text-textDark hover:bg-gold/15"
                }`}
              >
                {pill}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-textMuted mb-1.5">
              Month Selector
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 font-medium text-textDark"
            >
              <option value="">Custom Date Range</option>
              {monthOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-textMuted mb-1.5">
              From Date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setSelectedMonth("");
                setActivePill("");
              }}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 font-medium text-textDark"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-textMuted mb-1.5">
              To Date
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setSelectedMonth("");
                setActivePill("");
              }}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 font-medium text-textDark"
            />
          </div>
        </div>
      </div>

      {/* 3x2 REPORT CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reportsList.map((rep) => {
          const IconComponent = rep.icon;
          const isSelected = activeReportId === rep.id;
          const loadingThis = isGenerating && isSelected;

          return (
            <div
              key={rep.id}
              className={`bg-white rounded-2xl p-6 border transition-all duration-200 flex flex-col justify-between shadow-sm hover:shadow-md ${
                isSelected ? "border-gold ring-1 ring-gold bg-gold/5" : "border-border"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    isSelected ? "bg-gold text-white shadow-sm" : "bg-panel text-brownDark"
                  }`}>
                    <IconComponent className="w-6 h-6" />
                  </div>
                  {isSelected && (
                    <span className="text-xs font-semibold text-gold bg-white px-2.5 py-1 rounded-full border border-gold/30">
                      Active Report
                    </span>
                  )}
                </div>
                <h3 className="font-display text-lg font-semibold text-brownDark mb-1">
                  {rep.title}
                </h3>
                <p className="text-sm text-textMuted leading-relaxed mb-6">
                  {rep.description}
                </p>
              </div>

              <button
                onClick={() => handleGenerateReport(rep.id)}
                disabled={isGenerating}
                className="w-full bg-gold hover:bg-gold/90 text-white font-medium py-2.5 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loadingThis ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <span>Generate Report</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* RESULTS PANEL */}
      {activeReportObj && (
        <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden animate-in fade-in duration-200">
          <div className="p-5 sm:p-6 border-b border-border bg-panel/40 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <activeReportObj.icon className="w-5 h-5 text-gold" />
                <h3 className="font-display text-xl font-semibold text-brownDark">
                  {activeReportObj.title}
                </h3>
              </div>
              <p className="text-sm text-textMuted mt-1">
                {activeReportId === "total-inventory-data" ? (
                  "Inventory is current as of now"
                ) : activeReportId === "total-sales-month-wise" ? (
                  `Showing monthly data for ${reportData?.year || currentYear}`
                ) : (
                  `Date Range: ${activeRangeLabel}`
                )}
              </p>
            </div>

            <button
              onClick={handleExportCSV}
              disabled={!reportData || !reportData.rows || reportData.rows.length === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-brownDark bg-white border border-border rounded-xl shadow-sm hover:bg-panel transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4 text-textMuted" />
              Export CSV
            </button>
          </div>

          {activeReportId === "total-inventory-data" && (
            <div className="bg-amber-50 border-b border-amber-100 px-6 py-2.5 text-xs font-medium text-amber-800">
              Note: Inventory is current as of now (point-in-time snapshot, date range filters do not apply).
            </div>
          )}

          {isGenerating ? (
            <div className="p-16 text-center text-textMuted flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-gold" />
              <p className="font-medium text-sm">Computing report data...</p>
            </div>
          ) : !reportData || !reportData.rows || reportData.rows.length === 0 ? (
            <div className="p-16 text-center text-textMuted">
              No records found matching the selected criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* TABLE 1: Customer-wise Balance */}
              {activeReportId === "customer-wise-balance" && (
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
                      <td colSpan="2" className="py-4 px-6 text-right font-display text-brownDark">
                        Total Outstanding
                      </td>
                      <td className="py-4 px-6 text-right font-bold text-debit text-base">
                        ₹{reportData.summary?.totalOutstanding.toLocaleString('en-IN')}
                      </td>
                      <td colSpan="3"></td>
                    </tr>
                  </tfoot>
                </table>
              )}

              {/* TABLE 2: Customer-wise Sales */}
              {activeReportId === "customer-wise-sales" && (
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
                      <td className="py-4 px-6 text-right font-bold text-credit text-base">₹{reportData.summary?.total.toLocaleString('en-IN')}</td>
                    </tr>
                  </tfoot>
                </table>
              )}

              {/* TABLE 3: Total Inventory Data */}
              {activeReportId === "total-inventory-data" && (
                <table className="w-full text-left border-collapse min-w-[850px]">
                  <thead>
                    <tr className="bg-panel uppercase text-xs text-textMuted border-b border-border">
                      <th className="py-3.5 px-6 font-semibold">Item</th>
                      <th className="py-3.5 px-6 font-semibold">Category</th>
                      <th className="py-3.5 px-6 font-semibold">Bag Size</th>
                      <th className="py-3.5 px-6 font-semibold text-right">Stock (Bags)</th>
                      <th className="py-3.5 px-6 font-semibold text-right">Stock (Kg)</th>
                      <th className="py-3.5 px-6 font-semibold text-right">Rate (₹)</th>
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
                        <td className="py-3.5 px-6 text-sm text-right text-textMuted">₹{row.rate.toLocaleString('en-IN')}</td>
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
              {activeReportId === "total-sales-date-wise" && (
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
                      <tr key={row.id} className="hover:bg-panel/50 transition-colors">
                        <td className="py-3.5 px-6 text-sm font-medium text-textDark">{formatDateDisplay(row.dateObj || row.dateStr)}</td>
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
                      <td className="py-4 px-6 text-right font-bold text-credit text-base">₹{reportData.summary?.total.toLocaleString('en-IN')}</td>
                    </tr>
                  </tfoot>
                </table>
              )}

              {/* TABLE 5: Total Sales (Month-wise) */}
              {activeReportId === "total-sales-month-wise" && (
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
                      <tr key={row.id} className="hover:bg-panel/50 transition-colors">
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
                      <td className="py-4 px-6 text-right font-bold text-credit text-base">₹{reportData.summary?.total.toLocaleString('en-IN')}</td>
                    </tr>
                  </tfoot>
                </table>
              )}

              {/* TABLE 6: Item-wise Sales Data */}
              {activeReportId === "item-wise-sales-data" && (
                <table className="w-full text-left border-collapse min-w-[800px]">
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
                      <tr key={row.id} className="hover:bg-panel/50 transition-colors">
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
                      <td className="py-4 px-6 text-right font-bold text-credit text-base">₹{reportData.summary?.total.toLocaleString('en-IN')}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
