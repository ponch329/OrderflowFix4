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
import { ArrowLeft, RefreshCw, Upload, Package, CheckCircle, Clock, XCircle, Search, Bell } from "lucide-react";
import { toast } from "sonner";
import DragDropUpload from "@/components/DragDropUpload";
import { getStatusInfo, shouldShowPingButton } from "@/utils/orderHelpers";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedOrderObj, setSelectedOrderObj] = useState(null);
  const [uploadStage, setUploadStage] = useState("clay");
  const [uploadFiles, setUploadFiles] = useState([]);

  useEffect(() => {
    fetchOrders();
  }, []);

  useEffect(() => {
    // Filter orders based on search query, stage, and status
    let filtered = orders;
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(order => 
        order.order_number.toLowerCase().includes(query) ||
        (order.customer_email && order.customer_email.toLowerCase().includes(query)) ||
        (order.customer_name && order.customer_name.toLowerCase().includes(query))
      );
    }
    
    // Apply stage filter
    if (stageFilter !== "all") {
      filtered = filtered.filter(order => order.stage === stageFilter);
    }
    
    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(order => 
        order.clay_status === statusFilter || order.paint_status === statusFilter
      );
    }
    
    setFilteredOrders(filtered);
  }, [searchQuery, stageFilter, statusFilter, orders]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/admin/orders`);
      // Sort by created_at descending (newest first)
      const sortedOrders = response.data.sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
      );
      setOrders(sortedOrders);
      setFilteredOrders(sortedOrders);
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
      toast.success("Proofs uploaded! Status updated to 'Feedback Needed'");
      setUploadDialogOpen(false);
      setUploadFiles([]);
      fetchOrders();
    } catch (error) {
      toast.error("Failed to upload proofs");
      console.error(error);
    }
  };

  const handlePingCustomer = async (orderId, orderNumber, stage) => {
    try {
      await axios.post(`${API}/admin/orders/${orderId}/ping-customer?stage=${stage}`);
      toast.success(`Reminder sent to customer for Order #${orderNumber}`);
    } catch (error) {
      toast.error("Failed to send reminder");
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

  const getApprovalIcon = (order, stage) => {
    const statusField = `${stage}_status`;
    const status = order[statusField];
    
    if (status === "sculpting") return <Clock className="w-4 h-4 text-gray-400" />;
    if (status === "feedback_needed") return <Bell className="w-4 h-4 text-blue-500" />;
    if (status === "approved") return <CheckCircle className="w-4 h-4 text-green-500" />;
    if (status === "changes_requested") return <XCircle className="w-4 h-4 text-orange-500" />;
    return <Clock className="w-4 h-4 text-gray-400" />;
  };

  const getStatusBadge = (status) => {
    const info = getStatusInfo(status);
    return (
      <Badge className={`${info.color} text-white text-xs`}>
        {info.adminLabel}
      </Badge>
    );
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

        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              type="text"
              placeholder="Search by order number, email, or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12"
              data-testid="search-input"
            />
          </div>
          {searchQuery && (
            <p className="text-sm text-gray-600 mt-2">
              Found {filteredOrders.length} order(s) matching "{searchQuery}"
            </p>
          )}
        </div>

        <div className="grid gap-6">
          {filteredOrders.length === 0 && !loading && !searchQuery && (
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

          {filteredOrders.length === 0 && !loading && searchQuery && (
            <Card>
              <CardContent className="py-12 text-center">
                <Search className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600 mb-4">No orders found matching "{searchQuery}"</p>
                <Button variant="outline" onClick={() => setSearchQuery("")}>
                  Clear Search
                </Button>
              </CardContent>
            </Card>
          )}

          {filteredOrders.map((order) => (
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
                      <div className="flex-1">
                        <span className="font-semibold">Clay Stage</span>
                        <div className="mt-1">
                          {getStatusBadge(order.clay_status)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getApprovalIcon(order, "clay")}
                        <span className="text-sm">{order.clay_proofs?.length || 0} proofs</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                      <div className="flex-1">
                        <span className="font-semibold">Paint Stage</span>
                        <div className="mt-1">
                          {getStatusBadge(order.paint_status)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getApprovalIcon(order, "paint")}
                        <span className="text-sm">{order.paint_proofs?.length || 0} proofs</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    {shouldShowPingButton(order, "clay") && order.stage === "clay" && (
                      <Button 
                        variant="outline"
                        className="border-blue-500 text-blue-600 hover:bg-blue-50"
                        onClick={() => handlePingCustomer(order.id, order.order_number, "clay")}
                        data-testid={`ping-customer-clay-${order.id}`}
                      >
                        <Bell className="w-4 h-4 mr-2" />
                        Ping Customer (Clay)
                      </Button>
                    )}
                    {shouldShowPingButton(order, "paint") && order.stage === "paint" && (
                      <Button 
                        variant="outline"
                        className="border-blue-500 text-blue-600 hover:bg-blue-50"
                        onClick={() => handlePingCustomer(order.id, order.order_number, "paint")}
                        data-testid={`ping-customer-paint-${order.id}`}
                      >
                        <Bell className="w-4 h-4 mr-2" />
                        Ping Customer (Paint)
                      </Button>
                    )}
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
                      <DialogContent className="max-w-2xl" data-testid="upload-dialog">
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
                            <Label>Files (Drag & Drop or Click)</Label>
                            <DragDropUpload
                              onFilesSelected={setUploadFiles}
                              accept="image/*,.zip"
                              multiple={true}
                            />
                          </div>
                          <Button onClick={handleUploadProofs} className="w-full" data-testid="upload-submit-btn">
                            Upload {uploadFiles.length > 0 && `(${uploadFiles.length} file${uploadFiles.length > 1 ? 's' : ''})`}
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
