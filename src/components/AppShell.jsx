import { useState, useEffect, useContext, useRef, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard,
  Users,
  LineChart,
  Boxes,
  BarChart2,
  Star,
  LogOut,
  Bell,
  Search,
  Wheat,
  Menu,
  X,
  AlertCircle,
  ShoppingBag,
  BookOpen
} from 'lucide-react';
import { signOutUser } from '../firebase/auth';
import { AuthContext } from '../context/AuthContext';
import { getCustomers } from '../firebase/customers';
import { getItems } from '../firebase/items';
import { getTodayStats } from '../firebase/dashboard';

const NAV_LINKS = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Customers', path: '/customers', icon: Users },
  { name: 'Sales', path: '/sales', icon: LineChart },
  { name: 'Ledger', path: '/ledger', icon: BookOpen },
  { name: 'Purchase', path: '/purchase', icon: ShoppingBag },
  { name: 'Inventory', path: '/inventory', icon: Boxes },
  { name: 'Reports', path: '/reports', icon: BarChart2 },
  { name: 'Masters', path: '/masters', icon: Star },
];

export default function AppShell({ children, title }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Search & Bell State
  const [customers, setCustomers] = useState([]);
  const [items, setItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef(null);

  const [stats, setStats] = useState({ overdueCustomers: 0, lowStockItems: 0 });
  const [isBellOpen, setIsBellOpen] = useState(false);
  const bellRef = useRef(null);

  useEffect(() => {
    const initData = async () => {
      try {
        const [custData, itemData, statData] = await Promise.all([
          getCustomers(),
          getItems(),
          getTodayStats()
        ]);
        setCustomers(custData || []);
        setItems(itemData || []);
        setStats(statData || { overdueCustomers: 0, lowStockItems: 0 });
      } catch (err) {
        console.error("Error loading shell data:", err);
      }
    };
    initData();
  }, [location.pathname]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setIsSearchOpen(false);
      }
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setIsBellOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setIsBellOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const searchResults = useMemo(() => {
    if (!debouncedQuery.trim()) return { customers: [], items: [], total: 0 };
    const q = debouncedQuery.toLowerCase();
    
    const matchedCust = customers.filter(c => 
      (c.name && c.name.toLowerCase().includes(q)) || 
      (c.mobile && String(c.mobile).includes(q))
    ).slice(0, 6);

    const rem = 6 - matchedCust.length;
    const matchedItems = rem > 0 ? items.filter(i => 
      i.name && i.name.toLowerCase().includes(q)
    ).slice(0, rem) : [];

    return {
      customers: matchedCust,
      items: matchedItems,
      total: matchedCust.length + matchedItems.length
    };
  }, [debouncedQuery, customers, items]);

  const handleSelectCustomer = (id) => {
    setIsSearchOpen(false);
    setSearchQuery('');
    navigate(`/customers/${id}`);
  };

  const handleSelectItem = (id) => {
    setIsSearchOpen(false);
    setSearchQuery('');
    navigate('/masters', { state: { highlightItemId: id } });
  };

  const handleLogout = async () => {
    try {
      await signOutUser();
      navigate('/login');
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden block"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-[240px] bg-brownDark border-r border-border/20 text-cream flex flex-col transform transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:static md:translate-x-0
      `}>
        {/* Logo Section */}
        <div className="pt-4 pb-2 px-4 relative flex flex-col items-center justify-center">
          <img 
            src="/logo.jpeg" 
            alt="SKB Rice MUNDY Logo" 
            className="h-[60px] w-auto max-w-[80%] mx-auto object-contain rounded"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling.style.display = 'flex';
            }}
          />
          <div className="hidden items-center gap-2 font-display text-lg font-bold text-cream mx-auto">
            SKB MUNDY
          </div>
          <button 
            className="text-cream/70 hover:text-cream md:hidden absolute top-4 right-4 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
            onClick={closeSidebar}
            aria-label="Close menu"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {NAV_LINKS.map((link) => {
            const isActive = location.pathname.startsWith(link.path);
            const Icon = link.icon;
            
            return (
              <Link
                key={link.path}
                to={link.path}
                onClick={closeSidebar}
                className={`flex items-center gap-3 px-3 py-2.5 transition-all rounded-lg min-h-[44px] ${
                  isActive 
                    ? 'font-bold bg-gold/20 text-cream' 
                    : 'text-cream/70 hover:text-cream hover:bg-white/5'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="text-sm">{link.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t border-border/20 bg-brownDark">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gold flex items-center justify-center text-white font-bold shrink-0 uppercase">
              {user?.email?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-cream truncate">{user?.email || 'User'}</p>
              <p className="text-xs text-cream/70 truncate capitalize">{user?.role || 'Staff'}</p>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 text-cream/70 hover:text-cream transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-[68px] bg-bg border-b border-border flex items-center justify-between px-3 sm:px-7 py-4 shrink-0 gap-2 sm:gap-4 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
            <button 
              className="p-2.5 -ml-2 text-textMuted hover:text-textDark md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="md:hidden flex items-center mr-1 shrink-0">
              <img 
                src="/logo.jpeg" 
                alt="SKB Rice MUNDY Logo" 
                className="h-[36px] w-auto object-contain rounded"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling.style.display = 'inline';
                }}
              />
              <span className="hidden font-display font-bold text-textDark text-base">SKB</span>
            </div>
            <h1 className="font-display text-[18px] sm:text-[22px] font-semibold text-textDark truncate max-w-[110px] sm:max-w-none">
              {title}
            </h1>
          </div>

          <div className="flex-1 flex justify-end sm:justify-center max-w-md ml-auto sm:mx-8 min-w-0" ref={searchRef}>
            <div className="relative w-full max-w-[320px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
              <input 
                type="text" 
                value={searchQuery}
                onFocus={() => setIsSearchOpen(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                placeholder="Search..." 
                className="w-full border border-border bg-panel rounded-full pl-9 pr-3 py-2 text-base sm:text-sm text-textDark placeholder:text-textMuted focus:outline-none focus:ring-2 focus:ring-gold/50 transition-all"
              />

              {/* Search Dropdown */}
              {isSearchOpen && searchQuery.trim() && (
                <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-border overflow-hidden z-50 max-h-[400px] overflow-y-auto">
                  {searchResults.total === 0 ? (
                    <div className="p-4 text-center text-sm text-textMuted">
                      No matches for '{searchQuery}'
                    </div>
                  ) : (
                    <div className="py-2">
                      {searchResults.customers.length > 0 && (
                        <div>
                          <div className="px-4 py-1.5 text-[10px] font-bold tracking-wider uppercase text-textMuted bg-panel">
                            Customers
                          </div>
                          {searchResults.customers.map(c => (
                            <div 
                              key={c.id}
                              onClick={() => handleSelectCustomer(c.id)}
                              className="px-4 py-2.5 hover:bg-panel/50 cursor-pointer flex items-center justify-between transition-colors"
                            >
                              <span className="text-sm font-medium text-textDark">{c.name}</span>
                              <span className="text-xs text-textMuted">{c.mobile}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {searchResults.items.length > 0 && (
                        <div>
                          <div className="px-4 py-1.5 text-[10px] font-bold tracking-wider uppercase text-textMuted bg-panel border-t border-border mt-1">
                            Items
                          </div>
                          {searchResults.items.map(i => (
                            <div 
                              key={i.id}
                              onClick={() => handleSelectItem(i.id)}
                              className="px-4 py-2.5 hover:bg-panel/50 cursor-pointer flex items-center justify-between transition-colors"
                            >
                              <span className="text-sm font-medium text-textDark">{i.name}</span>
                              <span className="text-xs text-textMuted">₹{i.rate} · {i.categoryKey}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center relative shrink-0" ref={bellRef}>
            <button 
              onClick={() => setIsBellOpen(!isBellOpen)}
              className="p-2.5 rounded-full hover:bg-panel text-textDark transition-colors relative min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              {(stats.overdueCustomers + stats.lowStockItems > 0) && (
                <span className="absolute top-2 right-2 w-2 h-2 bg-debit rounded-full ring-2 ring-bg animate-pulse"></span>
              )}
            </button>

            {/* Notification Dropdown */}
            {isBellOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-border overflow-hidden z-50 p-2">
                <div className="px-3 py-2 border-b border-border mb-1">
                  <span className="font-display font-semibold text-sm text-textDark">Notifications</span>
                </div>
                {(stats.overdueCustomers === 0 && stats.lowStockItems === 0) ? (
                  <div className="p-4 text-center text-sm text-textMuted flex flex-col items-center gap-1">
                    <span className="text-xl">🎉</span>
                    <span>You're all caught up</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {stats.overdueCustomers > 0 && (
                      <div 
                        onClick={() => { setIsBellOpen(false); navigate('/customers'); }}
                        className="p-3 rounded-xl bg-debit/10 hover:bg-debit/15 cursor-pointer transition-colors flex items-center gap-3"
                      >
                        <AlertCircle className="w-5 h-5 text-debit shrink-0" />
                        <span className="text-sm font-medium text-debit leading-snug">
                          {stats.overdueCustomers} {stats.overdueCustomers === 1 ? 'customer' : 'customers'} overdue
                        </span>
                      </div>
                    )}
                    {stats.lowStockItems > 0 && (
                      <div 
                        onClick={() => { setIsBellOpen(false); navigate('/inventory'); }}
                        className="p-3 rounded-xl bg-gold/10 hover:bg-gold/15 cursor-pointer transition-colors flex items-center gap-3"
                      >
                        <Boxes className="w-5 h-5 text-gold shrink-0" />
                        <span className="text-sm font-medium text-gold leading-snug">
                          {stats.lowStockItems} {stats.lowStockItems === 1 ? 'item' : 'items'} low on stock
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-7">
          {children}
        </main>
      </div>
    </div>
  );
}
