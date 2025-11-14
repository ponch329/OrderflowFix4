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
    // Check if admin is authenticated
    const token = localStorage.getItem('admin_token');
    if (!token) {
      navigate('/admin/login');
      return;
    }
    fetchOrders();
  }, [navigate]);

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
      toast.error(error.response?.data?.detail || "Failed to send reminder");
      console.error(error);
    }
  };

  const handleStatusChange = async (orderId, orderNumber, field, value) => {
    try {
      const params = { [field]: value };
      await axios.patch(`${API}/admin/orders/${orderId}/update-status`, null, { params });
      toast.success(`${field} updated to: ${value}`);
      fetchOrders();
    } catch (error) {
      toast.error("Failed to update status");
      console.error(error);
    }
  };

  const openUploadDialog = (order, stage) => {
    setSelectedOrder(order.id);
    setSelectedOrderObj(order);
    setUploadStage(stage);
    setUploadDialogOpen(true);
  };

  const formatTimestamp = (timestamp, updatedBy) => {
    if (!timestamp) return "No updates yet";
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    let timeAgo;
    if (diffMins < 1) timeAgo = "just now";
    else if (diffMins < 60) timeAgo = `${diffMins}m ago`;
    else if (diffHours < 24) timeAgo = `${diffHours}h ago`;
    else timeAgo = `${diffDays}d ago`;

    const by = updatedBy === "customer" ? "by Customer" : "by Admin";
    return `${timeAgo} ${by}`;
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

        <div className="mb-6 space-y-4">
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

          <div className="flex gap-4">
            <div className="w-48">
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger data-testid="stage-filter">
                  <SelectValue placeholder="Filter by Stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stages</SelectItem>
                  <SelectItem value="clay">Clay</SelectItem>
                  <SelectItem value="paint">Paint</SelectItem>
                  <SelectItem value="shipped">Shipped</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-64">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="status-filter">
                  <SelectValue placeholder="Filter by Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="sculpting">Sculpting</SelectItem>
                  <SelectItem value="feedback_needed">Feedback Needed</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="changes_requested">Changes Requested</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {(searchQuery || stageFilter !== "all" || statusFilter !== "all") && (
            <p className="text-sm text-gray-600">
              Found {filteredOrders.length} order(s)
              {searchQuery && ` matching "${searchQuery}"`}
              {stageFilter !== "all" && ` in ${stageFilter} stage`}
              {statusFilter !== "all" && ` with status: ${statusFilter}`}
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
              <CardContent className="p-6">
                <div className="grid grid-cols-[300px_1fr] gap-6">
                  {/* Left side - Order Info */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-2xl font-bold mb-2">Order #{order.order_number}</h3>
                      <p className="text-gray-700">{order.customer_name}</p>
                      <p className="text-gray-600 text-sm">{order.customer_email}</p>
                      <p className="text-xs text-gray-500 mt-2">
                        Last updated: {formatTimestamp(order.last_updated_at, order.last_updated_by)}
                      </p>
                    </div>
                    
                    {/* Admin Controls */}
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-600">Admin Controls</Label>
                      <Select 
                        value={order.stage} 
                        onValueChange={(value) => handleStatusChange(order.id, order.order_number, 'stage', value)}
                      >
                        <SelectTrigger className="h-9" data-testid={`stage-control-${order.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="clay">Stage: Clay</SelectItem>
                          <SelectItem value="paint">Stage: Paint</SelectItem>
                          <SelectItem value="shipped">Stage: Shipped</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => navigate(`/order/${order.id}`, { state: { order, isAdmin: true } })}
                      data-testid={`view-details-btn-${order.id}`}
                    >
                      View Details
                    </Button>
                  </div>

                  {/* Right side - Stages (Horizontal) */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Clay Stage */}
                    <div className="relative p-4 bg-yellow-50 rounded-lg border-2 border-yellow-200">
                      <Badge className="absolute top-2 right-2 bg-yellow-500 text-white">CLAY</Badge>
                      <h4 className="font-bold text-lg mb-3">Clay Stage</h4>
                      
                      <div className="space-y-3">
                        <Select 
                          value={order.clay_status} 
                          onValueChange={(value) => handleStatusChange(order.id, order.order_number, 'clay_status', value)}
                        >
                          <SelectTrigger className="h-8 text-sm" data-testid={`clay-status-control-${order.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sculpting">Sculpting</SelectItem>
                            <SelectItem value="feedback_needed">Feedback Needed</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="changes_requested">Changes Requested</SelectItem>
                          </SelectContent>
                        </Select>

                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          {getApprovalIcon(order, "clay")}
                          <span>{order.clay_proofs?.length || 0} proofs</span>
                        </div>

                        <div className="flex gap-2">
                          <Button 
                            size="sm"
                            className="flex-1 h-8 text-xs"
                            onClick={() => openUploadDialog(order, "clay")}
                            data-testid={`upload-clay-btn-${order.id}`}
                          >
                            <Upload className="w-3 h-3 mr-1" />
                            Upload Proofs
                          </Button>
                          <Button 
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0 border-blue-500 text-blue-600 hover:bg-blue-50"
                            onClick={() => handlePingCustomer(order.id, order.order_number, "clay")}
                            data-testid={`ping-clay-btn-${order.id}`}
                          >
                            <Bell className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Paint Stage */}
                    <div className="relative p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                      <Badge className="absolute top-2 right-2 bg-blue-500 text-white">PAINT</Badge>
                      <h4 className="font-bold text-lg mb-3">Paint Stage</h4>
                      
                      <div className="space-y-3">
                        <Select 
                          value={order.paint_status} 
                          onValueChange={(value) => handleStatusChange(order.id, order.order_number, 'paint_status', value)}
                        >
                          <SelectTrigger className="h-8 text-sm" data-testid={`paint-status-control-${order.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="sculpting">Painting</SelectItem>
                            <SelectItem value="feedback_needed">Feedback Needed</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="changes_requested">Changes Requested</SelectItem>
                          </SelectContent>
                        </Select>

                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          {getApprovalIcon(order, "paint")}
                          <span>{order.paint_proofs?.length || 0} proofs</span>
                        </div>

                        <div className="flex gap-2">
                          <Button 
                            size="sm"
                            className="flex-1 h-8 text-xs"
                            onClick={() => openUploadDialog(order, "paint")}
                            data-testid={`upload-paint-btn-${order.id}`}
                          >
                            <Upload className="w-3 h-3 mr-1" />
                            Upload Proofs
                          </Button>
                          <Button 
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0 border-blue-500 text-blue-600 hover:bg-blue-50"
                            onClick={() => handlePingCustomer(order.id, order.order_number, "paint")}
                            data-testid={`ping-paint-btn-${order.id}`}
                          >
                            <Bell className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Upload Dialog */}
        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogContent className="max-w-2xl" data-testid="upload-dialog">
            <DialogHeader>
              <DialogTitle>Upload Proofs - {uploadStage.charAt(0).toUpperCase() + uploadStage.slice(1)} Stage</DialogTitle>
              <DialogDescription>
                Upload proof images for Order #{selectedOrderObj?.order_number}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Files (Drag & Drop or Click)</Label>
                <DragDropUpload
                  onFilesSelected={setUploadFiles}
                  accept="image/*,.zip"
                  multiple={true}
                />
              </div>
              <Button onClick={handleUploadProofs} className="w-full" data-testid="upload-submit-btn" disabled={uploadFiles.length === 0}>
                Upload {uploadFiles.length > 0 && `(${uploadFiles.length} file${uploadFiles.length > 1 ? 's' : ''})`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default AdminDashboard;
