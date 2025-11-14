import { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ArrowLeft, CheckCircle, XCircle, Image as ImageIcon, Upload, Bell, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { getStatusInfo, shouldShowPingButton } from "@/utils/orderHelpers";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const OrderDetails = () => {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState(location.state?.order || null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [changeMessage, setChangeMessage] = useState("");
  const [changeImages, setChangeImages] = useState([]);
  const [currentStage, setCurrentStage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [clayExpanded, setClayExpanded] = useState(true);
  const [paintExpanded, setPaintExpanded] = useState(true);
  const isAdmin = location.state?.isAdmin || false;

  useEffect(() => {
    if (!order) {
      // Fetch order if not in state
      fetchOrder();
    } else {
      // Set collapse state based on current stage
      if (order.stage === 'paint') {
        setClayExpanded(false); // Minimize clay when on paint
        setPaintExpanded(true);
      } else if (order.stage === 'shipped') {
        setClayExpanded(false); // Minimize both when shipped
        setPaintExpanded(false);
      }
    }
  }, [orderId, order]);

  const fetchOrder = async () => {
    try {
      const response = await axios.get(`${API}/admin/orders`);
      const foundOrder = response.data.find(o => o.id === orderId);
      if (foundOrder) {
        setOrder(foundOrder);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleApprove = async (stage) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("status", "approved");
      
      await axios.post(`${API}/customer/orders/${orderId}/approve?stage=${stage}`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      toast.success(`${stage.charAt(0).toUpperCase() + stage.slice(1)} stage approved!`);
      fetchOrder();
    } catch (error) {
      toast.error("Failed to approve");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestChanges = async (stage) => {
    if (!changeMessage.trim()) {
      toast.error("Please describe the changes you'd like");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("status", "changes_requested");
      formData.append("message", changeMessage);
      
      for (let file of changeImages) {
        formData.append("files", file);
      }

      await axios.post(`${API}/customer/orders/${orderId}/approve?stage=${stage}`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      
      toast.success("Change request submitted!");
      setChangeMessage("");
      setChangeImages([]);
      setCurrentStage(null);
      fetchOrder();
    } catch (error) {
      toast.error("Failed to submit changes");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handlePingCustomer = async (stage) => {
    try {
      await axios.post(`${API}/admin/orders/${orderId}/ping-customer?stage=${stage}`);
      toast.success(`Reminder sent to customer for ${stage} stage`);
    } catch (error) {
      toast.error("Failed to send reminder");
      console.error(error);
    }
  };

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  const getStageColor = (stage) => {
    switch(stage) {
      case "clay": return "bg-yellow-500";
      case "paint": return "bg-blue-500";
      case "shipped": return "bg-green-500";
      default: return "bg-gray-500";
    }
  };

  const renderProofSection = (stage, proofs, approval) => {
    const statusField = `${stage}_status`;
    const status = order[statusField];
    const statusInfo = getStatusInfo(status, stage);
    const canInteract = !isAdmin && status === "feedback_needed" && !approval;
    
    // Get the date proofs were uploaded (use first proof's uploaded_at)
    const proofsUploadedDate = proofs && proofs.length > 0 && proofs[0].uploaded_at
      ? new Date(proofs[0].uploaded_at).toLocaleDateString('en-US', { 
          month: 'long', 
          day: 'numeric', 
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        })
      : null;
    
    // Get customer response date
    const customerResponseDate = approval && approval.created_at
      ? new Date(approval.created_at).toLocaleDateString('en-US', { 
          month: 'long', 
          day: 'numeric', 
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        })
      : null;

    return (
      <Card className="mb-6 border-2 border-gray-200" data-testid={`${stage}-section`}>
        <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 border-b-2 border-blue-200">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-2xl capitalize text-blue-900">{stage} Stage</CardTitle>
              <CardDescription className="text-blue-700">
                {proofs?.length || 0} proof image(s)
              </CardDescription>
              <div className="mt-2">
                <Badge className={`${statusInfo.color} text-white`}>
                  {isAdmin ? statusInfo.adminLabel : statusInfo.customerLabel}
                </Badge>
              </div>
            </div>
            {approval && (
              <Badge 
                className={approval.status === "approved" ? "bg-green-600 text-white" : "bg-orange-600 text-white"}
                data-testid={`${stage}-approval-badge`}
              >
                {approval.status === "approved" ? "✓ Approved" : "⚠ Changes Requested"}
              </Badge>
            )}
          </div>
          {isAdmin && shouldShowPingButton(order, stage) && (
            <Button 
              variant="outline"
              className="mt-4 border-blue-600 text-blue-700 hover:bg-blue-50"
              onClick={() => handlePingCustomer(stage)}
              data-testid={`ping-customer-${stage}-btn`}
            >
              <Bell className="w-4 h-4 mr-2" />
              Send Reminder to Customer
            </Button>
          )}
        </CardHeader>
        <CardContent className="pt-6">
          {/* Timeline */}
          {proofs && proofs.length > 0 && (
            <div className="mb-6 bg-blue-50 p-4 rounded-lg border-l-4 border-blue-600">
              <h4 className="font-semibold text-blue-900 mb-3">Order Timeline</h4>
              <div className="space-y-3">
                {proofsUploadedDate && (
                  <div className="flex items-start">
                    <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 mr-3"></div>
                    <div>
                      <p className="font-medium text-gray-900">Proofs Sent</p>
                      <p className="text-sm text-gray-600">{proofsUploadedDate}</p>
                    </div>
                  </div>
                )}
                
                {approval && customerResponseDate && (
                  <div className="flex items-start">
                    <div className={`w-2 h-2 rounded-full mt-2 mr-3 ${approval.status === 'approved' ? 'bg-green-600' : 'bg-orange-600'}`}></div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {approval.status === 'approved' ? 'Customer Approved' : 'Changes Requested'}
                      </p>
                      <p className="text-sm text-gray-600">{customerResponseDate}</p>
                      {approval.message && (
                        <p className="text-sm text-gray-700 mt-1 italic">"{approval.message}"</p>
                      )}
                    </div>
                  </div>
                )}
                
                {!approval && status === 'feedback_needed' && (
                  <div className="flex items-start">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 mr-3 animate-pulse"></div>
                    <div>
                      <p className="font-medium text-gray-900">Awaiting Your Response</p>
                      <p className="text-sm text-gray-600">Please review and approve or request changes</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {proofs && proofs.length > 0 ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {proofs.map((proof, idx) => (
                  <div 
                    key={proof.id} 
                    className="relative group cursor-pointer border-2 border-gray-200 rounded-lg overflow-hidden hover:border-blue-600 transition-all"
                    onClick={() => setSelectedImage(proof.url)}
                    data-testid={`proof-image-${stage}-${idx}`}
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

              {canInteract && (
                <div className="flex gap-4">
                  <Button 
                    className="flex-1 bg-green-600 hover:bg-green-700 h-12"
                    onClick={() => handleApprove(stage)}
                    disabled={loading}
                    data-testid={`approve-${stage}-btn`}
                  >
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Approve
                  </Button>
                  <Button 
                    variant="outline"
                    className="flex-1 border-2 border-orange-500 text-orange-700 hover:bg-orange-50 h-12"
                    onClick={() => setCurrentStage(stage)}
                    data-testid={`request-changes-${stage}-btn`}
                  >
                    <XCircle className="w-5 h-5 mr-2" />
                    Request Changes
                  </Button>
                </div>
              )}

              {approval && approval.status === "changes_requested" && (
                <div className="mt-4 p-4 bg-orange-50 border-l-4 border-orange-500 rounded" data-testid={`${stage}-changes-message`}>
                  <p className="font-semibold mb-2 text-orange-900">Your Requested Changes:</p>
                  <p className="text-gray-700">{approval.message || "No message provided"}</p>
                  {approval.images && approval.images.length > 0 && (
                    <p className="text-sm text-gray-600 mt-2">{approval.images.length} reference image(s) attached</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
              <ImageIcon className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p>No proofs uploaded yet</p>
              <p className="text-sm mt-1">You'll be notified when proofs are ready for review</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-8">
        <Button 
          variant="ghost" 
          onClick={() => navigate(isAdmin ? '/admin' : '/customer')}
          className="mb-6 text-blue-700"
          data-testid="back-btn"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {isAdmin ? 'Back to Dashboard' : 'Back to Search'}
        </Button>

        <Card className="mb-6 border-2 border-blue-200">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700">
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-3xl text-white">Order #{order.order_number}</CardTitle>
                <CardDescription className="text-lg mt-2 text-blue-100">
                  {order.customer_name} • {order.customer_email}
                </CardDescription>
              </div>
              <Badge className={`${getStageColor(order.stage)} text-white text-lg px-4 py-2`} data-testid="current-stage-badge">
                {order.stage.toUpperCase()}
              </Badge>
            </div>
          </CardHeader>
        </Card>

        {renderProofSection("clay", order.clay_proofs, order.clay_approval)}
        {renderProofSection("paint", order.paint_proofs, order.paint_approval)}

        {/* Image Lightbox */}
        <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
          <DialogContent className="max-w-4xl" data-testid="image-lightbox">
            <img src={selectedImage} alt="Proof" className="w-full h-auto rounded-lg" />
          </DialogContent>
        </Dialog>

        {/* Request Changes Dialog */}
        <Dialog open={!!currentStage} onOpenChange={() => setCurrentStage(null)}>
          <DialogContent data-testid="request-changes-dialog">
            <CardHeader>
              <CardTitle>Request Changes</CardTitle>
              <CardDescription>
                Describe the changes you'd like for the {currentStage} stage
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="changes">Changes Needed</Label>
                <Textarea
                  id="changes"
                  placeholder="Please describe what you'd like changed..."
                  value={changeMessage}
                  onChange={(e) => setChangeMessage(e.target.value)}
                  rows={5}
                  data-testid="changes-textarea"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reference-images">Reference Images (Optional)</Label>
                <Input
                  id="reference-images"
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => setChangeImages(Array.from(e.target.files))}
                  data-testid="reference-images-input"
                />
                {changeImages.length > 0 && (
                  <p className="text-sm text-gray-600">{changeImages.length} file(s) selected</p>
                )}
              </div>
              <Button 
                onClick={() => handleRequestChanges(currentStage)} 
                className="w-full bg-orange-600 hover:bg-orange-700"
                disabled={loading}
                data-testid="submit-changes-btn"
              >
                <Upload className="w-4 h-4 mr-2" />
                Submit Changes
              </Button>
            </CardContent>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default OrderDetails;
