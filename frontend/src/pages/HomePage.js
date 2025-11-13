import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Package, User, Shield } from "lucide-react";

const HomePage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <div className="flex justify-center mb-6">
            <Package className="w-20 h-20 text-blue-600" />
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            AllBobbleheads
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Order Approval System
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <div 
            className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-300 border border-gray-100 cursor-pointer group"
            onClick={() => navigate('/customer')}
            data-testid="customer-portal-card"
          >
            <div className="flex flex-col items-center text-center">
              <div className="bg-blue-100 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform">
                <User className="w-12 h-12 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold mb-3 text-gray-800">Customer Portal</h2>
              <p className="text-gray-600 mb-6">
                View your order status, review proofs, and approve designs
              </p>
              <Button 
                className="w-full bg-blue-600 hover:bg-blue-700"
                data-testid="customer-portal-btn"
              >
                Access My Order
              </Button>
            </div>
          </div>

          <div 
            className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-300 border border-gray-100 cursor-pointer group"
            onClick={() => navigate('/admin')}
            data-testid="admin-dashboard-card"
          >
            <div className="flex flex-col items-center text-center">
              <div className="bg-purple-100 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform">
                <Shield className="w-12 h-12 text-purple-600" />
              </div>
              <h2 className="text-2xl font-bold mb-3 text-gray-800">Admin Dashboard</h2>
              <p className="text-gray-600 mb-6">
                Manage orders, upload proofs, and track production status
              </p>
              <Button 
                className="w-full bg-purple-600 hover:bg-purple-700"
                data-testid="admin-dashboard-btn"
              >
                Admin Access
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
