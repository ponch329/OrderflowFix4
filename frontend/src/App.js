import "@/App.css";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import axios from "axios";
import AdminLogin from "@/pages/AdminLogin";
import AdminDashboard from "@/pages/AdminDashboard";
import ManufacturerDashboard from "@/pages/ManufacturerDashboard";
import UserManagement from "@/pages/UserManagement";
import Settings from "@/pages/Settings";
import EmailTemplates from "@/pages/EmailTemplates";
import OrderDetailsAdmin from "@/pages/OrderDetailsAdmin";
import OrderDesk from "@/pages/OrderDesk";
import CustomerPortal from "@/pages/CustomerPortal";
import OrderDetails from "@/pages/OrderDetails";
import HomePage from "@/pages/HomePage";
import { Toaster } from "@/components/ui/sonner";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { toast } from "sonner";

// Component to set up axios interceptors
function AxiosInterceptor() {
  const navigate = useNavigate();

  useEffect(() => {
    // Add response interceptor to handle token expiration
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Token expired or invalid
          const currentPath = window.location.pathname;
          
          // Don't redirect if already on login page or public pages
          if (!currentPath.includes('/login') && 
              !currentPath.includes('/customer') && 
              !currentPath.includes('/order/') &&
              currentPath !== '/') {
            
            localStorage.removeItem('admin_token');
            toast.error('Your session has expired. Please login again.');
            
            // Redirect to appropriate login page
            if (currentPath.includes('/admin') || currentPath.includes('/manufacturer')) {
              navigate('/admin/login');
            }
          }
        }
        return Promise.reject(error);
      }
    );

    // Cleanup interceptor on unmount
    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [navigate]);

  return null;
}

function App() {
  return (
    <div className="App">
      <BrandingProvider>
        <BrowserRouter>
          <AxiosInterceptor />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/orderdesk" element={<OrderDesk />} />
            <Route path="/admin/users" element={<UserManagement />} />
            <Route path="/admin/settings" element={<Settings />} />
            <Route path="/admin/email-templates" element={<EmailTemplates />} />
            <Route path="/admin/orders/:orderId" element={<OrderDetailsAdmin />} />
            <Route path="/manufacturer/dashboard" element={<ManufacturerDashboard />} />
            <Route path="/customer" element={<CustomerPortal />} />
            <Route path="/order/:orderId" element={<OrderDetails />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </BrandingProvider>
    </div>
  );
}

export default App;
