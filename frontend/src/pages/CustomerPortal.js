import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Search } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
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
        <div className="max-w-md mx-auto mt-16">
          <Card className="shadow-xl border border-gray-200" data-testid="lookup-card">
            <CardHeader className="text-center pb-4 bg-gradient-to-r from-blue-600 to-blue-700">
              <div className="flex justify-center mb-4">
                <div className="bg-white p-4 rounded-full">
                  <Search className="w-8 h-8 text-blue-600" />
                </div>
              </div>
              <CardTitle className="text-3xl font-bold text-white">Find Your Order</CardTitle>
              <CardDescription className="text-base text-blue-100">
                Enter your email and order number to view your bobblehead's progress
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
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
                    placeholder="#203860"
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
