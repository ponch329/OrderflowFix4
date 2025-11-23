import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Upload, Edit, Save, Package, ChevronDown, ChevronUp, Image as ImageIcon, Bell } from "lucide-react";
import { toast } from "sonner";
import DragDropUpload from "@/components/DragDropUpload";
import { useBranding } from "@/contexts/BrandingContext";
import { getStageLabel, getStatusLabel } from "@/utils/labelMapper";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const OrderDetailsAdminNew = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { workflowConfig } = useBranding();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  
  // Edit form state
  const [editForm, setEditForm] = useState({
    order_number: "",
    customer_name: "",
    customer_email: ""
  });
  
  // Stage/Status editing
  const [editStageDialogOpen, setEditStageDialogOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState("");
  const [selectedClayStatus, setSelectedClayStatus] = useState("");
  const [selectedPaintStatus, setSelectedPaintStatus] = useState("");
  
  // Tracking dialog state
  const [trackingDialogOpen, setTrackingDialogOpen] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingCompany, setTrackingCompany] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [fetchingFromShopify, setFetchingFromShopify] = useState(false);
  
  // Notification confirmation
  const [notifyDialogOpen, setNotifyDialogOpen] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState(null);
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  
  // Upload proofs
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadStage, setUploadStage] = useState("clay");
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadReason, setUploadReason] = useState("");
  
  // Changes requested dialog
  const [changesDialogOpen, setChangesDialogOpen] = useState(false);
  const [changesMessage, setChangesMessage] = useState("");
  const [changesImages, setChangesImages] = useState([]);
  const [changesStage, setChangesStage] = useState("clay");

  // Collapsible sections
  const [clayExpanded, setClayExpanded] = useState(true);
  const [paintExpanded, setPaintExpanded] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) {
      navigate('/admin/login');
      return;
    }
    
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    fetchOrder();
  }, [orderId, navigate]);

  const fetchOrder = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/admin/orders/${orderId}`);
      setOrder(response.data);
      setEditForm({
        order_number: response.data.order_number,
        customer_name: response.data.customer_name || "",
        customer_email: response.data.customer_email || ""
      });
      setSelectedStage(response.data.stage);
      setSelectedClayStatus(response.data.clay_status);
      setSelectedPaintStatus(response.data.paint_status);
      
      // Set collapse state based on current stage
      if (response.data.stage === 'paint') {
        setClayExpanded(false);
        setPaintExpanded(true);
      } else if (response.data.stage === 'shipped') {
        setClayExpanded(false);
        setPaintExpanded(false);
      }
    } catch (error) {
      toast.error("Failed to load order");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    try {
      await axios.patch(`${API}/admin/orders/${orderId}/info`, editForm);
      toast.success("Order details updated!");
      setEditMode(false);
      fetchOrder();
    } catch (error) {
      toast.error("Failed to update order");
      console.error(error);
    }
  };

  const handleStageStatusChange = async () => {
    if (selectedClayStatus === 'changes_requested' || selectedPaintStatus === 'changes_requested') {
      setChangesStage(selectedClayStatus === 'changes_requested' ? 'clay' : 'paint');
      setEditStageDialogOpen(false);
      setChangesDialogOpen(true);
      return;
    }

    setPendingStatusChange({
      stage: selectedStage,
      clay_status: selectedClayStatus,
      paint_status: selectedPaintStatus
    });
    setEditStageDialogOpen(false);
    setNotifyDialogOpen(true);
  };

  const confirmStageStatusChange = async () => {
    if (!pendingStatusChange) return;

    try {
      await axios.patch(`${API}/admin/orders/${orderId}/status`, {
        ...pendingStatusChange,
        notify_customer: notifyCustomer
      });
      toast.success(notifyCustomer ? "Status updated & customer notified!" : "Stage and status updated!");
      setNotifyDialogOpen(false);
      setPendingStatusChange(null);
      fetchOrder();
    } catch (error) {
      toast.error("Failed to update stage/status");
      console.error(error);
    }
  };

  const handleUploadProofs = async () => {
    if (uploadFiles.length === 0) {
      toast.error("Please select files to upload");
      return;
    }

    const formData = new FormData();
    formData.append('stage', uploadStage);
    formData.append('revision_note', uploadReason);
    uploadFiles.forEach(file => formData.append('files', file));

    try {
      await axios.post(`${API}/admin/orders/${orderId}/proofs`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success("Proofs uploaded successfully!");
      setUploadDialogOpen(false);
      setUploadFiles([]);
      setUploadReason("");
      fetchOrder();
    } catch (error) {
      toast.error("Failed to upload proofs");
      console.error(error);
    }
  };

  const handleSubmitChanges = async () => {
    try {
      const formData = new FormData();
      formData.append('message', changesMessage);
      formData.append('stage', changesStage);
      changesImages.forEach(file => formData.append('files', file));

      await axios.post(`${API}/admin/orders/${orderId}/request-changes`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      toast.success("Changes requested - customer will be notified");
      setChangesDialogOpen(false);
      setChangesMessage("");
      setChangesImages([]);
      fetchOrder();
    } catch (error) {
      toast.error("Failed to submit changes");
      console.error(error);
    }
  };

  const handleFetchFromShopify = async () => {
    setFetchingFromShopify(true);
    try {
      const response = await axios.post(`${API}/admin/orders/${orderId}/tracking/fetch`);
      
      if (response.data.success && response.data.tracking) {
        setTrackingNumber(response.data.tracking.tracking_number || "");
        setTrackingCompany(response.data.tracking.tracking_company || "");
        setTrackingUrl(response.data.tracking.tracking_url || "");
        toast.success("Tracking fetched from Shopify!");
        fetchOrder();
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to fetch tracking from Shopify");
    } finally {
      setFetchingFromShopify(false);
    }
  };

  const handleSaveTracking = async () => {
    if (!trackingNumber.trim()) {
      toast.error("Please enter a tracking number");
      return;
    }

    try {
      await axios.patch(`${API}/admin/orders/${orderId}/tracking`, {
        tracking_number: trackingNumber,
        tracking_company: trackingCompany,
        tracking_url: trackingUrl,
        shipment_status: "in_transit"
      });

      toast.success("Tracking information saved!");
      setTrackingDialogOpen(false);
      fetchOrder();
    } catch (error) {
      toast.error("Failed to save tracking information");
    }
  };

  const getStageColor = (stage) => {
    switch(stage) {
      case "clay": return "bg-yellow-500";
      case "paint": return "bg-blue-500";
      case "shipped": return "bg-green-500";
      case "fulfilled": return "bg-green-600";
      default: return "bg-gray-500";
    }
  };

  const getStatusInfo = (status) => {
    const statusColors = {
      sculpting: "bg-yellow-500",
      painting: "bg-blue-500",
      feedback_needed: "bg-purple-600",
      approved: "bg-green-600",
      changes_requested: "bg-orange-500",
      pending: "bg-gray-500",
      in_progress: "bg-blue-600"
    };
    return statusColors[status] || "bg-gray-500";
  };

  const renderProofSection = (stage, proofs, approval) => {
    const statusField = `${stage}_status`;
    const status = order[statusField];
    const isExpanded = stage === 'clay' ? clayExpanded : paintExpanded;
    const setExpanded = stage === 'clay' ? setClayExpanded : setPaintExpanded;

    // Group proofs by round
    const rounds = {};
    proofs.forEach(proof => {
      const round = proof.round || 1;
      if (!rounds[round]) {
        rounds[round] = [];
      }
      rounds[round].push(proof);
    });
    
    const sortedRounds = Object.keys(rounds).sort((a, b) => b - a);
    const latestRound = Math.max(...Object.keys(rounds));

    return (
      <Card className="mb-4 border-2 border-gray-200">
        <CardHeader 
          className="bg-gradient-to-r from-blue-50 to-blue-100 border-b-2 border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors py-3"
          onClick={() => setExpanded(!isExpanded)}
        >
          <div className="flex justify-between items-center">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-xl capitalize text-blue-900">
                  {getStageLabel(stage, workflowConfig)}
                </CardTitle>
                <Badge className={`${getStatusInfo(status)} text-white text-sm px-2 py-0.5`}>
                  {getStatusLabel(status, workflowConfig)}
                </Badge>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-blue-700" /> : <ChevronDown className="w-4 h-4 text-blue-700" />}
              </div>
              <CardDescription className="text-blue-700 text-sm">
                {proofs?.length || 0} proof image(s)
              </CardDescription>
            </div>
            {isExpanded && (
              <Button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setUploadStage(stage); 
                  setUploadDialogOpen(true); 
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload Proofs
              </Button>
            )}
          </div>
        </CardHeader>
        
        {isExpanded && (
          <CardContent className="pt-6">
            {proofs && proofs.length > 0 ? (
              <div className="space-y-8">
                {sortedRounds.map(round => {
                  const roundProofs = rounds[round];
                  const isLatest = round == latestRound;
                  const roundDate = roundProofs[0]?.uploaded_at 
                    ? new Date(roundProofs[0].uploaded_at).toLocaleDateString('en-US', { 
                        month: 'long', 
                        day: 'numeric', 
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      })
                    : null;

                  return (
                    <div 
                      key={round} 
                      className={`${isLatest ? 'border-3 border-green-500 bg-green-50' : 'border-2 border-gray-300 bg-gray-50'} p-4 rounded-lg`}
                    >
                      {/* Round Header */}
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <h3 className="text-lg font-bold text-gray-900">
                          Round {round} {sortedRounds.length > 1 && `of ${sortedRounds.length}`}
                        </h3>
                        {isLatest && (
                          <Badge className="bg-green-600 text-white text-sm px-2 py-0.5">
                            ⭐ LATEST REVISION
                          </Badge>
                        )}
                        {!isLatest && (
                          <Badge variant="outline" className="text-gray-600 text-sm px-2 py-0.5">
                            Previous Version
                          </Badge>
                        )}
                      </div>
                      
                      {/* Round Info */}
                      <div className="mb-3 space-y-1">
                        {roundDate && (
                          <p className="text-xs text-gray-600">
                            <strong>Sent to customer:</strong> {roundDate}
                          </p>
                        )}
                        {roundProofs[0]?.revision_note && (
                          <p className="text-xs text-blue-700 bg-blue-100 p-2 rounded">
                            <strong>What changed:</strong> {roundProofs[0].revision_note}
                          </p>
                        )}
                      </div>
                      
                      {/* Proof Images */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        {roundProofs.map((proof, idx) => (
                          <div 
                            key={proof.id} 
                            className="relative group cursor-pointer border-2 border-gray-200 rounded-lg overflow-hidden hover:border-blue-600 transition-all"
                            onClick={() => setSelectedImage(proof.url)}
                          >
                            <img 
                              src={proof.url} 
                              alt={proof.filename}
                              className="w-full h-48 object-cover"
                            />
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center">
                              <ImageIcon className="text-white opacity-0 group-hover:opacity-100 transition-opacity" size={32} />
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {/* Customer Change Request */}
                      {approval && approval.status === "changes_requested" && (sortedRounds.length === 1 || !isLatest) && (
                        <div className="p-4 bg-orange-50 border-l-4 border-orange-500 rounded">
                          <p className="font-semibold mb-2 text-orange-900">Customer Requested Changes:</p>
                          <p className="text-gray-700">{approval.message || "No message provided"}</p>
                          {approval.images && approval.images.length > 0 && (
                            <div className="mt-3">
                              <p className="text-sm text-gray-600 mb-2">{approval.images.length} reference image(s):</p>
                              <div className="grid grid-cols-4 gap-2">
                                {approval.images.map((img, idx) => (
                                  <img 
                                    key={idx} 
                                    src={img} 
                                    alt={`Reference ${idx + 1}`} 
                                    className="w-full rounded border cursor-pointer hover:opacity-80"
                                    onClick={() => setSelectedImage(img)}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                <ImageIcon className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <p>No proofs uploaded yet</p>
                <p className="text-sm mt-1">Upload proofs using the button above</p>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p>Loading order...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p>Order not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-8">
        {/* Back Button */}
        <div className="flex justify-between items-center mb-6">
          <Button variant="ghost" onClick={() => navigate('/admin/dashboard')} className="text-blue-700">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>

        {/* Order Header Card - Modern Blue Design */}
        <Card className="mb-6 border-2 border-blue-200">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 py-4">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-2xl text-white">
                    Order #{order.order_number}
                  </CardTitle>
                  {!editMode && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setEditMode(true)}
                      className="bg-white bg-opacity-20 border-white text-white hover:bg-white hover:bg-opacity-30"
                    >
                      <Edit className="w-3 h-3 mr-1" />
                      Edit
                    </Button>
                  )}
                </div>
                
                <CardDescription className="text-base mt-2 text-blue-100">
                  {order.customer_name} • {order.customer_email}
                </CardDescription>
                
                {order.item_vendor && (
                  <CardDescription className="text-sm mt-1 text-blue-100">
                    Vendor: {order.item_vendor}
                  </CardDescription>
                )}
                
                {order.tracking_number && (
                  <CardDescription className="text-sm mt-2 text-blue-100">
                    📦 <strong>Tracking:</strong>{' '}
                    <a 
                      href={order.tracking_url || `https://www.google.com/search?q=track+${order.tracking_number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-white font-semibold"
                    >
                      {order.tracking_number}
                    </a>
                    {order.tracking_company && ` (${order.tracking_company})`}
                    {order.shipment_status && (
                      <span className="ml-2 px-2 py-0.5 bg-white bg-opacity-20 rounded text-xs">
                        {order.shipment_status.replace('_', ' ').toUpperCase()}
                      </span>
                    )}
                  </CardDescription>
                )}
              </div>
              
              <div className="flex gap-2 items-start flex-wrap justify-end">
                <Badge className={`${getStageColor(order.stage)} text-white text-sm px-3 py-1`}>
                  {getStageLabel(order.stage, workflowConfig).toUpperCase()}
                </Badge>
                {order.stage === 'clay' && order.clay_status && (
                  <Badge className={`${getStatusInfo(order.clay_status)} text-white text-sm px-3 py-1`}>
                    {getStatusLabel(order.clay_status, workflowConfig)}
                  </Badge>
                )}
                {order.stage === 'paint' && order.paint_status && (
                  <Badge className={`${getStatusInfo(order.paint_status)} text-white text-sm px-3 py-1`}>
                    {getStatusLabel(order.paint_status, workflowConfig)}
                  </Badge>
                )}
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTrackingNumber(order.tracking_number || "");
                    setTrackingCompany(order.tracking_company || "");
                    setTrackingUrl(order.tracking_url || "");
                    setTrackingDialogOpen(true);
                  }}
                  className="bg-white bg-opacity-20 border-white text-white hover:bg-white hover:bg-opacity-30"
                >
                  <Package className="w-3 h-3 mr-1" />
                  {order.tracking_number ? "Edit Tracking" : "Add Tracking"}
                </Button>
                <Button 
                  onClick={() => setEditStageDialogOpen(true)}
                  size="sm"
                  className="bg-white text-blue-700 hover:bg-blue-50"
                >
                  Change Stage/Status
                </Button>
              </div>
            </div>
          </CardHeader>
          
          {/* Edit Mode Form */}
          {editMode && (
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Order Number</Label>
                  <Input
                    value={editForm.order_number}
                    onChange={(e) => setEditForm({...editForm, order_number: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Customer Name</Label>
                  <Input
                    value={editForm.customer_name}
                    onChange={(e) => setEditForm({...editForm, customer_name: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Customer Email</Label>
                  <Input
                    type="email"
                    value={editForm.customer_email}
                    onChange={(e) => setEditForm({...editForm, customer_email: e.target.value})}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={() => setEditMode(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveEdit}>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </Button>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Clay Stage */}
        {renderProofSection('clay', order.clay_proofs || [], order.clay_approval)}

        {/* Paint Stage */}
        {renderProofSection('paint', order.paint_proofs || [], order.paint_approval)}

        {/* Edit Stage/Status Dialog */}
        <Dialog open={editStageDialogOpen} onOpenChange={setEditStageDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change Stage & Status</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Stage</Label>
                <Select value={selectedStage} onValueChange={setSelectedStage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clay">Clay</SelectItem>
                    <SelectItem value="paint">Paint</SelectItem>
                    <SelectItem value="shipped">Shipped</SelectItem>
                    <SelectItem value="fulfilled">Fulfilled</SelectItem>
                    <SelectItem value="canceled">Canceled</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Clay Status</Label>
                <Select value={selectedClayStatus} onValueChange={setSelectedClayStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sculpting">Sculpting</SelectItem>
                    <SelectItem value="feedback_needed">Feedback Needed</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="changes_requested">Changes Requested</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Paint Status</Label>
                <Select value={selectedPaintStatus} onValueChange={setSelectedPaintStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="painting">Painting</SelectItem>
                    <SelectItem value="feedback_needed">Feedback Needed</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="changes_requested">Changes Requested</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleStageStatusChange} className="w-full">
                Update Stage & Status
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Notification Confirmation Dialog */}
        <Dialog open={notifyDialogOpen} onOpenChange={setNotifyDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send Customer Notification?</DialogTitle>
              <DialogDescription>
                Do you want to notify the customer about this status change?
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center space-x-2 p-4 bg-blue-50 rounded-lg">
                <input
                  type="checkbox"
                  id="notify-customer"
                  checked={notifyCustomer}
                  onChange={(e) => setNotifyCustomer(e.target.checked)}
                  className="w-4 h-4"
                />
                <Label htmlFor="notify-customer" className="cursor-pointer">
                  Send email notification to customer
                </Label>
              </div>
              {pendingStatusChange && (
                <div className="text-sm text-gray-600 space-y-1">
                  <p><strong>Stage:</strong> {pendingStatusChange.stage}</p>
                  <p><strong>Clay Status:</strong> {pendingStatusChange.clay_status}</p>
                  <p><strong>Paint Status:</strong> {pendingStatusChange.paint_status}</p>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setNotifyDialogOpen(false)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={confirmStageStatusChange} className="flex-1">
                  Confirm Update
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Upload Proofs Dialog */}
        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Upload {uploadStage === 'clay' ? 'Clay' : 'Paint'} Proofs</DialogTitle>
              <DialogDescription>Upload new proof images for this revision round</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Revision Note (Optional)</Label>
                <Input
                  placeholder="e.g., Fixed hair color as requested"
                  value={uploadReason}
                  onChange={(e) => setUploadReason(e.target.value)}
                />
              </div>
              <DragDropUpload
                onFilesSelected={setUploadFiles}
                accept="image/*,.zip"
                multiple
              />
              {uploadFiles.length > 0 && (
                <p className="text-sm text-gray-600">{uploadFiles.length} file(s) selected</p>
              )}
              <Button onClick={handleUploadProofs} className="w-full" disabled={uploadFiles.length === 0}>
                <Upload className="w-4 h-4 mr-2" />
                Upload Proofs
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Changes Requested Dialog */}
        <Dialog open={changesDialogOpen} onOpenChange={setChangesDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Request Changes</DialogTitle>
              <DialogDescription>Describe the changes needed and upload reference images</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Change Description *</Label>
                <Textarea
                  placeholder="Please describe what needs to be changed..."
                  value={changesMessage}
                  onChange={(e) => setChangesMessage(e.target.value)}
                  rows={4}
                />
              </div>
              <div>
                <Label>Reference Images (Optional)</Label>
                <DragDropUpload
                  onFilesSelected={setChangesImages}
                  accept="image/*"
                  multiple
                />
              </div>
              {changesImages.length > 0 && (
                <p className="text-sm text-gray-600">{changesImages.length} reference image(s) selected</p>
              )}
              <Button onClick={handleSubmitChanges} className="w-full" disabled={!changesMessage}>
                Submit Changes Request
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Tracking Dialog */}
        <Dialog open={trackingDialogOpen} onOpenChange={setTrackingDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Tracking Information</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {order?.shopify_order_id && (
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <Button
                    onClick={handleFetchFromShopify}
                    disabled={fetchingFromShopify}
                    className="w-full"
                    variant="outline"
                  >
                    {fetchingFromShopify ? "Fetching..." : "📦 Fetch from Shopify"}
                  </Button>
                  <p className="text-xs text-gray-600 mt-2 text-center">
                    Automatically pull tracking info from Shopify order
                  </p>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="tracking-number">Tracking Number *</Label>
                <Input
                  id="tracking-number"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="1Z999AA10123456784"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tracking-company">Carrier</Label>
                <select
                  id="tracking-company"
                  className="w-full p-2 border rounded-md"
                  value={trackingCompany}
                  onChange={(e) => setTrackingCompany(e.target.value)}
                >
                  <option value="">Select Carrier</option>
                  <option value="UPS">UPS</option>
                  <option value="FedEx">FedEx</option>
                  <option value="USPS">USPS</option>
                  <option value="DHL">DHL</option>
                  <option value="Canada Post">Canada Post</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tracking-url">Tracking URL (Optional)</Label>
                <Input
                  id="tracking-url"
                  value={trackingUrl}
                  onChange={(e) => setTrackingUrl(e.target.value)}
                  placeholder="https://www.ups.com/track?tracknum=..."
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <Button
                  variant="outline"
                  onClick={() => setTrackingDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveTracking}
                  disabled={loading}
                >
                  {loading ? "Saving..." : "Save Tracking"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Image Preview Dialog */}
        <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
          <DialogContent className="max-w-4xl">
            <img src={selectedImage} alt="Preview" className="w-full rounded-lg" />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default OrderDetailsAdminNew;
