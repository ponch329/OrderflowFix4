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
import { ArrowLeft, CheckCircle, XCircle, Image as ImageIcon, Upload, Bell } from "lucide-react";
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
  const isAdmin = location.state?.isAdmin || false;

  useEffect(() => {
    if (!order) {
      // Fetch order if not in state
      fetchOrder();
    }
  }, [orderId]);

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
      await axios.post(`${API}/customer/orders/${orderId}/approve?stage=${stage}`, {
        status: "approved"
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
    const canInteract = !isAdmin && order.stage === stage && !approval;

    return (
      <Card className="mb-6" data-testid={`${stage}-section`}>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-2xl capitalize">{stage} Stage</CardTitle>
              <CardDescription>
                {proofs?.length || 0} proof image(s)
              </CardDescription>
            </div>
            {approval && (
              <Badge 
                className={approval.status === "approved" ? "bg-green-500" : "bg-orange-500"}
                data-testid={`${stage}-approval-badge`}
              >
                {approval.status === "approved" ? "✓ Approved" : "⚠ Changes Requested"}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {proofs && proofs.length > 0 ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {proofs.map((proof, idx) => (
                  <div 
                    key={proof.id} 
                    className="relative group cursor-pointer"
                    onClick={() => setSelectedImage(proof.url)}
                    data-testid={`proof-image-${stage}-${idx}`}
                  >
                    <img 
                      src={proof.url} 
                      alt={proof.filename}
                      className="w-full h-48 object-cover rounded-lg shadow-md group-hover:shadow-xl transition-shadow"
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all rounded-lg flex items-center justify-center">
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
                    className="flex-1 border-orange-500 text-orange-600 hover:bg-orange-50 h-12"
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
                  <p className="font-semibold mb-2">Requested Changes:</p>
                  <p className="text-gray-700">{approval.message || "No message provided"}</p>
                  {approval.images && approval.images.length > 0 && (
                    <p className="text-sm text-gray-600 mt-2">{approval.images.length} reference image(s) attached</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <ImageIcon className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p>No proofs uploaded yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container mx-auto px-4 py-8">
        <Button 
          variant="ghost" 
          onClick={() => navigate(isAdmin ? '/admin' : '/customer')}
          className="mb-6"
          data-testid="back-btn"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-3xl">Order #{order.order_number}</CardTitle>
                <CardDescription className="text-lg mt-2">
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
