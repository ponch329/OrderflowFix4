import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Package, Upload, Edit, Save, Trash2, ChevronDown, ChevronUp, MessageCircle, Send, Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import DragDropUpload from "@/components/DragDropUpload";
import { getStageLabel, getStatusLabel } from "@/utils/labelMapper";
import OrderNotes from "@/components/OrderNotes";
import OrderTimeline from "@/components/OrderTimeline";
import { useBranding } from "@/contexts/BrandingContext";
import TrackingWidget from "@/components/TrackingWidget";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const OrderDetailsAdminNew = () => {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const { workflowConfig } = useBranding();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  // Dialogs
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [changesDialogOpen, setChangesDialogOpen] = useState(false);
  
  // Stage/Status editing
  const [editStageDialogOpen, setEditStageDialogOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState("");
  const [selectedClayStatus, setSelectedClayStatus] = useState("");
  const [selectedPaintStatus, setSelectedPaintStatus] = useState("");
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  
  // Order info editing
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editedOrderInfo, setEditedOrderInfo] = useState({});
  
  // Image preview
  const [selectedImage, setSelectedImage] = useState(null);
  
  // Proof upload
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadStage, setUploadStage] = useState("clay");
  const [revisionNote, setRevisionNote] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Changes request
  const [changeMessage, setChangeMessage] = useState("");
  const [changeFiles, setChangeFiles] = useState([]);
  const [changesStage, setChangesStage] = useState("clay");
  const [isSubmittingChanges, setIsSubmittingChanges] = useState(false);
  
  // Collapsible sections
  const [clayExpanded, setClayExpanded] = useState(true);
  const [paintExpanded, setPaintExpanded] = useState(true);
  
  // Edit approval dialog
  const [editApprovalDialogOpen, setEditApprovalDialogOpen] = useState(false);
  const [editApprovalStage, setEditApprovalStage] = useState("");
  const [editApprovalMessage, setEditApprovalMessage] = useState("");
  const [editApprovalImages, setEditApprovalImages] = useState([]);
  
  // Reply message dialog
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [replyMessage, setReplyMessage] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  useEffect(() => {
    // Set up authentication
    const token = localStorage.getItem('admin_token');
    if (!token) {
      toast.error("Please log in to continue");
      navigate('/admin/login');
      return;
    }
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    
    fetchOrder();
  }, [orderId, navigate]);
  
  // Helper to invalidate dashboard cache when order is modified
  const invalidateDashboardCache = () => {
    sessionStorage.setItem('orders_cache_invalidate', 'true');
  };

  const fetchOrder = async () => {
    try {
      // Fetch single order by ID for better performance
      const response = await axios.get(`${API}/orders/${orderId}`);
      const foundOrder = response.data;
      if (foundOrder) {
        setOrder(foundOrder);
        setSelectedStage(foundOrder.stage);
        setSelectedClayStatus(foundOrder.clay_status);
        setSelectedPaintStatus(foundOrder.paint_status);
        setEditedOrderInfo({
          customer_name: foundOrder.customer_name,
          customer_email: foundOrder.customer_email,
          order_number: foundOrder.order_number,
          tracking_number: foundOrder.tracking_number || '',
          carrier: foundOrder.carrier || ''
        });
        
        // Set collapse state based on current stage
        if (foundOrder.stage === 'paint') {
          setClayExpanded(false);
          setPaintExpanded(true);
        } else if (foundOrder.stage === 'shipped' || foundOrder.stage === 'fulfilled') {
          setClayExpanded(false);
          setPaintExpanded(false);
        }
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to fetch order");
    } finally {
      setLoading(false);
    }
  };

  const handleStageStatusChange = async () => {
    // If customer status changed, show notification dialog
    if (selectedClayStatus !== order.clay_status || selectedPaintStatus !== order.paint_status) {
      setChangesStage(selectedClayStatus === 'changes_requested' ? 'clay' : 'paint');
      setEditStageDialogOpen(false);
      setConfirmDialogOpen(true);
      return;
    }

    // Otherwise just update
    await confirmStageStatusChange();
  };

  const confirmStageStatusChange = async () => {
    try {
      await axios.patch(`${API}/admin/orders/${orderId}/status`, {
        stage: selectedStage,
        clay_status: selectedClayStatus,
        paint_status: selectedPaintStatus,
        notify_customer: notifyCustomer
      });
      
      toast.success(notifyCustomer ? "Status updated & customer notified!" : "Stage and status updated!");
      setConfirmDialogOpen(false);
      setEditStageDialogOpen(false);
      setNotifyCustomer(false);
      invalidateDashboardCache();
      fetchOrder();
    } catch (error) {
      toast.error("Failed to update status");
      console.error(error);
    }
  };

  const handleUploadProofs = async () => {
    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      const formData = new FormData();
      formData.append('stage', uploadStage);
      if (revisionNote) formData.append('revision_note', revisionNote);
      
      uploadFiles.forEach(file => {
        formData.append('files', file);
      });

      const token = localStorage.getItem('admin_token');
      await axios.post(`${API}/admin/orders/${orderId}/proofs`, formData, {
        headers: { 
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`
        },
        timeout: 120000, // 2 minute timeout for large files
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
        }
      });
      
      toast.success("Proofs uploaded successfully!");
      setUploadDialogOpen(false);
      setUploadFiles([]);
      setRevisionNote("");
      setUploadProgress(0);
      invalidateDashboardCache();
      fetchOrder();
    } catch (error) {
      toast.error("Failed to upload proofs");
      console.error(error);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleRequestChanges = async () => {
    setIsSubmittingChanges(true);
    try {
      const formData = new FormData();
      formData.append('status', 'changes_requested');
      formData.append('stage', changesStage);
      formData.append('message', changeMessage);
      
      changeFiles.forEach(file => {
        formData.append('files', file);
      });

      await axios.post(`${API}/admin/orders/${orderId}/request-changes`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000 // 2 minute timeout for large files
      });
      
      toast.success("Changes requested!");
      setChangesDialogOpen(false);
      setChangeMessage("");
      setChangeFiles([]);
      fetchOrder();
    } catch (error) {
      toast.error("Failed to request changes");
      console.error(error);
    } finally {
      setIsSubmittingChanges(false);
    }
  };

  const handleSaveEdit = async () => {
    try {
      await axios.patch(`${API}/admin/orders/${orderId}`, editedOrderInfo);
      toast.success("Order information updated!");
      setIsEditingInfo(false);
      fetchOrder();
    } catch (error) {
      toast.error("Failed to update order");
      console.error(error);
    }
  };

  const handleDeleteProof = async (stage, proofId) => {
    if (!window.confirm("Are you sure you want to delete this proof?")) return;
    
    try {
      const token = localStorage.getItem('admin_token');
      await axios.delete(`${API}/admin/orders/${orderId}/proofs/${proofId}?stage=${stage}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      toast.success("Proof deleted");
      fetchOrder();
    } catch (error) {
      toast.error("Failed to delete proof");
      console.error(error);
    }
  };

  const handleEditApproval = (stage) => {
    const approval = stage === 'clay' ? order.clay_approval : order.paint_approval;
    if (!approval) return;
    
    setEditApprovalStage(stage);
    setEditApprovalMessage(approval.message || "");
    setEditApprovalImages(approval.images || []);
    setEditApprovalDialogOpen(true);
  };

  const handleSaveApproval = async () => {
    try {
      await axios.patch(`${API}/orders/${orderId}/approval/${editApprovalStage}`, {
        message: editApprovalMessage
      });
      toast.success("Change request updated");
      setEditApprovalDialogOpen(false);
      fetchOrder();
    } catch (error) {
      toast.error("Failed to update change request");
      console.error(error);
    }
  };

  const handleDeleteApprovalImage = async (imageUrl) => {
    if (!window.confirm("Delete this image?")) return;
    
    try {
      await axios.delete(`${API}/orders/${orderId}/approval/${editApprovalStage}/image`, {
        data: { image_url: imageUrl }
      });
      toast.success("Image deleted");
      setEditApprovalImages(prev => prev.filter(img => img !== imageUrl));
      fetchOrder();
    } catch (error) {
      toast.error("Failed to delete image");
      console.error(error);
    }
  };

  const handleSendReply = async () => {
    if (!replyMessage.trim()) {
      toast.error("Please enter a message");
      return;
    }
    
    setSendingReply(true);
    try {
      const token = localStorage.getItem('admin_token');
      await axios.post(`${API}/admin/orders/${orderId}/reply`, {
        message: replyMessage
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      toast.success("Reply sent to customer via email");
      setReplyMessage("");
      setReplyDialogOpen(false);
      fetchOrder();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to send reply");
      console.error(error);
    } finally {
      setSendingReply(false);
    }
  };

  const [pingingCustomer, setPingingCustomer] = useState(false);
  
  const handlePingCustomer = async (stage) => {
    if (!window.confirm(`Send a reminder email to ${order?.customer_email} about their pending ${stage} proofs?`)) {
      return;
    }
    
    setPingingCustomer(true);
    try {
      const token = localStorage.getItem('admin_token');
      await axios.post(`${API}/admin/orders/${orderId}/ping-customer?stage=${stage}`, {}, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      toast.success(
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5" />
          <div>
            <strong>Reminder Sent!</strong>
            <p className="text-sm">Email sent to {order?.customer_email}</p>
          </div>
        </div>,
        { duration: 4000 }
      );
      fetchOrder(); // Refresh to show the new timeline event
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to send reminder");
      console.error(error);
    } finally {
      setPingingCustomer(false);
    }
  };

  const getStageColor = (stage) => {
    const colors = {
      clay: "bg-yellow-500",
      paint: "bg-blue-500",
      shipped: "bg-green-500",
      fulfilled: "bg-green-500",
      canceled: "bg-red-500"
    };
    return colors[stage] || "bg-gray-500";
  };

  const getStageTheme = (stage) => {
    const themes = {
      clay: {
        bgColor: "bg-[#fefce8]",
        badgeBg: "bg-[#eab308]",
        badgeText: "text-white",
        borderColor: "border-yellow-200"
      },
      paint: {
        bgColor: "bg-blue-50",
        badgeBg: "bg-blue-500",
        badgeText: "text-white",
        borderColor: "border-blue-200"
      }
    };
    return themes[stage] || themes.clay;
  };

  const getStatusInfo = (status) => {
    const map = {
      sculpting: "bg-gray-500",
      feedback_needed: "bg-blue-500",
      approved: "bg-green-500",
      changes_requested: "bg-orange-500",
      pending: "bg-gray-400"
    };
    return map[status] || "bg-gray-400";
  };

  const renderProofSection = (stage, proofs = [], approval = null) => {
    const statusField = `${stage}_status`;
    const status = order?.[statusField];
    const isExpanded = stage === 'clay' ? clayExpanded : paintExpanded;
    const setExpanded = stage === 'clay' ? setClayExpanded : setPaintExpanded;
    const theme = getStageTheme(stage);
    
    // Create chronological timeline of events
    const chronologicalEvents = [];
    
    // Add all proofs with their timestamps
    proofs.forEach(proof => {
      chronologicalEvents.push({
        type: 'proof',
        timestamp: proof.uploaded_at,
        data: proof
      });
    });
    
    // Add approval if it exists
    if (approval && approval.status === 'changes_requested') {
      chronologicalEvents.push({
        type: 'customer_changes',
        timestamp: approval.created_at,
        data: approval
      });
    }
    
    // Sort by timestamp (oldest first for chronological display)
    chronologicalEvents.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    // Group into rounds for display
    const displayGroups = [];
    let currentRound = [];
    let currentRoundNumber = null; // Start as null to detect first proof
    
    chronologicalEvents.forEach((event, idx) => {
      if (event.type === 'proof') {
        const proofRound = event.data.round || 1;
        
        // If this is a new round (different from current), save the old group and start new one
        if (currentRoundNumber !== null && proofRound !== currentRoundNumber && currentRound.length > 0) {
          displayGroups.push({ round: currentRoundNumber, items: [...currentRound] });
          currentRound = [];
        }
        
        // Update current round number and add event
        currentRoundNumber = proofRound;
        currentRound.push(event);
      } else if (event.type === 'customer_changes') {
        // Add customer changes after current round
        if (currentRound.length > 0) {
          displayGroups.push({ round: currentRoundNumber, items: [...currentRound] });
          currentRound = [];
          currentRoundNumber = null; // Reset for next round
        }
        displayGroups.push({ round: null, items: [event] });
      }
    });
    
    // Add remaining items
    if (currentRound.length > 0) {
      displayGroups.push({ round: currentRoundNumber, items: currentRound });
    }

    return (
      <Card className={`mb-4 border-2 ${theme.borderColor}`}>
        <CardHeader 
          className={`${theme.bgColor} border-b-2 ${theme.borderColor} cursor-pointer hover:opacity-90 transition-opacity py-3`}
          onClick={() => setExpanded(!isExpanded)}
        >
          <div className="flex justify-between items-center">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={`${theme.badgeBg} ${theme.badgeText} text-base px-3 py-1 uppercase font-semibold`}>
                  {getStageLabel(stage, workflowConfig)}
                </Badge>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-700" /> : <ChevronDown className="w-4 h-4 text-gray-700" />}
              </div>
              <CardDescription className="text-gray-700 text-sm mt-1">
                {proofs?.length || 0} proof image(s)
              </CardDescription>
            </div>
            <Badge className={`${getStatusInfo(status)} text-white text-sm px-3 py-1 uppercase`}>
              {getStatusLabel(status, workflowConfig)}
            </Badge>
          </div>
          {isExpanded && (
            <Button 
              onClick={(e) => { 
                e.stopPropagation(); 
                setUploadStage(stage); 
                setUploadDialogOpen(true); 
              }}
              className="mt-4 w-full"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Proofs
            </Button>
          )}
        </CardHeader>
        
        {isExpanded && (
          <CardContent className="pt-4">
            {displayGroups.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Package className="w-16 h-16 mx-auto mb-3 text-gray-300" />
                <p>No proofs uploaded yet</p>
                <p className="text-sm">Upload proofs using the button above</p>
              </div>
            ) : (
              <div className="space-y-6">
                {displayGroups.map((group, groupIdx) => (
                  <div key={groupIdx}>
                    {group.round !== null && (
                      <div className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {(() => {
                              // Get all unique round numbers from proofs
                              const allRounds = [...new Set(proofs.map(p => p.round || 1))].sort((a, b) => a - b);
                              const totalRounds = allRounds.length;
                              const isLatestRound = group.round === Math.max(...allRounds);
                              // Get the upload timestamp from the first proof in this round
                              const firstProofInRound = group.items.find(item => item.type === 'proof');
                              const uploadedAt = firstProofInRound?.data?.uploaded_at;
                              
                              return (
                                <>
                                  <div>
                                    <h4 className="font-semibold text-gray-800">
                                      Round {group.round} {totalRounds > 1 && `of ${totalRounds}`}
                                    </h4>
                                    {uploadedAt && (
                                      <p className="text-xs text-gray-500">
                                        Sent: {new Date(uploadedAt).toLocaleString()}
                                      </p>
                                    )}
                                  </div>
                                  {isLatestRound && (
                                    <Badge className="bg-green-600 text-white text-sm px-2 py-0.5">
                                      ⭐ LATEST REVISION
                                    </Badge>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                          {/* Ping Customer Button - only show for latest round with feedback_needed status */}
                          {(() => {
                            const allRounds = [...new Set(proofs.map(p => p.round || 1))].sort((a, b) => a - b);
                            const isLatestRound = group.round === Math.max(...allRounds);
                            const stageStatus = order?.[`${stage}_status`];
                            
                            if (isLatestRound && stageStatus === 'feedback_needed') {
                              return (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handlePingCustomer(stage)}
                                  disabled={pingingCustomer}
                                  className="text-orange-600 border-orange-300 hover:bg-orange-50"
                                >
                                  <Bell className="w-4 h-4 mr-1" />
                                  {pingingCustomer ? "Sending..." : "Remind Customer"}
                                </Button>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        
                        <div className="grid grid-cols-3 gap-4">
                          {group.items.filter(item => item.type === 'proof').map((item, idx) => (
                            <div key={idx} className="relative group">
                              <img 
                                src={item.data.url} 
                                alt={`Proof ${idx + 1}`}
                                loading="lazy"
                                className="w-full h-48 object-cover rounded border-2 cursor-pointer hover:border-blue-500 transition"
                                onClick={() => setSelectedImage(item.data.url)}
                              />
                              <button
                                onClick={() => handleDeleteProof(stage, item.data.id)}
                                className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Delete proof"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Customer Change Request */}
                    {group.items.some(item => item.type === 'customer_changes') && (
                      <div className="border-2 border-orange-300 rounded-lg p-4 bg-orange-50">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-semibold text-orange-800 flex items-center gap-2">
                            Customer Requested Changes
                          </h4>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => setReplyDialogOpen(true)}
                              className="bg-purple-600 hover:bg-purple-700 text-white"
                            >
                              <MessageCircle className="w-4 h-4 mr-1" />
                              Reply
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditApproval(stage)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-gray-700 whitespace-pre-wrap">{group.items.find(i => i.type === 'customer_changes')?.data.message}</p>
                        {group.items.find(i => i.type === 'customer_changes')?.data.images?.length > 0 && (
                          <div className="grid grid-cols-4 gap-2 mt-3">
                            {group.items.find(i => i.type === 'customer_changes')?.data.images.map((img, idx) => (
                              <img 
                                key={idx}
                                src={img} 
                                alt={`Reference ${idx + 1}`}
                                loading="lazy"
                                className="w-full h-24 object-cover rounded border cursor-pointer hover:border-orange-500 transition"
                                onClick={() => setSelectedImage(img)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading order...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Order not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <Button 
          variant="ghost" 
          onClick={() => {
            const returnPath = sessionStorage.getItem('orderDetailsReturnPath') || '/admin/dashboard';
            sessionStorage.removeItem('orderDetailsReturnPath');
            navigate(returnPath);
          }}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>

        {/* Order Header */}
        <Card className="mb-6">
          <CardHeader className="bg-gradient-to-r from-purple-600 to-blue-600 text-white">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <CardTitle className="text-2xl text-white">
                    Order #{order.order_number}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditStageDialogOpen(true)}
                    className="text-white hover:bg-white/20"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Badge className={`${getStageColor(order.stage)} text-white text-sm px-3 py-1`}>
                    {getStageLabel(order.stage, workflowConfig)}
                  </Badge>
                  {order.clay_status && (
                    <Badge className={`${getStatusInfo(order.clay_status)} text-white text-sm px-3 py-1`}>
                      Clay: {getStatusLabel(order.clay_status, workflowConfig)}
                    </Badge>
                  )}
                  {order.paint_status && order.paint_status !== 'pending' && (
                    <Badge className={`${getStatusInfo(order.paint_status)} text-white text-sm px-3 py-1`}>
                      Paint: {getStatusLabel(order.paint_status, workflowConfig)}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Order Info - COMPACT VERSION */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg">Order Information</CardTitle>
              {!isEditingInfo ? (
                <Button variant="outline" size="sm" onClick={() => setIsEditingInfo(true)}>
                  <Edit className="w-3 h-3 mr-1" />
                  Edit Info
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {!isEditingInfo ? (
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <Label className="text-xs text-gray-500">Order Number</Label>
                    <p className="font-semibold text-sm">{order.order_number}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Customer Name</Label>
                    <p className="font-semibold text-sm">{order.customer_name}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Customer Email</Label>
                    <p className="font-semibold text-sm truncate">{order.customer_email}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Vendor</Label>
                    <p className="font-semibold text-sm">{order.item_vendor || 'N/A'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                  <div>
                    <Label className="text-xs text-gray-500">Tracking Number</Label>
                    <p className="font-semibold text-sm">{order.tracking_number || 'Not set'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Carrier</Label>
                    <p className="font-semibold text-sm">{order.carrier || order.tracking_company || 'Not set'}</p>
                  </div>
                </div>
                {order.tracking_number && (
                  <div className="pt-2">
                    <TrackingWidget 
                      trackingNumber={order.tracking_number}
                      carrier={order.carrier || order.tracking_company}
                      trackingUrl={order.tracking_url}
                      shipmentStatus={order.shipment_status}
                      shippedAt={order.shipped_at}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Customer Name</Label>
                    <Input 
                      value={editedOrderInfo.customer_name}
                      onChange={(e) => setEditedOrderInfo({...editedOrderInfo, customer_name: e.target.value})}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Customer Email</Label>
                    <Input 
                      value={editedOrderInfo.customer_email}
                      onChange={(e) => setEditedOrderInfo({...editedOrderInfo, customer_email: e.target.value})}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Order Number</Label>
                  <Input 
                    value={editedOrderInfo.order_number}
                    onChange={(e) => setEditedOrderInfo({...editedOrderInfo, order_number: e.target.value})}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Tracking Number</Label>
                    <Input 
                      value={editedOrderInfo.tracking_number || ''}
                      onChange={(e) => setEditedOrderInfo({...editedOrderInfo, tracking_number: e.target.value})}
                      className="h-8 text-sm"
                      placeholder="Enter tracking number"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Carrier</Label>
                    <select
                      value={editedOrderInfo.carrier || ''}
                      onChange={(e) => setEditedOrderInfo({...editedOrderInfo, carrier: e.target.value})}
                      className="h-8 text-sm w-full border rounded-md px-2"
                    >
                      <option value="">Select carrier</option>
                      <option value="USPS">USPS</option>
                      <option value="FedEx">FedEx</option>
                      <option value="UPS">UPS</option>
                      <option value="DHL">DHL</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setIsEditingInfo(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSaveEdit}>
                    <Save className="w-3 h-3 mr-1" />
                    Save
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Order Timeline - MOVED ABOVE Clay Stage */}
        <OrderTimeline timeline={order.timeline || []} />

        {/* Clay Stage */}
        {renderProofSection('clay', order.clay_proofs || [], order.clay_approval)}

        {/* Paint Stage */}
        {renderProofSection('paint', order.paint_proofs || [], order.paint_approval)}

        {/* Order Notes - Moved to bottom */}
        <OrderNotes 
          orderId={orderId} 
          notes={order.notes || []} 
          onNotesUpdate={fetchOrder}
        />

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
                    <SelectItem value="sculpting">Painting</SelectItem>
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
        <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Notify Customer?</DialogTitle>
            </DialogHeader>
            <p className="text-gray-600 mb-4">
              Would you like to send an email notification to the customer about this status change?
            </p>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setNotifyCustomer(false);
                  confirmStageStatusChange();
                }}
                className="flex-1"
              >
                No, Don't Notify
              </Button>
              <Button 
                onClick={() => {
                  setNotifyCustomer(true);
                  confirmStageStatusChange();
                }}
                className="flex-1"
              >
                Yes, Notify Customer
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Upload Proofs Dialog */}
        <Dialog open={uploadDialogOpen} onOpenChange={(open) => !isUploading && setUploadDialogOpen(open)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Upload Proofs - {uploadStage === 'clay' ? 'Clay' : 'Paint'} Stage</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Revision Note (Optional)</Label>
                <Textarea 
                  placeholder="Add a note about this revision..."
                  value={revisionNote}
                  onChange={(e) => setRevisionNote(e.target.value)}
                  disabled={isUploading}
                />
              </div>
              <DragDropUpload
                onFilesSelected={setUploadFiles}
                accept="image/*,.zip"
                multiple
                disabled={isUploading}
              />
              {uploadFiles.length > 0 && (
                <p className="text-sm text-gray-600">{uploadFiles.length} file(s) selected</p>
              )}
              
              {/* Upload Progress */}
              {isUploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Uploading and processing...</span>
                    <span className="font-medium">{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                  <p className="text-xs text-gray-500 text-center">
                    Please wait while your files are being processed. This may take a moment for large files.
                  </p>
                </div>
              )}
              
              <Button 
                onClick={handleUploadProofs} 
                className="w-full" 
                disabled={uploadFiles.length === 0 || isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading... {uploadProgress}%
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Proofs
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Changes Requested Dialog */}
        <Dialog open={changesDialogOpen} onOpenChange={setChangesDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Request Changes</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Stage</Label>
                <Select value={changesStage} onValueChange={setChangesStage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clay">Clay</SelectItem>
                    <SelectItem value="paint">Paint</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Change Message</Label>
                <Textarea 
                  placeholder="Describe the changes needed..."
                  value={changeMessage}
                  onChange={(e) => setChangeMessage(e.target.value)}
                  disabled={isSubmittingChanges}
                />
              </div>
              <DragDropUpload
                onFilesSelected={setChangeFiles}
                accept="image/*"
                multiple
                disabled={isSubmittingChanges}
              />
              <Button 
                onClick={handleRequestChanges} 
                className="w-full"
                disabled={isSubmittingChanges}
              >
                {isSubmittingChanges ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Changes Request"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Image Preview Dialog */}
        <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
          <DialogContent className="max-w-4xl">
            <img src={selectedImage} alt="Preview" className="w-full h-auto" />
          </DialogContent>
        </Dialog>

        {/* Edit Approval Dialog */}
        <Dialog open={editApprovalDialogOpen} onOpenChange={setEditApprovalDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Customer Change Request</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Customer's Message</Label>
                <Textarea 
                  value={editApprovalMessage}
                  onChange={(e) => setEditApprovalMessage(e.target.value)}
                  rows={4}
                />
              </div>
              
              {editApprovalImages.length > 0 && (
                <div>
                  <Label>Reference Images</Label>
                  <div className="grid grid-cols-3 gap-4 mt-2">
                    {editApprovalImages.map((img, idx) => (
                      <div key={idx} className="relative group">
                        <img 
                          src={img} 
                          alt={`Reference ${idx + 1}`}
                          className="w-full h-32 object-cover rounded border"
                        />
                        <button
                          onClick={() => handleDeleteApprovalImage(img)}
                          className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete image"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button 
                  variant="outline" 
                  onClick={() => setEditApprovalDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleSaveApproval}>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Reply Message Dialog */}
        <Dialog open={replyDialogOpen} onOpenChange={setReplyDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-purple-600" />
                Reply to Customer
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-gray-600">
                Your message will be sent to <strong>{order?.customer_email}</strong> and logged in the order timeline.
              </p>
              <Textarea
                placeholder="Type your message to the customer..."
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                className="min-h-[150px]"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setReplyDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSendReply}
                  disabled={sendingReply || !replyMessage.trim()}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {sendingReply ? (
                    "Sending..."
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Reply
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default OrderDetailsAdminNew;
