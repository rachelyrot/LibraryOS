import { Toaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Login from '@/pages/Login';
import ResetPassword from '@/pages/ResetPassword';
import Layout from '@/components/Layout';
import RequirePage from '@/components/RequirePage';
import Dashboard from '@/pages/Dashboard';
import Orders from '@/pages/Orders';
import OrderDetail from '@/pages/OrderDetail';
import Quotes from '@/pages/Quotes';
import Inventory from '@/pages/Inventory';
import BookProcurement from '@/pages/BookProcurement';
import Credits from '@/pages/Credits';
import Suppliers from '@/pages/Suppliers';
import SupplierDetail from '@/pages/SupplierDetail';
import Settings from '@/pages/Settings';
import Staff from '@/pages/Staff';
import Projects from '@/pages/Projects';
import ProjectDetail from '@/pages/ProjectDetail';
import Users from '@/pages/Users';

const AuthenticatedApp = () => {
  const { isLoadingAuth, authError } = useAuth();

  // Invite and password-recovery links land here with tokens in the URL hash.
  // They must be handled before every auth branch below: the visitor already
  // has a session (so the app would otherwise just let them in without ever
  // setting a password), and the loading spinner would hide the form.
  if (window.location.pathname === '/reset-password') {
    return <ResetPassword />;
  }

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      return <Login />;
    }
  }

  // Every route is wrapped in <RequirePage>, which checks the same PAGE_ACCESS
  // table that Layout.jsx filters the sidebar with. Hiding a nav item alone
  // would leave the URL reachable by hand.
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<RequirePage><Dashboard /></RequirePage>} />
        <Route path="/orders" element={<RequirePage><Orders /></RequirePage>} />
        <Route path="/orders/new" element={<RequirePage><OrderDetail /></RequirePage>} />
        <Route path="/orders/:id" element={<RequirePage><OrderDetail /></RequirePage>} />
        <Route path="/quotes" element={<RequirePage><Quotes /></RequirePage>} />
        <Route path="/inventory" element={<RequirePage><Inventory /></RequirePage>} />
        <Route path="/book-procurement" element={<RequirePage><BookProcurement /></RequirePage>} />
        <Route path="/credits" element={<RequirePage><Credits /></RequirePage>} />
        <Route path="/suppliers" element={<RequirePage><Suppliers /></RequirePage>} />
        <Route path="/suppliers/:id" element={<RequirePage><SupplierDetail /></RequirePage>} />
        <Route path="/staff" element={<RequirePage><Staff /></RequirePage>} />
        <Route path="/projects" element={<RequirePage><Projects /></RequirePage>} />
        <Route path="/projects/:id" element={<RequirePage><ProjectDetail /></RequirePage>} />
        <Route path="/users" element={<RequirePage><Users /></RequirePage>} />
        <Route path="/settings" element={<RequirePage><Settings /></RequirePage>} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App