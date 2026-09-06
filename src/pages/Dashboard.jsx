import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { IndianRupee, Users, AlertTriangle, TrendingUp, Package } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getWeekSales, getTodayStats, getDashboardRecentSales } from '../firebase/dashboard';
import { useToast } from '../context/ToastContext';
import { formatRelativeDateIST } from '../utils/dateIST';
import { LOW_STOCK_THRESHOLD } from '../utils/constants';
import NewPurchaseModal from '../components/NewPurchaseModal';

export default function Dashboard() {
  const [loading, setLoading] = useState(true);

  const [isNewPurchaseOpen, setIsNewPurchaseOpen] = useState(false);
  const [weekSales, setWeekSales] = useState([]);
  const [stats, setStats] = useState({
    todaySales: 0,
    todaySalesCount: 0,
    todayBagsMoved: 0,
    totalOutstanding: 0,
    grossReceivable: 0,
    advanceHeld: 0,
    overdueAmount: 0,
    overdueCustomers: 0,
    currentStockBags: 0,
    varietiesCount: 0,
    lowStockItems: 0,
    items: []
  });
  const [recentSales, setRecentSales] = useState([]);
  
  const { showToast } = useToast();

  const fetchDashboardData = async () => {
    try {
      const [weekData, statsData, salesData] = await Promise.all([
        getWeekSales(),
        getTodayStats(),
        getDashboardRecentSales(8)
      ]);

      setWeekSales(weekData);
      setStats(statsData);
      setRecentSales(salesData);
    } catch (error) {
      console.error("Dashboard fetch error:", error);
      showToast("Failed to load dashboard data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const formatRelativeDate = (dateVal) => formatRelativeDateIST(dateVal);

  const formatCurrency = (amount) => {
    return '₹' + (amount || 0).toLocaleString('en-IN');
  };

  // Custom Tooltip for AreaChart
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-border rounded-lg shadow-sm">
          <p className="text-sm font-medium text-textMuted mb-1">{label}</p>
          <p className="font-bold text-brownDark">
            {formatCurrency(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  const CustomXAxisTick = ({ x, y, payload }) => {
    const isToday = payload && payload.index === weekSales.length - 1;
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={14}
          textAnchor="middle"
          fill={isToday ? '#C8912A' : '#7A5C3A'}
          fontWeight={isToday ? 'bold' : 'normal'}
          fontSize={12}
        >
          {payload.value}
        </text>
      </g>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white h-28 rounded-2xl animate-pulse border border-border/50"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white h-[360px] rounded-2xl animate-pulse border border-border/50"></div>
          <div className="lg:col-span-5 bg-white h-[360px] rounded-2xl animate-pulse border border-border/50"></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white h-72 rounded-2xl animate-pulse border border-border/50"></div>
          <div className="lg:col-span-4 bg-white h-72 rounded-2xl animate-pulse border border-border/50"></div>
        </div>
      </div>
    );
  }

  // Week Total and Peak Day
  const weekTotal = weekSales.reduce((sum, d) => sum + (d.total || 0), 0);
  const peakDay = weekSales.reduce((max, d) => (d.total > max.total ? d : max), { day: '-', total: 0 });

  // Top 8 Stock Varieties
  const topStockItems = (stats.items || [])
    .map(i => ({
      ...i,
      bags: Number(i.stock || 0)
    }))
    .sort((a, b) => b.bags - a.bags)
    .slice(0, 8);
  const maxStockBags = topStockItems[0]?.bags || 1;

  // Critically Low Stock Item
  const lowStockItemsList = (stats.items || [])
    .filter(i => Number(i.stock) < LOW_STOCK_THRESHOLD)
    .map(i => ({
      ...i,
      bagsAmount: Number(i.stock || 0)
    }))
    .sort((a, b) => a.bagsAmount - b.bagsAmount);
  const criticallyLowItem = lowStockItemsList[0];

  return (
    <div className="space-y-6">
      {/* ROW 1: 3 STAT CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {/* TOTAL OUTSTANDING */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-border hover:shadow transition-shadow flex justify-between items-start">
          <div>
            <p className="text-sm font-medium text-textMuted mb-1 uppercase tracking-wider text-xs">Total Outstanding</p>
            <h3 className="font-display text-2xl font-bold text-brownDark">{formatCurrency(stats.totalOutstanding)}</h3>
            {/* Overdue is a subset of what customers owe, so it is shown against the
                gross receivable. When we also hold advances, the net headline above is
                lower than the gross — say so explicitly rather than leaving a reader to
                wonder how "overdue" can exceed "outstanding". */}
            <p className="text-xs font-semibold text-debit mt-1">
              ₹{(stats.overdueAmount || 0).toLocaleString('en-IN')} overdue
              {(stats.advanceHeld || 0) > 0 && (
                <span className="text-textMuted font-medium">
                  {' '}of ₹{(stats.grossReceivable || 0).toLocaleString('en-IN')} due
                </span>
              )}
            </p>
            {(stats.advanceHeld || 0) > 0 && (
              <p className="text-xs text-credit mt-0.5">
                ₹{(stats.advanceHeld || 0).toLocaleString('en-IN')} held as advances
              </p>
            )}
          </div>
          <div className="p-3 bg-debit/10 text-debit rounded-xl">
            <IndianRupee className="w-6 h-6" />
          </div>
        </div>

        {/* TODAY'S SALES */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-border hover:shadow transition-shadow flex justify-between items-start">
          <div>
            <p className="text-sm font-medium text-textMuted mb-1 uppercase tracking-wider text-xs">Today's Sales</p>
            <h3 className="font-display text-2xl font-bold text-brownDark">{formatCurrency(stats.todaySales)}</h3>
            <p className="text-xs text-textMuted mt-1">{stats.todaySalesCount || 0} sales · {(stats.todayBagsMoved || 0).toLocaleString('en-IN')} bags moved</p>
          </div>
          <div className="p-3 bg-gold/10 text-gold rounded-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* CURRENT STOCK */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-border hover:shadow transition-shadow flex justify-between items-start">
          <div>
            <p className="text-sm font-medium text-textMuted mb-1 uppercase tracking-wider text-xs">Current Stock</p>
            <h3 className="font-display text-2xl font-bold text-brownDark">{(stats.currentStockBags || 0).toLocaleString('en-IN')} bags</h3>
            <p className="text-xs text-textMuted mt-1">across {stats.varietiesCount || 0} varieties</p>
          </div>
          <div className="p-3 bg-brownDark/10 text-brownDark rounded-xl">
            <Package className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* ROW 2: MIDDLE ROW (55% / 45% SPLIT) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT: SALES LAST 7 DAYS LINE/AREA CHART */}
        <div className="lg:col-span-7 bg-white p-6 rounded-2xl shadow-sm border border-border flex flex-col">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="font-display text-lg font-semibold text-brownDark">Sales — Last 7 Days</h2>
              <p className="text-xs text-textMuted mt-0.5">Peak {formatCurrency(peakDay.total)} on {peakDay.day}</p>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold text-textMuted uppercase tracking-wider block">Week Total</span>
              <span className="font-display text-lg font-bold text-gold">{formatCurrency(weekTotal)}</span>
            </div>
          </div>

          <div className="h-[260px] w-full shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weekSales} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#C8912A" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#FAF6EF" stopOpacity={0.05}/>
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  tick={<CustomXAxisTick />}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#7A5C3A', fontSize: 12 }} 
                  tickFormatter={(value) => value >= 1000 ? `₹${(value / 1000).toLocaleString('en-IN')}k` : `₹${value}`}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#C8912A', strokeWidth: 1, strokeDasharray: '3 3' }} />
                <Area 
                  type="monotone" 
                  dataKey="total" 
                  stroke="#C8912A" 
                  strokeWidth={2.5} 
                  fillOpacity={1} 
                  fill="url(#goldGradient)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* RIGHT: STOCK BY VARIETY */}
        <div className="lg:col-span-5 bg-white p-6 rounded-2xl shadow-sm border border-border flex flex-col">
          <h2 className="font-display text-lg font-semibold text-brownDark mb-5">Stock by Variety</h2>
          
          <div className="space-y-4 flex-1 overflow-y-auto pr-1">
            {topStockItems.length === 0 ? (
              <div className="py-12 text-center text-sm text-textMuted">No stock data available.</div>
            ) : (
              topStockItems.map(item => (
                <div key={item.id} className="space-y-1.5">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-medium text-textDark truncate max-w-[200px]">{item.name}</span>
                    <span className="font-semibold text-brownDark">{item.bags.toLocaleString('en-IN')} bags</span>
                  </div>
                  <div className="w-full h-2 bg-panel rounded-full overflow-hidden border border-border/40">
                    <div 
                      className="h-full bg-gold rounded-full transition-all duration-500"
                      style={{ width: `${Math.max((item.bags / maxStockBags) * 100, 2)}%` }}
                    ></div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* ROW 3: BOTTOM ROW (WIDER LEFT, NARROWER RIGHT) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT: RECENT TRANSACTIONS */}
        <div className="lg:col-span-8 bg-white rounded-2xl shadow-sm border border-border overflow-hidden flex flex-col">
          <div className="p-5 border-b border-border bg-panel/30 flex justify-between items-center">
            <h2 className="font-display text-lg font-semibold text-brownDark">Recent Transactions</h2>
            <Link to="/sales" className="text-sm font-medium text-gold hover:text-gold/80 transition-colors">
              View all →
            </Link>
          </div>
          
          <div className="divide-y divide-border overflow-y-auto flex-1">
            {recentSales.length === 0 ? (
              <div className="p-8 text-center text-sm text-textMuted">No recent transactions.</div>
            ) : (
              recentSales.map(sale => {
                const totalKgMoved = sale.items?.reduce((sum, i) => sum + (Number(i.bags || 0) * Number(i.bagKg || i.kg || 0)), 0) || 0;
                const itemsStr = sale.items?.map(i => i.item || i.name).join(', ') || 'Items';
                return (
                  <div key={sale.id} className="p-4 hover:bg-panel/20 transition-colors flex items-center justify-between gap-4">
                    <div className="min-w-[140px] max-w-[180px]">
                      <p className="font-bold text-textDark text-sm truncate">{sale.customerName}</p>
                      <p className="text-xs text-textMuted mt-0.5">{formatRelativeDate(sale.date)}</p>
                    </div>
                    
                    <div className="flex-1 text-center truncate px-2">
                      <p className="text-sm text-textMuted truncate" title={`${itemsStr} · ${totalKgMoved} kg moved`}>
                        {itemsStr} · <span className="font-medium text-textDark">{totalKgMoved} kg moved</span>
                      </p>
                    </div>
                    
                    <div className="text-right min-w-[100px]">
                      <p className="font-bold text-textDark text-sm">₹{sale.totalAmount?.toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT: QUICK ACTIONS & LOW STOCK ALERT */}
        <div className="lg:col-span-4 flex flex-col justify-between gap-6">
          <div className="space-y-3 bg-white p-6 rounded-2xl shadow-sm border border-border">
            <h3 className="font-display font-semibold text-brownDark text-base mb-3">Quick Actions</h3>
            <Link
              to="/sales"
              className="w-full bg-gold text-white py-3 px-4 rounded-xl font-medium shadow-sm hover:bg-gold/90 transition-colors flex items-center justify-center gap-2 text-sm"
            >
              + New Sale
            </Link>
            <Link
              to="/customers?action=payment"
              className="w-full bg-white border border-brownDark text-gold py-3 px-4 rounded-xl font-medium shadow-sm hover:bg-panel transition-colors flex items-center justify-center gap-2 text-sm"
            >
              + Record Payment
            </Link>
            <button
              onClick={() => setIsNewPurchaseOpen(true)}
              className="w-full bg-white border border-brownDark text-gold py-3 px-4 rounded-xl font-medium shadow-sm hover:bg-panel transition-colors flex items-center justify-center gap-2 text-sm"
            >
              + New Purchase
            </button>
          </div>

          {criticallyLowItem && (
            <div className="bg-panel border border-border rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 text-brownDark font-semibold text-xs uppercase tracking-wider mb-2">
                <AlertTriangle className="w-4 h-4 text-debit" />
                <span>Low Stock</span>
              </div>
              <p className="font-bold text-brownDark text-lg">{criticallyLowItem.name}</p>
              <p className="text-debit font-bold text-sm mt-0.5">
                {criticallyLowItem.bagsAmount.toLocaleString('en-IN')} bags left
              </p>
            </div>
          )}
        </div>

      </div>

      <NewPurchaseModal
        isOpen={isNewPurchaseOpen}
        onClose={() => setIsNewPurchaseOpen(false)}
        onSuccess={fetchDashboardData}
      />
    </div>
  );
}
