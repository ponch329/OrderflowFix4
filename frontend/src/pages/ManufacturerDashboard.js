import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Upload, CheckCircle, Clock, XCircle, Search, Package } from "lucide-react";
import { toast } from "sonner";
import DragDropUpload from "@/components/DragDropUpload";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getStatusInfo } from "@/utils/orderHelpers";

const BACKEND_URL = window.location.origin;
const API = `${BACKEND_URL}/api`;

const ManufacturerDashboard = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [uploadStage, setUploadStage] = useState("clay");
  const [uploadFiles, setUploadFiles] = useState([]);
  const [revisionNote, setRevisionNote] = useState("");
  const [userInfo, setUserInfo] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) {
      navigate('/admin/login');
      return;
    }
    
    axios.defaults.headers.common['Authorization'] = `Bearer ${ token}`;
    
    fetchUserInfo();
    fetchOrders();
  }, [navigate]);

  const fetchUserInfo = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUserInfo(response.data);
    } catch (error) {
      console.error("Failed to fetch user info", error);
      if (error.response?.status === 401) {
        localStorage.removeItem('admin_token');
        navigate('/admin/login');
      }
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/admin/orders?limit=1000`);
      
      // Filter orders: only show sub-orders (those with parent_order_id) or orders with a specific vendor
      // Manufacturers only see orders related to their work
      const manufacturerOrders = response.data.filter(order => {
        // For now, show all orders since we don't have vendor assignment per user
        // In a production system, you'd filter by: order.item_vendor === userInfo.assigned_vendor
        return !order.is_archived && order.stage !== "archived";
      });
      
      setOrders(manufacturerOrders);
      setFilteredOrders(manufacturerOrders);
    } catch (error) {
      toast.error("Failed to load orders");
      console.error(error);
      if (error.response?.status === 401) {
        localStorage.removeItem('admin_token');
        navigate('/admin/login');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let filtered = orders;
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(order => 
        order.order_number.toLowerCase().includes(query) ||
        (order.customer_name && order.customer_name.toLowerCase().includes(query))
      );
    }
    
    if (stageFilter !== "all") {
      filtered = filtered.filter(order => order.stage === stageFilter);
    }
    
    if (statusFilter !== "all") {
      filtered = filtered.filter(order => 
        order.clay_status === statusFilter || order.paint_status === statusFilter
      );
    }
    
    setFilteredOrders(filtered);
  }, [orders, searchQuery, stageFilter, statusFilter]);

  const handleUpload = async () => {
    if (uploadFiles.length === 0) {
      toast.error("Please select files to upload");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      uploadFiles.forEach((file) => formData.append("files", file));
      
      if (revisionNote.trim()) {
        formData.append("revision_note", revisionNote);
      }

      await axios.post(
        `${API}/admin/orders/${selectedOrder.id}/upload?stage=${uploadStage}`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );

      toast.success("Proofs uploaded successfully!");
      setUploadFiles([]);
      setRevisionNote("");
      setUploadDialogOpen(false);
      fetchOrders();
    } catch (error) {
      toast.error("Failed to upload proofs");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const openUploadDialog = (order, stage) => {
    setSelectedOrder(order);
    setUploadStage(stage);
    setUploadFiles([]);
    setRevisionNote("");
    setUploadDialogOpen(true);
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
    if (status === "feedback_needed") return <CheckCircle className="w-4 h-4 text-blue-500" />;
    if (status === "approved") return <CheckCircle className="w-4 h-4 text-green-500" />;
    if (status === "changes_requested") return <XCircle className="w-4 h-4 text-orange-500" />;
    return <Clock className="w-4 h-4 text-gray-400" />;
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "Not entered";
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              onClick={() => {
                localStorage.removeItem('admin_token');
                navigate('/admin/login');
              }}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Logout
            </Button>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Manufacturer Dashboard
              </h1>
              {userInfo && (
                <p className="text-sm text-gray-600 mt-1">Welcome, {userInfo.full_name}</p>
              )}
            </div>
          </div>
          <Badge className="bg-blue-600 text-white px-4 py-2 text-lg">
            <Package className="w-5 h-5 mr-2" />
            {filteredOrders.length} Orders
          </Badge>
        </div>

        {/* Search and Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input
                  type="text"
                  placeholder="Search by order number or customer name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stages</SelectItem>
                  <SelectItem value="clay">Clay</SelectItem>
                  <SelectItem value="paint">Paint</SelectItem>
                  <SelectItem value="shipped">Shipped</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by status" />
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
          </CardContent>
        </Card>

        {/* Orders Grid */}
        <div className="space-y-4">
          {loading && filteredOrders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-600 mt-4">Loading orders...</p>
              </CardContent>
            </Card>
          ) : filteredOrders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Package className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600 mb-2">No orders found</p>
                <p className="text-sm text-gray-500">Orders will appear here when they are assigned to you</p>
              </CardContent>
            </Card>
          ) : (
            filteredOrders.map((order) => (
              <Card 
                key={order.id} 
                className="hover:shadow-lg transition-shadow"
              >
                <CardContent className="p-6">
                  <div className="grid grid-cols-[300px_1fr] gap-6">
                    {/* Left side - Order Info */}
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <h3 className="text-xl font-bold">Order #{order.order_number}</h3>
                          {order.parent_order_id && (
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300 text-xs">
                              Sub-Order
                            </Badge>
                          )}
                        </div>
                        <p className="text-gray-700 font-semibold">{order.customer_name}</p>
                        {order.item_vendor && (
                          <p className="text-sm text-purple-600 font-semibold mt-1">
                            Vendor: {order.item_vendor}
                          </p>
                        )}
                      </div>
                      
                      <div className="pt-2 border-t">
                        <Badge className={`${getStageColor(order.stage)} text-white`}>
                          Current Stage: {order.stage.toUpperCase()}
                        </Badge>
                      </div>

                      <Button 
                        variant="outline" 
                        className="w-full"
                        onClick={() => navigate(`/admin/orders/${order.id}`)}
                      >
                        View Full Details
                      </Button>
                    </div>

                    {/* Right side - Stages */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {/* Clay Stage */}
                      <div className="p-4 bg-yellow-50 rounded-lg border-2 border-yellow-200">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="font-bold text-lg">Clay Stage</h4>
                          <Badge className="bg-yellow-500 text-white text-xs">CLAY</Badge>
                        </div>
                        
                        {order.clay_entered_at && (
                          <p className="text-xs text-gray-500 mb-3">
                            Started: {formatTimestamp(order.clay_entered_at)}
                          </p>
                        )}
                        
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            {getApprovalIcon(order, "clay")}
                            <span className="text-sm font-semibold">
                              {getStatusInfo(order.clay_status).adminLabel}
                            </span>
                          </div>
                          
                          <div className="text-sm text-gray-600">
                            {order.clay_proofs?.length || 0} proof(s) uploaded
                          </div>

                          <Button 
                            size="sm"
                            className="w-full"
                            onClick={() => openUploadDialog(order, "clay")}
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            Upload Clay Proofs
                          </Button>

                          {order.clay_approval?.status === "changes_requested" && (
                            <div className="mt-2 p-2 bg-orange-50 border-l-4 border-orange-500 rounded text-xs">
                              <p className="font-semibold text-orange-900">Changes Requested:</p>
                              <p className="text-gray-700">{order.clay_approval.message}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Paint Stage */}
                      <div className="p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="font-bold text-lg">Paint Stage</h4>
                          <Badge className="bg-blue-500 text-white text-xs">PAINT</Badge>
                        </div>
                        
                        {order.paint_entered_at && (
                          <p className="text-xs text-gray-500 mb-3">
                            Started: {formatTimestamp(order.paint_entered_at)}
                          </p>
                        )}
                        
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            {getApprovalIcon(order, "paint")}
                            <span className="text-sm font-semibold">
                              {getStatusInfo(order.paint_status).adminLabel}
                            </span>
                          </div>
                          
                          <div className="text-sm text-gray-600">
                            {order.paint_proofs?.length || 0} proof(s) uploaded
                          </div>

                          <Button 
                            size="sm"
                            className="w-full"
                            onClick={() => openUploadDialog(order, "paint")}
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            Upload Paint Proofs
                          </Button>

                          {order.paint_approval?.status === "changes_requested" && (
                            <div className="mt-2 p-2 bg-orange-50 border-l-4 border-orange-500 rounded text-xs">
                              <p className="font-semibold text-orange-900">Changes Requested:</p>
                              <p className="text-gray-700">{order.paint_approval.message}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Upload Dialog */}
        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                Upload {uploadStage === "clay" ? "Clay" : "Paint"} Proofs - Order #{selectedOrder?.order_number}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Revision Note (Optional)</label>
                <Input
                  type="text"
                  placeholder="e.g., Updated nose shape, adjusted hair color"
                  value={revisionNote}
                  onChange={(e) => setRevisionNote(e.target.value)}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Describe what changed in this revision to help the customer understand
                </p>
              </div>
              
              <DragDropUpload
                files={uploadFiles}
                onFilesChange={setUploadFiles}
                accept="image/*"
                maxFiles={20}
              />
              
              <div className="flex gap-3 justify-end">
                <Button 
                  variant="outline" 
                  onClick={() => setUploadDialogOpen(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleUpload}
                  disabled={loading || uploadFiles.length === 0}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {loading ? "Uploading..." : "Upload Proofs"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default ManufacturerDashboard;
