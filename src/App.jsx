import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/AppShell';
import Login from './pages/Login';

// Pages
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import CustomerDetails from './pages/CustomerDetails';
import Sales from './pages/Sales';
import Ledger from './pages/Ledger';
import Inventory from './pages/Inventory';
import Reports from './pages/Reports';
import ReportResultPage from './pages/ReportResultPage';
import Masters from './pages/Masters';
import PurchasePage from './pages/PurchasePage';
import SupplierDetails from './pages/SupplierDetails';

function App() {
  return (
    <Router>
      <Routes>
        {/* Public Route */}
        <Route path="/login" element={<Login />} />
        
        {/* Protected Routes wrapped in AppShell */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <AppShell title="Dashboard"><Dashboard /></AppShell>
          </ProtectedRoute>
        } />
        
        <Route path="/customers" element={
          <ProtectedRoute>
            <AppShell title="Customers"><Customers /></AppShell>
          </ProtectedRoute>
        } />
        
        <Route path="/customers/:id" element={
          <ProtectedRoute>
            <AppShell title="Customer Details"><CustomerDetails /></AppShell>
          </ProtectedRoute>
        } />
        
        <Route path="/sales" element={
          <ProtectedRoute>
            <AppShell title="Sales"><Sales /></AppShell>
          </ProtectedRoute>
        } />

        <Route path="/ledger" element={
          <ProtectedRoute>
            <AppShell title="Ledger"><Ledger /></AppShell>
          </ProtectedRoute>
        } />

        <Route path="/purchase" element={
          <ProtectedRoute>
            <AppShell title="Purchase"><PurchasePage /></AppShell>
          </ProtectedRoute>
        } />
        
        <Route path="/inventory" element={
          <ProtectedRoute>
            <AppShell title="Inventory"><Inventory /></AppShell>
          </ProtectedRoute>
        } />
        
        <Route path="/reports/result" element={
          <ProtectedRoute>
            <AppShell title="Report Results"><ReportResultPage /></AppShell>
          </ProtectedRoute>
        } />

        <Route path="/reports" element={
          <ProtectedRoute>
            <AppShell title="Reports"><Reports /></AppShell>
          </ProtectedRoute>
        } />
        
        <Route path="/masters" element={
          <ProtectedRoute>
            <AppShell title="Masters"><Masters /></AppShell>
          </ProtectedRoute>
        } />

        <Route path="/suppliers/:id" element={
          <ProtectedRoute>
            <AppShell title="Supplier Details"><SupplierDetails /></AppShell>
          </ProtectedRoute>
        } />
        
        {/* Redirect root to dashboard */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
