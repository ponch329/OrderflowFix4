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
import { ArrowLeft, RefreshCw, Upload, Package, CheckCircle, Clock, XCircle, Search, Bell, Trash2, Eye, Plus, User as UserIcon, Settings } from "lucide-react";
import { toast } from "sonner";
import DragDropUpload from "@/components/DragDropUpload";
import CreateOrderDialog from "@/components/CreateOrderDialog";
import AnalyticsDashboard from "@/components/AnalyticsDashboard";
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
  const [vendorFilter, setVendorFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [viewProofsDialogOpen, setViewProofsDialogOpen] = useState(false);
  const [createOrderDialogOpen, setCreateOrderDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedOrderObj, setSelectedOrderObj] = useState(null);
  const [uploadStage, setUploadStage] = useState("clay");
  const [uploadFiles, setUploadFiles] = useState([]);
  const [viewProofsStage, setViewProofsStage] = useState("clay");
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [perPage] = useState(50);

  useEffect(() => {
    // Check if admin is authenticated
    const token = localStorage.getItem('admin_token');
    if (!token) {
      navigate('/admin/login');
      return;
    }
    
    // Set default authorization header for all axios requests
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    
    fetchOrders();
    fetchVendors();
  }, [navigate]);

  const fetchVendors = async () => {
    try {
      const response = await axios.get(`${API}/vendors/list`);
      setVendors(response.data.vendors);
    } catch (error) {
      console.error("Failed to load vendors", error);
    }
  };

  useEffect(() => {
    // Filter orders based on search query, stage, status, and archive state
    let filtered = orders;
    
    // Apply archive filter
    filtered = filtered.filter(order => showArchived ? order.is_archived : !order.is_archived);
    
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
    
    // Apply pagination to filtered results
    const startIndex = (currentPage - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedOrders = filtered.slice(startIndex, endIndex);
    
    setFilteredOrders(paginatedOrders);
    setTotalPages(Math.ceil(filtered.length / perPage));
    setTotalCount(filtered.length);
  }, [orders, searchQuery, stageFilter, statusFilter, showArchived, currentPage, perPage]);

  const fetchOrders = async (page = 1) => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/admin/orders`);
      // Sort by created_at descending (newest first)
      const sortedOrders = response.data.sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
      );
      
      // Implement client-side pagination
      const startIndex = (page - 1) * perPage;
      const endIndex = startIndex + perPage;
      const paginatedOrders = sortedOrders.slice(startIndex, endIndex);
      
      setOrders(sortedOrders); // Keep all orders for filtering
      setFilteredOrders(paginatedOrders); // Show only current page
      setCurrentPage(page);
      setTotalPages(Math.ceil(sortedOrders.length / perPage));
      setTotalCount(sortedOrders.length);
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

  const handleDeleteProof = async (orderId, proofId, stage) => {
    if (!window.confirm("Are you sure you want to delete this proof image?")) {
      return;
    }

    try {
      await axios.delete(`${API}/admin/orders/${orderId}/proofs/${proofId}?stage=${stage}`);
      toast.success("Proof deleted successfully");
      fetchOrders();
      
      // Update the selectedOrderObj if viewing proofs
      if (selectedOrderObj && selectedOrderObj.id === orderId) {
        const updatedOrder = orders.find(o => o.id === orderId);
        if (updatedOrder) {
          setSelectedOrderObj(updatedOrder);
        }
      }
    } catch (error) {
      toast.error("Failed to delete proof");
      console.error(error);
    }
  };

  const handleArchiveOrder = async (orderId, archive = true) => {
    const action = archive ? "archive" : "unarchive";
    if (!window.confirm(`Are you sure you want to ${action} this order?`)) {
      return;
    }

    try {
      await axios.patch(`${API}/admin/orders/${orderId}/archive?archive=${archive}`);
      toast.success(`Order ${action}d successfully`);
      fetchOrders();
    } catch (error) {
      toast.error(`Failed to ${action} order`);
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

  const formatStageTimestamp = (timestamp) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
          <div className="flex gap-2">
            <Button 
              onClick={() => navigate('/admin/users')}
              variant="outline"
              className="border-purple-200 text-purple-600 hover:bg-purple-50"
            >
              <UserIcon className="w-4 h-4 mr-2" />
              Users
            </Button>
            <Button 
              onClick={() => navigate('/admin/settings')}
              variant="outline"
              className="border-blue-200 text-blue-600 hover:bg-blue-50"
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
            <Button 
              onClick={syncOrders} 
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="sync-orders-btn"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Sync
            </Button>
            <Button
              onClick={() => {
                localStorage.removeItem('admin_token');
                navigate('/admin/login');
                toast.success('Logged out successfully');
              }}
              variant="outline"
              className="border-red-200 text-red-600 hover:bg-red-50"
            >
              Logout
            </Button>
          </div>
        </div>

        {/* Analytics Dashboard */}
        <AnalyticsDashboard />

        {/* Sticky Search and Filter Bar */}
        <div className="sticky top-0 z-10 bg-white shadow-md border-b mb-6 py-4 -mx-8 px-8">
          <div className="space-y-4">
            <div className="flex gap-3 items-center">
              <div className="relative flex-1 max-w-md">
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
              <Button
                onClick={() => setCreateOrderDialogOpen(true)}
                className="bg-green-600 hover:bg-green-700 h-12"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Order
              </Button>
              <Button
                onClick={() => setShowArchived(!showArchived)}
                variant={showArchived ? "default" : "outline"}
                className="h-12"
              >
                {showArchived ? "Show Active" : "Show Archived"}
              </Button>
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
                  <SelectItem value="fulfilled">Fulfilled</SelectItem>
                  <SelectItem value="canceled">Canceled</SelectItem>
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

            {(searchQuery || stageFilter !== "all" || statusFilter !== "all" || showArchived) && (
              <p className="text-sm text-gray-600">
                Found {filteredOrders.length} order(s)
                {searchQuery && ` matching "${searchQuery}"`}
                {stageFilter !== "all" && ` in ${stageFilter} stage`}
                {statusFilter !== "all" && ` with status: ${statusFilter}`}
                {showArchived && ` (archived)`}
              </p>
            )}
          </div>
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

          {filteredOrders.map((order) => {
            const isFulfilled = order.shopify_fulfillment_status === 'fulfilled' || order.stage === 'fulfilled';
            return (
            <Card 
              key={order.id} 
              className={`hover:shadow-lg transition-shadow ${isFulfilled ? 'bg-gray-50 opacity-70' : ''}`}
              data-testid={`order-card-${order.id}`}
            >
              <CardContent className="p-6">
                <div className="grid grid-cols-[300px_1fr] gap-6">
                  {/* Left side - Order Info */}
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-2xl font-bold">Order #{order.order_number}</h3>
                        {order.is_manual_order && (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                            Manual
                          </Badge>
                        )}
                        {isFulfilled && (
                          <Badge className="bg-green-500 text-white">
                            Fulfilled
                          </Badge>
                        )}
                      </div>
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
                          <SelectItem value="fulfilled">Stage: Fulfilled</SelectItem>
                          <SelectItem value="canceled">Stage: Canceled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Button 
                        variant="outline" 
                        className="w-full"
                        onClick={() => navigate(`/order/${order.id}`, { state: { order, isAdmin: true } })}
                        data-testid={`view-details-btn-${order.id}`}
                      >
                        View Details
                      </Button>
                      <Button 
                        variant="outline"
                        className="w-full border-orange-300 text-orange-700 hover:bg-orange-50"
                        onClick={() => handleArchiveOrder(order.id, !order.is_archived)}
                      >
                        {order.is_archived ? "Unarchive" : "Archive"}
                      </Button>
                    </div>
                  </div>

                  {/* Right side - Stages (Horizontal) */}
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {/* Clay Stage */}
                    <div className="relative p-4 bg-yellow-50 rounded-lg border-2 border-yellow-200 min-w-0">
                      <Badge className="absolute top-2 right-2 bg-yellow-500 text-white text-xs">CLAY</Badge>
                      <h4 className="font-bold text-base md:text-lg mb-1 pr-12">Clay Stage</h4>
                      {order.clay_entered_at && (
                        <p className="text-xs text-gray-500 mb-3">
                          Entered: {formatStageTimestamp(order.clay_entered_at)}
                        </p>
                      )}
                      
                      <div className="space-y-3">
                        <Select 
                          value={order.clay_status} 
                          onValueChange={(value) => handleStatusChange(order.id, order.order_number, 'clay_status', value)}
                        >
                          <SelectTrigger className="h-8 text-xs md:text-sm w-full" data-testid={`clay-status-control-${order.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sculpting">Sculpting</SelectItem>
                            <SelectItem value="feedback_needed">Feedback Needed</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="changes_requested">Changes Requested</SelectItem>
                          </SelectContent>
                        </Select>

                        <div className="flex items-center gap-2 text-xs md:text-sm text-gray-600">
                          {getApprovalIcon(order, "clay")}
                          <span className="truncate">{order.clay_proofs?.length || 0} proofs</span>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button 
                            size="sm"
                            className="flex-1 min-w-[80px] h-8 text-xs"
                            onClick={() => openUploadDialog(order, "clay")}
                            data-testid={`upload-clay-btn-${order.id}`}
                          >
                            <Upload className="w-3 h-3 mr-1" />
                            Upload
                          </Button>
                          {order.clay_proofs?.length > 0 && (
                            <Button 
                              size="sm"
                              variant="outline"
                              className="h-8 px-2 text-xs border-purple-500 text-purple-600 hover:bg-purple-50"
                              onClick={() => {
                                setSelectedOrderObj(order);
                                setViewProofsStage("clay");
                                setViewProofsDialogOpen(true);
                              }}
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              View
                            </Button>
                          )}
                          <Button 
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0 border-blue-500 text-blue-600 hover:bg-blue-50 shrink-0"
                            onClick={() => handlePingCustomer(order.id, order.order_number, "clay")}
                            data-testid={`ping-clay-btn-${order.id}`}
                          >
                            <Bell className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Paint Stage */}
                    <div className="relative p-4 bg-blue-50 rounded-lg border-2 border-blue-200 min-w-0">
                      <Badge className="absolute top-2 right-2 bg-blue-500 text-white text-xs">PAINT</Badge>
                      <h4 className="font-bold text-base md:text-lg mb-1 pr-12">Paint Stage</h4>
                      {order.paint_entered_at && (
                        <p className="text-xs text-gray-500 mb-3">
                          Entered: {formatStageTimestamp(order.paint_entered_at)}
                        </p>
                      )}
                      
                      <div className="space-y-3">
                        <Select 
                          value={order.paint_status} 
                          onValueChange={(value) => handleStatusChange(order.id, order.order_number, 'paint_status', value)}
                        >
                          <SelectTrigger className="h-8 text-xs md:text-sm w-full" data-testid={`paint-status-control-${order.id}`}>
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

                        <div className="flex items-center gap-2 text-xs md:text-sm text-gray-600">
                          {getApprovalIcon(order, "paint")}
                          <span className="truncate">{order.paint_proofs?.length || 0} proofs</span>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button 
                            size="sm"
                            className="flex-1 min-w-[80px] h-8 text-xs"
                            onClick={() => openUploadDialog(order, "paint")}
                            data-testid={`upload-paint-btn-${order.id}`}
                          >
                            <Upload className="w-3 h-3 mr-1" />
                            Upload
                          </Button>
                          {order.paint_proofs?.length > 0 && (
                            <Button 
                              size="sm"
                              variant="outline"
                              className="h-8 px-2 text-xs border-purple-500 text-purple-600 hover:bg-purple-50"
                              onClick={() => {
                                setSelectedOrderObj(order);
                                setViewProofsStage("paint");
                                setViewProofsDialogOpen(true);
                              }}
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              View
                            </Button>
                          )}
                          <Button 
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0 border-blue-500 text-blue-600 hover:bg-blue-50 shrink-0"
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
          );
          })}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-between bg-white p-4 rounded-lg border shadow-sm">
            <div className="text-sm text-gray-600">
              Showing {((currentPage - 1) * perPage) + 1} to {Math.min(currentPage * perPage, totalCount)} of {totalCount} orders
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1 || loading}
                variant="outline"
                size="sm"
              >
                Previous
              </Button>
              <div className="flex items-center gap-2 px-4">
                <span className="text-sm font-medium">
                  Page {currentPage} of {totalPages}
                </span>
              </div>
              <Button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages || loading}
                variant="outline"
                size="sm"
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Create Order Dialog */}
        <CreateOrderDialog 
          open={createOrderDialogOpen}
          onOpenChange={setCreateOrderDialogOpen}
          onOrderCreated={fetchOrders}
        />

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

        {/* View & Manage Proofs Dialog */}
        <Dialog open={viewProofsDialogOpen} onOpenChange={setViewProofsDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Manage Proofs - {viewProofsStage.charAt(0).toUpperCase() + viewProofsStage.slice(1)} Stage
              </DialogTitle>
              <DialogDescription>
                Order #{selectedOrderObj?.order_number} - {selectedOrderObj?.customer_name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {selectedOrderObj && selectedOrderObj[`${viewProofsStage}_proofs`]?.length > 0 ? (
                <div className="grid grid-cols-2 gap-4">
                  {selectedOrderObj[`${viewProofsStage}_proofs`].map((proof, idx) => (
                    <div key={proof.id || idx} className="relative group border rounded-lg overflow-hidden bg-gray-50">
                      <img
                        src={proof.url}
                        alt={proof.filename || `Proof ${idx + 1}`}
                        className="w-full h-64 object-contain"
                      />
                      <div className="p-2 bg-white border-t">
                        <p className="text-sm text-gray-600 truncate">{proof.filename}</p>
                        <div className="flex justify-between items-center mt-2">
                          <p className="text-xs text-gray-500">
                            {new Date(proof.uploaded_at).toLocaleDateString()}
                          </p>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 text-xs"
                            onClick={() => handleDeleteProof(selectedOrderObj.id, proof.id, viewProofsStage)}
                          >
                            <Trash2 className="w-3 h-3 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No proofs uploaded for this stage yet.
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default AdminDashboard;
