import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, RefreshCw, Upload, Package, CheckCircle, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [uploadStage, setUploadStage] = useState("clay");
  const [uploadFiles, setUploadFiles] = useState([]);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/admin/orders`);
      setOrders(response.data);
    } catch (error) {
      toast.error("Failed to load orders");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const syncOrders = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${API}/admin/sync-orders`);
      toast.success(response.data.message);
      fetchOrders();
    } catch (error) {
      toast.error("Failed to sync orders. Please check Shopify credentials.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadProofs = async () => {
    if (!selectedOrder || uploadFiles.length === 0) {
      toast.error("Please select files to upload");
      return;
    }

    const formData = new FormData();
    formData.append("stage", uploadStage);
    
    for (let file of uploadFiles) {
      formData.append("files", file);
    }

    try {
      await axios.post(`${API}/admin/orders/${selectedOrder}/proofs`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      toast.success("Proofs uploaded successfully!");
      setUploadDialogOpen(false);
      setUploadFiles([]);
      fetchOrders();
    } catch (error) {
      toast.error("Failed to upload proofs");
      console.error(error);
    }
  };

  const getStageColor = (stage) => {
    switch(stage) {
      case "clay": return "bg-yellow-500";
      case "paint": return "bg-blue-500";
      case "shipped": return "bg-green-500";
      default: return "bg-gray-500";
    }
  };

  const getApprovalIcon = (approval) => {
    if (!approval) return <Clock className="w-4 h-4 text-gray-400" />;
    if (approval.status === "approved") return <CheckCircle className="w-4 h-4 text-green-500" />;
    return <XCircle className="w-4 h-4 text-orange-500" />;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              onClick={() => navigate('/')}
              data-testid="back-to-home-btn"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              Admin Dashboard
            </h1>
          </div>
          <Button 
            onClick={syncOrders} 
            disabled={loading}
            className="bg-purple-600 hover:bg-purple-700"
            data-testid="sync-orders-btn"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Sync from Shopify
          </Button>
        </div>

        <div className="grid gap-6">
          {orders.length === 0 && !loading && (
            <Card>
              <CardContent className="py-12 text-center">
                <Package className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600 mb-4">No orders found</p>
                <Button onClick={syncOrders} data-testid="sync-first-orders-btn">
                  Sync Orders from Shopify
                </Button>
              </CardContent>
            </Card>
          )}

          {orders.map((order) => (
            <Card key={order.id} className="hover:shadow-lg transition-shadow" data-testid={`order-card-${order.id}`}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-2xl">Order #{order.order_number}</CardTitle>
                    <CardDescription className="text-base mt-1">
                      {order.customer_name} • {order.customer_email}
                    </CardDescription>
                  </div>
                  <Badge className={`${getStageColor(order.stage)} text-white`} data-testid={`stage-badge-${order.id}`}>
                    {order.stage.toUpperCase()}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                      <span className="font-semibold">Clay Stage</span>
                      <div className="flex items-center gap-2">
                        {getApprovalIcon(order.clay_approval)}
                        <span className="text-sm">{order.clay_proofs?.length || 0} proofs</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                      <span className="font-semibold">Paint Stage</span>
                      <div className="flex items-center gap-2">
                        {getApprovalIcon(order.paint_approval)}
                        <span className="text-sm">{order.paint_proofs?.length || 0} proofs</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    <Dialog open={uploadDialogOpen && selectedOrder === order.id} onOpenChange={setUploadDialogOpen}>
                      <DialogTrigger asChild>
                        <Button 
                          className="w-full"
                          onClick={() => setSelectedOrder(order.id)}
                          data-testid={`upload-proofs-btn-${order.id}`}
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          Upload Proofs
                        </Button>
                      </DialogTrigger>
                      <DialogContent data-testid="upload-dialog">
                        <DialogHeader>
                          <DialogTitle>Upload Proofs</DialogTitle>
                          <DialogDescription>
                            Upload proof images for Order #{order.order_number}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Stage</Label>
                            <Select value={uploadStage} onValueChange={setUploadStage}>
                              <SelectTrigger data-testid="stage-select">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="clay">Clay</SelectItem>
                                <SelectItem value="paint">Paint</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Files (Images or ZIP)</Label>
                            <Input
                              type="file"
                              multiple
                              accept="image/*,.zip"
                              onChange={(e) => setUploadFiles(Array.from(e.target.files))}
                              data-testid="file-input"
                            />
                            {uploadFiles.length > 0 && (
                              <p className="text-sm text-gray-600">{uploadFiles.length} file(s) selected</p>
                            )}
                          </div>
                          <Button onClick={handleUploadProofs} className="w-full" data-testid="upload-submit-btn">
                            Upload
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Button 
                      variant="outline" 
                      onClick={() => navigate(`/order/${order.id}`, { state: { order, isAdmin: true } })}
                      data-testid={`view-details-btn-${order.id}`}
                    >
                      View Details
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
