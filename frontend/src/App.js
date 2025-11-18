import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AdminLogin from "@/pages/AdminLogin";
import AdminDashboard from "@/pages/AdminDashboard";
import ManufacturerDashboard from "@/pages/ManufacturerDashboard";
import UserManagement from "@/pages/UserManagement";
import Settings from "@/pages/Settings";
import EmailTemplates from "@/pages/EmailTemplates";
import OrderDetailsAdmin from "@/pages/OrderDetailsAdmin";
import CustomerPortal from "@/pages/CustomerPortal";
import OrderDetails from "@/pages/OrderDetails";
import HomePage from "@/pages/HomePage";
import { Toaster } from "@/components/ui/sonner";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<UserManagement />} />
          <Route path="/admin/settings" element={<Settings />} />
          <Route path="/admin/email-templates" element={<EmailTemplates />} />
          <Route path="/admin/orders/:orderId" element={<OrderDetailsAdmin />} />
          <Route path="/customer" element={<CustomerPortal />} />
          <Route path="/order/:orderId" element={<OrderDetails />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </div>
  );
}

export default App;
