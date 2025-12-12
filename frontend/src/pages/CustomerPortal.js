import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Search } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const CustomerPortal = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLookup = async (e) => {
    e.preventDefault();
    
    if (!email || !orderNumber) {
      toast.error("Please enter both email and order number");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.get(`${API}/customer/lookup`, {
        params: { email, order_number: orderNumber }
      });
      
      if (response.data) {
        navigate(`/order/${response.data.id}`, { state: { order: response.data } });
      }
    } catch (error) {
      toast.error("Order not found. Please check your email and order number.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header - Outside login box */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img 
              src="https://customer-assets.emergentagent.com/job_order-status-10/artifacts/eprlbu95_Allbobbleheads.com%20logo_color%20512x512.png" 
              alt="AllBobbleheads Logo" 
              className="h-32 w-32 object-contain"
            />
          </div>
          <h1 className="text-5xl font-bold mb-2 bg-gradient-to-r from-teal-500 to-blue-600 bg-clip-text text-transparent">
            AllBobbleheads
          </h1>
          <p className="text-xl text-gray-600">Order Approval System</p>
        </div>

        {/* Login Box */}
        <div className="max-w-md mx-auto">
          <Card className="shadow-xl border border-gray-200" data-testid="lookup-card">
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-2xl font-bold">Find Your Order</CardTitle>
              <CardDescription className="text-base mt-2">
                Enter your email and order number to view your bobblehead's progress
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 border-t border-gray-200">
              <form onSubmit={handleLookup} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    data-testid="email-input"
                    className="h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orderNumber">Order Number</Label>
                  <Input
                    id="orderNumber"
                    type="text"
                    placeholder="203860"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    required
                    data-testid="order-number-input"
                    className="h-12"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12 text-base bg-blue-600 hover:bg-blue-700"
                  disabled={loading}
                  data-testid="lookup-btn"
                >
                  {loading ? "Searching..." : "View My Order"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CustomerPortal;
