import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { IndianRupee, Users, AlertTriangle, TrendingUp, ChevronDown, ChevronRight, ShoppingBag } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getWeekSales, getTodayStats, getDashboardRecentSales, getDashboardRecentPurchases } from '../firebase/dashboard';
import { useToast } from '../context/ToastContext';

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [weekSales, setWeekSales] = useState([]);
  const [stats, setStats] = useState({
    todaySales: 0,
    todayPurchases: 0,
    overdueCustomers: 0,
    lowStockItems: 0
  });
  const [recentSales, setRecentSales] = useState([]);
  const [recentPurchases, setRecentPurchases] = useState([]);
  
  const [salesOpen, setSalesOpen] = useState(true);
  const [purchasesOpen, setPurchasesOpen] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [weekData, statsData, salesData, purchData] = await Promise.all([
          getWeekSales(),
          getTodayStats(),
          getDashboardRecentSales(7),
          getDashboardRecentPurchases(5)
        ]);

        setWeekSales(weekData);
        setStats(statsData);
        setRecentSales(salesData);
        setRecentPurchases(purchData);
      } catch (error) {
        console.error("Dashboard fetch error:", error);
        showToast("Failed to load dashboard data", "error");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = typeof dateStr === 'string' ? new Date(dateStr) : new Date(dateStr.toDate());
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  };

  const formatCurrency = (amount) => {
    return '₹' + (amount || 0).toLocaleString('en-IN');
  };

  // Custom Tooltip for BarChart
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

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Skeleton Top Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white h-28 rounded-2xl animate-pulse border border-border/50"></div>
          ))}
        </div>
        {/* Skeleton Chart */}
        <div className="bg-white h-[350px] rounded-2xl animate-pulse border border-border/50"></div>
        {/* Skeleton Bottom Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white h-64 rounded-2xl animate-pulse border border-border/50"></div>
          <div className="bg-white h-64 rounded-2xl animate-pulse border border-border/50"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* 4 STAT CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-border hover:shadow transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-textMuted mb-1">Today's Sales</p>
              <h3 className="font-display text-2xl font-bold text-brownDark">{formatCurrency(stats.todaySales)}</h3>
            </div>
            <div className="p-3 bg-gold/10 text-gold rounded-xl">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-border hover:shadow transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-textMuted mb-1">Today's Purchases</p>
              <h3 className="font-display text-2xl font-bold text-brownDark">{formatCurrency(stats.todayPurchases)}</h3>
            </div>
            <div className="p-3 bg-credit/10 text-credit rounded-xl">
              <ShoppingBag className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-border hover:shadow transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-textMuted mb-1">Overdue Customers</p>
              <h3 className="font-display text-2xl font-bold text-debit">{stats.overdueCustomers}</h3>
            </div>
            <div className="p-3 bg-debit/10 text-debit rounded-xl">
              <Users className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-border hover:shadow transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-textMuted mb-1">Low Stock Items</p>
              <h3 className="font-display text-2xl font-bold text-gold">{stats.lowStockItems}</h3>
            </div>
            <div className="p-3 bg-gold/10 text-gold rounded-xl">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      {/* BAR CHART */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-border">
        <h2 className="font-display text-lg font-semibold text-brownDark mb-6">Sales - Last 7 Days</h2>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekSales} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <XAxis 
                dataKey="day" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#7A5C3A', fontSize: 12 }} 
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#7A5C3A', fontSize: 12 }} 
                tickFormatter={(value) => `₹${value / 1000}k`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#FAF6EF', opacity: 0.8 }} />
              <Bar 
                dataKey="total" 
                fill="#C8912A" 
                radius={[6, 6, 0, 0]} 
                maxBarSize={50}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* BOTTOM PANELS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* RECENT SALES */}
        <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden flex flex-col h-full">
          <div className="p-5 border-b border-border bg-panel/30 flex justify-between items-center cursor-pointer hover:bg-panel/50 transition-colors" onClick={() => setSalesOpen(!salesOpen)}>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-lg font-semibold text-brownDark">Recent Sales</h2>
              {salesOpen ? <ChevronDown className="w-5 h-5 text-textMuted" /> : <ChevronRight className="w-5 h-5 text-textMuted" />}
            </div>
            <Link to="/sales" className="text-sm font-medium text-gold hover:text-gold/80 transition-colors" onClick={(e) => e.stopPropagation()}>
              View All
            </Link>
          </div>
          
          {salesOpen && (
            <div className="divide-y divide-border overflow-y-auto flex-1">
              {recentSales.length === 0 ? (
                <div className="p-8 text-center text-sm text-textMuted">No recent sales.</div>
              ) : (
                recentSales.map(sale => (
                  <div key={sale.id} className="p-4 hover:bg-panel/20 transition-colors flex justify-between items-center">
                    <div>
                      <p className="font-medium text-textDark mb-0.5">{sale.customerName}</p>
                      <div className="flex items-center gap-2 text-xs text-textMuted">
                        <span>{formatDate(sale.date)}</span>
                        <span>•</span>
                        <span className="truncate max-w-[120px]">{sale.items?.map(i => i.item).join(', ')}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-textDark">₹{sale.totalAmount.toLocaleString('en-IN')}</p>
                      <p className="text-xs text-textMuted mt-0.5">{sale.items?.reduce((sum, i) => sum + i.bags, 0)} bags</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* RECENT PURCHASES */}
        <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden flex flex-col h-full">
          <div className="p-5 border-b border-border bg-panel/30 flex justify-between items-center cursor-pointer hover:bg-panel/50 transition-colors" onClick={() => setPurchasesOpen(!purchasesOpen)}>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-lg font-semibold text-brownDark">Recent Purchases</h2>
              {purchasesOpen ? <ChevronDown className="w-5 h-5 text-textMuted" /> : <ChevronRight className="w-5 h-5 text-textMuted" />}
            </div>
            <Link to="/purchase" className="text-sm font-medium text-gold hover:text-gold/80 transition-colors" onClick={(e) => e.stopPropagation()}>
              View All
            </Link>
          </div>
          
          {purchasesOpen && (
            <div className="divide-y divide-border overflow-y-auto flex-1">
              {recentPurchases.length === 0 ? (
                <div className="p-8 text-center text-sm text-textMuted">No recent purchases.</div>
              ) : (
                recentPurchases.map(purchase => (
                  <div key={purchase.id} className="p-4 hover:bg-panel/20 transition-colors flex justify-between items-center">
                    <div>
                      <p className="font-medium text-textDark mb-0.5">{purchase.supplierName}</p>
                      <div className="flex items-center gap-2 text-xs text-textMuted">
                        <span>{formatDate(purchase.date)}</span>
                        <span>•</span>
                        <span className="truncate max-w-[120px]">{purchase.items?.map(i => i.item).join(', ')}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-textDark">₹{purchase.totalAmount.toLocaleString('en-IN')}</p>
                      <p className="text-xs text-textMuted mt-0.5">{purchase.items?.reduce((sum, i) => sum + i.bags, 0)} bags</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
