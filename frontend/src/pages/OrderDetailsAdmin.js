import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Upload, CheckCircle, XCircle, Edit, Save, Bell } from "lucide-react";
import { toast } from "sonner";
import DragDropUpload from "@/components/DragDropUpload";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const OrderDetailsAdmin = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  
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
    // If changing to changes_requested, show the changes dialog instead
    if (selectedClayStatus === 'changes_requested' || selectedPaintStatus === 'changes_requested') {
      setChangesStage(selectedClayStatus === 'changes_requested' ? 'clay' : 'paint');
      setEditStageDialogOpen(false);
      setChangesDialogOpen(true);
      return;
    }

    // Store pending change and show notification dialog
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

  // Group proofs by revision/round
  const getProofRounds = (proofs) => {
    const rounds = {};
    proofs.forEach(proof => {
      const round = proof.round || 1;
      if (!rounds[round]) {
        rounds[round] = [];
      }
      rounds[round].push(proof);
    });
    return rounds;
  };

  const clayRounds = getProofRounds(order.clay_proofs || []);
  const paintRounds = getProofRounds(order.paint_proofs || []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate('/admin')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Order #{order.order_number}</h1>
            {order.tracking_number && (
              <p className="text-sm text-gray-600 mt-1">
                📦 <strong>Tracking:</strong>{' '}
                <a 
                  href={order.tracking_url || `https://www.google.com/search?q=track+${order.tracking_number}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline hover:text-blue-800 font-semibold"
                >
                  {order.tracking_number}
                </a>
                {order.tracking_company && ` via ${order.tracking_company}`}
              </p>
            )}
          </div>
          {order.parent_order_id && (
            <Badge variant="outline" className="bg-blue-50">Sub-order</Badge>
          )}
        </div>

        {/* Order Info Card with Edit */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Order Information</CardTitle>
              {!editMode ? (
                <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSaveEdit}>
                    <Save className="w-4 h-4 mr-2" />
                    Save
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {editMode ? (
              <>
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
              </>
            ) : (
              <>
                <div>
                  <p className="text-sm text-gray-500">Customer</p>
                  <p className="font-semibold">{order.customer_name}</p>
                  <p className="text-sm text-gray-600">{order.customer_email}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Vendor</p>
                  <p className="font-semibold">{order.item_vendor || "N/A"}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Stage & Status Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Stage & Status</CardTitle>
              <Button onClick={() => setEditStageDialogOpen(true)}>
                Change Stage/Status
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-gray-500">Current Stage</p>
              <Badge className="mt-1">{order.stage}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Clay Status</p>
                <Badge variant="outline" className="mt-1">{order.clay_status}</Badge>
              </div>
              <div>
                <p className="text-sm text-gray-500">Paint Status</p>
                <Badge variant="outline" className="mt-1">{order.paint_status}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Customer Change Requests - Clay */}
        {order.clay_approval && order.clay_approval.status === 'changes_requested' && (
          <Card className="mb-6 border-orange-300 bg-orange-50">
            <CardHeader>
              <CardTitle className="text-orange-800 flex items-center gap-2">
                <XCircle className="w-5 h-5" />
                Customer Requested Clay Changes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Customer Message:</p>
                  <p className="font-medium bg-white p-3 rounded border border-orange-200">
                    {order.clay_approval.message || "No message provided"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Requested on:</p>
                  <p className="text-sm">{new Date(order.clay_approval.created_at).toLocaleString()}</p>
                </div>
                {order.clay_approval.images && order.clay_approval.images.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-500 mb-2">Reference Images:</p>
                    <div className="grid grid-cols-4 gap-2">
                      {order.clay_approval.images.map((img, idx) => (
                        <img key={idx} src={img} alt={`Reference ${idx + 1}`} className="w-full rounded border" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Clay Proofs by Round */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Clay Proofs</CardTitle>
              <Button onClick={() => { setUploadStage('clay'); setUploadDialogOpen(true); }}>
                <Upload className="w-4 h-4 mr-2" />
                Upload Clay Proofs
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {Object.keys(clayRounds).length === 0 ? (
              <p className="text-gray-500">No clay proofs uploaded yet</p>
            ) : (
              <div className="space-y-6">
                {Object.keys(clayRounds).sort((a, b) => b - a).map(round => {
                  const roundProofs = clayRounds[round];
                  const roundDate = roundProofs[0]?.uploaded_at ? new Date(roundProofs[0].uploaded_at).toLocaleDateString() : 'N/A';
                  
                  return (
                    <div key={round} className="border-l-4 border-blue-500 pl-4">
                      <div className="flex items-center gap-2 mb-3">
                        <h3 className="font-bold">Round {round}</h3>
                        {round == Math.max(...Object.keys(clayRounds)) && (
                          <Badge className="bg-green-500">Latest</Badge>
                        )}
                        <span className="text-sm text-gray-500">• Sent {roundDate}</span>
                        {roundProofs[0]?.revision_note && (
                          <p className="text-sm text-gray-600">• {roundProofs[0].revision_note}</p>
                        )}
                      </div>
                      <div className="grid grid-cols-4 gap-4">
                        {roundProofs.map(proof => (
                          <div key={proof.id} className="relative">
                            <img src={proof.url} alt={proof.filename} className="w-full rounded border" />
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(proof.uploaded_at).toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Customer Change Requests - Paint */}
        {order.paint_approval && order.paint_approval.status === 'changes_requested' && (
          <Card className="mb-6 border-orange-300 bg-orange-50">
            <CardHeader>
              <CardTitle className="text-orange-800 flex items-center gap-2">
                <XCircle className="w-5 h-5" />
                Customer Requested Paint Changes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Customer Message:</p>
                  <p className="font-medium bg-white p-3 rounded border border-orange-200">
                    {order.paint_approval.message || "No message provided"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Requested on:</p>
                  <p className="text-sm">{new Date(order.paint_approval.created_at).toLocaleString()}</p>
                </div>
                {order.paint_approval.images && order.paint_approval.images.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-500 mb-2">Reference Images:</p>
                    <div className="grid grid-cols-4 gap-2">
                      {order.paint_approval.images.map((img, idx) => (
                        <img key={idx} src={img} alt={`Reference ${idx + 1}`} className="w-full rounded border" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Paint Proofs by Round */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Paint Proofs</CardTitle>
              <Button onClick={() => { setUploadStage('paint'); setUploadDialogOpen(true); }}>
                <Upload className="w-4 h-4 mr-2" />
                Upload Paint Proofs
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {Object.keys(paintRounds).length === 0 ? (
              <p className="text-gray-500">No paint proofs uploaded yet</p>
            ) : (
              <div className="space-y-6">
                {Object.keys(paintRounds).sort((a, b) => b - a).map(round => {
                  const roundProofs = paintRounds[round];
                  const roundDate = roundProofs[0]?.uploaded_at ? new Date(roundProofs[0].uploaded_at).toLocaleDateString() : 'N/A';
                  
                  return (
                    <div key={round} className="border-l-4 border-purple-500 pl-4">
                      <div className="flex items-center gap-2 mb-3">
                        <h3 className="font-bold">Round {round}</h3>
                        {round == Math.max(...Object.keys(paintRounds)) && (
                          <Badge className="bg-green-500">Latest</Badge>
                        )}
                        <span className="text-sm text-gray-500">• Sent {roundDate}</span>
                        {roundProofs[0]?.revision_note && (
                          <p className="text-sm text-gray-600">• {roundProofs[0].revision_note}</p>
                        )}
                      </div>
                      <div className="grid grid-cols-4 gap-4">
                        {roundProofs.map(proof => (
                          <div key={proof.id} className="relative">
                            <img src={proof.url} alt={proof.filename} className="w-full rounded border" />
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(proof.uploaded_at).toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

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
      </div>
    </div>
  );
};

export default OrderDetailsAdmin;
