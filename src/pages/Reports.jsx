import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, BarChart3, Package, Calendar, 
  CalendarDays, Tag, ArrowRight, Filter,
  Truck, Scale, Warehouse, Wallet, Boxes, Layers
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { getQuickStats } from '../firebase/reports';
import { getISTDateString, getISTTodayDateString, getISTTodayAsUtcMidnight } from '../utils/dateIST';

export default function Reports() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [quickStats, setQuickStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    getQuickStats()
      .then(data => setQuickStats(data))
      .catch(err => console.error("Error loading quick stats:", err))
      .finally(() => setStatsLoading(false));
  }, []);

  // "Today" here means today in IST, regardless of the viewing device's own timezone.
  const [currentYear, currentMonthIdx] = getISTTodayDateString().split('-').map(Number).map((n, i) => i === 1 ? n - 1 : n);

  const pad2 = (n) => String(n).padStart(2, '0');
  const toISODate = (year, monthIdx, day) => `${year}-${pad2(monthIdx + 1)}-${pad2(day)}`;

  const getFirstDayOfMonth = (year, monthIdx) => toISODate(year, monthIdx, 1);
  const getLastDayOfMonth = (year, monthIdx) => {
    // Day-count math only (not a real instant) — UTC avoids any local-timezone shift.
    const lastDay = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
    return toISODate(year, monthIdx, lastDay);
  };

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
  const [fromDate, setFromDate] = useState(getFirstDayOfMonth(defaultMonthOpt.year, defaultMonthOpt.monthIdx));
  const [toDate, setToDate] = useState(getLastDayOfMonth(defaultMonthOpt.year, defaultMonthOpt.monthIdx));
  const [activePill, setActivePill] = useState("This Month");

  const handleMonthChange = (val) => {
    setSelectedMonth(val);
    setActivePill("");
    if (!val) return;
    const [yStr, mStr] = val.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    setFromDate(getFirstDayOfMonth(y, m));
    setToDate(getLastDayOfMonth(y, m));
  };

  const handlePillClick = (pill) => {
    setActivePill(pill);
    if (pill === "Today") {
      const dStr = getISTTodayDateString();
      setFromDate(dStr);
      setToDate(dStr);
      setSelectedMonth("");
    } else if (pill === "This Week") {
      // Monday-start week, computed on the IST calendar day (not the device's local day).
      const todayAnchor = getISTTodayAsUtcMidnight();
      const day = todayAnchor.getUTCDay();
      const diff = todayAnchor.getUTCDate() - day + (day === 0 ? -6 : 1);
      const startOfWeek = new Date(todayAnchor);
      startOfWeek.setUTCDate(diff);
      setFromDate(getISTDateString(startOfWeek));
      setToDate(getISTTodayDateString());
      setSelectedMonth("");
    } else if (pill === "This Month" || pill === "Clear filters") {
      setSelectedMonth(defaultMonthOpt.value);
      setFromDate(getFirstDayOfMonth(defaultMonthOpt.year, defaultMonthOpt.monthIdx));
      setToDate(getLastDayOfMonth(defaultMonthOpt.year, defaultMonthOpt.monthIdx));
      if (pill === "Clear filters") setActivePill("This Month");
    }
  };

  const reportsList = [
    {
      id: "customer-wise-balance",
      title: "Customer-wise Balance",
      description: "Outstanding & credit by customer.",
      icon: Users
    },
    {
      id: "customer-wise-sales",
      title: "Customer-wise Sales",
      description: "Total sales value per customer.",
      icon: BarChart3
    },
    {
      id: "total-inventory-data",
      title: "Total Inventory Data",
      description: "Stock & value across all items.",
      icon: Package
    },
    {
      id: "total-sales-date-wise",
      title: "Total Sales (Date-wise)",
      description: "Daily sales totals for a range.",
      icon: Calendar
    },
    {
      id: "total-sales-month-wise",
      title: "Total Sales (Month-wise)",
      description: "Monthly sales totals this year.",
      icon: CalendarDays
    },
    {
      id: "item-wise-sales-data",
      title: "Item-wise Sales Data",
      description: "Quantity & value sold per item.",
      icon: Tag
    },
    {
      id: "sales-current-stock",
      title: "Current Stock Report",
      description: "Bags in stock per item with current MRP value.",
      icon: Boxes
    }
  ];

  const purchaseReportsList = [
    {
      id: "purchase-supplier-wise",
      title: "Supplier-wise Purchases",
      description: "Total purchase value per supplier.",
      icon: Truck
    },
    {
      id: "purchase-category-pnl",
      title: "Category-wise Purchase vs Sale (P&L)",
      description: "Profit or loss per category based on buying and selling prices.",
      icon: Scale
    },
    {
      id: "purchase-item-wise",
      title: "Item-wise Purchase Data",
      description: "Quantity and cost per item purchased.",
      icon: Tag
    },
    {
      id: "purchase-category-stock",
      title: "Current Stock by Category (Value)",
      description: "Stock remaining and its value per category.",
      icon: Warehouse
    },
    {
      id: "purchase-date-wise",
      title: "Purchase History (Date-wise)",
      description: "Daily purchase totals for a range.",
      icon: Calendar
    },
    {
      id: "purchase-supplier-balance",
      title: "Supplier Balance Report",
      description: "How much is owed to each supplier.",
      icon: Wallet
    },
    {
      id: "purchase-stock-by-variety",
      title: "Stock Summary by Variety",
      description: "Total bags and stock value grouped by category.",
      icon: Layers
    }
  ];

  const handleGenerateReport = (repId) => {
    if (!fromDate || !toDate) {
      showToast("Please select valid From and To dates", "error");
      return;
    }
    if (new Date(fromDate) > new Date(toDate)) {
      showToast("From Date cannot be later than To Date", "error");
      return;
    }

    navigate('/reports/result', {
      state: {
        reportType: repId,
        filters: { from: fromDate, to: toDate, selectedMonth }
      }
    });
  };

  return (
    <div className="space-y-8 pb-12">
      {/* ── QUICK STATS TILES ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {statsLoading ? (
          <>
            {[1, 2, 3].map((n) => (
              <div key={n} className="bg-white rounded-2xl p-5 border border-border shadow-sm animate-pulse space-y-3">
                <div className="h-4 bg-panel rounded w-1/2" />
                <div className="h-8 bg-panel rounded w-3/4" />
                <div className="h-3 bg-panel/70 rounded w-1/3" />
              </div>
            ))}
          </>
        ) : (
          <>
            {/* TILE 1 */}
            <div
              onClick={() => navigate('/reports/result', {
                state: {
                  reportType: 'customer-wise-balance',
                  filters: { from: fromDate, to: toDate, selectedMonth }
                }
              })}
              className="bg-white rounded-2xl p-5 border border-border shadow-sm hover:shadow-md hover:border-gold/40 transition-all duration-200 cursor-pointer flex flex-col justify-between group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-textMuted group-hover:text-brownDark transition-colors">
                  Total Outstanding
                </span>
                <div className="w-9 h-9 rounded-xl bg-red-50 text-debit flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="font-display text-2xl lg:text-3xl font-bold text-debit mb-1">
                  ₹{(quickStats?.totalOutstanding || 0).toLocaleString('en-IN')}
                </div>
                <div className="text-xs font-medium text-textMuted flex items-center justify-between">
                  <span>{quickStats?.customersWithDues || 0} customers with dues</span>
                  <span className="text-gold font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    View report <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            </div>

            {/* TILE 2 */}
            <div
              onClick={() => {
                const nowStr = getISTTodayDateString();
                navigate('/reports/result', {
                  state: {
                    reportType: 'total-sales-date-wise',
                    filters: { from: nowStr, to: nowStr, selectedMonth: '' }
                  }
                });
              }}
              className="bg-white rounded-2xl p-5 border border-border shadow-sm hover:shadow-md hover:border-gold/40 transition-all duration-200 cursor-pointer flex flex-col justify-between group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-textMuted group-hover:text-brownDark transition-colors">
                  Today's Sales
                </span>
                <div className="w-9 h-9 rounded-xl bg-gold/15 text-gold flex items-center justify-center">
                  <BarChart3 className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="font-display text-2xl lg:text-3xl font-bold text-gold mb-1">
                  ₹{(quickStats?.todaysSales || 0).toLocaleString('en-IN')}
                </div>
                <div className="text-xs font-medium text-textMuted flex items-center justify-between">
                  <span>{quickStats?.todaysBills || 0} bills · {quickStats?.todaysBags || 0} bags</span>
                  <span className="text-gold font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    View report <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            </div>

            {/* TILE 3 */}
            <div
              onClick={() => navigate('/reports/result', {
                state: {
                  reportType: 'purchase-supplier-wise',
                  filters: { from: fromDate, to: toDate, selectedMonth }
                }
              })}
              className="bg-white rounded-2xl p-5 border border-border shadow-sm hover:shadow-md hover:border-gold/40 transition-all duration-200 cursor-pointer flex flex-col justify-between group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-textMuted group-hover:text-brownDark transition-colors">
                  Supplier Balance Payable
                </span>
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="font-display text-2xl lg:text-3xl font-bold text-amber-600 mb-1">
                  ₹{(quickStats?.supplierBalancePayable || 0).toLocaleString('en-IN')}
                </div>
                <div className="text-xs font-medium text-textMuted flex items-center justify-between">
                  <span>{quickStats?.suppliersWithPayables || 0} suppliers with payables</span>
                  <span className="text-gold font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    View report <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

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

      {/* SALES REPORTS SECTION */}
      <div className="space-y-4">
        <h2 className="font-display text-xl font-bold text-brownDark flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-gold" />
          Sales Reports
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reportsList.map((rep) => {
            const IconComponent = rep.icon;

            return (
              <div
                key={rep.id}
                className="bg-white rounded-2xl p-6 border border-border transition-all duration-200 flex flex-col justify-between shadow-sm hover:shadow-md hover:border-gold/40"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-panel text-brownDark flex items-center justify-center">
                      <IconComponent className="w-6 h-6" />
                    </div>
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
                  className="w-full bg-gold hover:bg-gold/90 text-white font-medium py-2.5 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 text-sm group"
                >
                  <span>Generate Report</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* PURCHASE REPORTS SECTION */}
      <div className="space-y-4 pt-4">
        <h2 className="font-display text-xl font-bold text-brownDark flex items-center gap-2">
          <Truck className="w-6 h-6 text-gold" />
          Purchase Reports
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {purchaseReportsList.map((rep) => {
            const IconComponent = rep.icon;

            return (
              <div
                key={rep.id}
                className="bg-white rounded-2xl p-6 border border-border transition-all duration-200 flex flex-col justify-between shadow-sm hover:shadow-md hover:border-gold/40"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-panel text-brownDark flex items-center justify-center">
                      <IconComponent className="w-6 h-6" />
                    </div>
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
                  className="w-full bg-gold hover:bg-gold/90 text-white font-medium py-2.5 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 text-sm group"
                >
                  <span>Generate Report</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
