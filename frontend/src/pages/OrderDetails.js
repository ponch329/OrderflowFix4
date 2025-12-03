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
import { useBranding } from "@/contexts/BrandingContext";
import { getStageLabel, getStatusLabel } from "@/utils/labelMapper";

const BACKEND_URL = window.location.origin;
const API = `${BACKEND_URL}/api`;

const OrderDetails = () => {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const location = useLocation();
  const { workflowConfig } = useBranding();
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
    // Customer can interact with the latest round if status is feedback_needed
    const canInteract = !isAdmin && status === "feedback_needed";
    const isExpanded = stage === 'clay' ? clayExpanded : paintExpanded;
    const setExpanded = stage === 'clay' ? setClayExpanded : setPaintExpanded;
    
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
      <Card className="mb-4 border-2 border-gray-200" data-testid={`${stage}-section`}>
        <CardHeader 
          className="bg-gradient-to-r from-blue-50 to-blue-100 border-b-2 border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors py-3"
          onClick={() => setExpanded(!isExpanded)}
        >
          <div className="flex justify-between items-center">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-xl capitalize text-blue-900">{getStageLabel(stage, workflowConfig)}</CardTitle>
                <Badge className={`${statusInfo.color} text-white text-sm px-2 py-0.5`}>
                  {getStatusLabel(status, workflowConfig)}
                </Badge>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-blue-700" /> : <ChevronDown className="w-4 h-4 text-blue-700" />}
              </div>
              <CardDescription className="text-blue-700 text-sm">
                {proofs?.length || 0} proof image(s)
              </CardDescription>
            </div>
          </div>
          {isAdmin && shouldShowPingButton(order, stage) && isExpanded && (
            <Button 
              variant="outline"
              className="mt-4 border-blue-600 text-blue-700 hover:bg-blue-50"
              onClick={(e) => {
                e.stopPropagation();
                handlePingCustomer(stage);
              }}
              data-testid={`ping-customer-${stage}-btn`}
            >
              <Bell className="w-4 h-4 mr-2" />
              Send Reminder to Customer
            </Button>
          )}
        </CardHeader>
        
        {isExpanded && (
          <CardContent className="pt-6">
          {proofs && proofs.length > 0 ? (
            <>
              {/* Group proofs by round */}
              {(() => {
                // Organize proofs into rounds
                const rounds = {};
                proofs.forEach(proof => {
                  const round = proof.round || 1;
                  if (!rounds[round]) {
                    rounds[round] = [];
                  }
                  rounds[round].push(proof);
                });
                
                const sortedRounds = Object.keys(rounds).sort((a, b) => b - a); // Newest first
                const latestRound = Math.max(...Object.keys(rounds));
                
                return (
                  <div className="space-y-8 mb-6">
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
                      
                      // Find the approval/change request for this specific round from timeline
                      let roundApproval = null;
                      let roundApprovalDate = null;
                      
                      if (order.timeline) {
                        // Find approval or changes_requested event for this round
                        // Look for events that happened after this round's upload but before next round's upload
                        const thisRoundUploadTime = roundProofs[0]?.uploaded_at;
                        const nextRoundIndex = sortedRounds.indexOf(round.toString()) - 1;
                        const nextRoundUploadTime = nextRoundIndex >= 0 && rounds[sortedRounds[nextRoundIndex]]
                          ? rounds[sortedRounds[nextRoundIndex]][0]?.uploaded_at
                          : null;
                        
                        // Find the approval/changes event for this round
                        const roundEvent = order.timeline
                          .filter(event => 
                            (event.event_type === 'approval' || event.event_type === 'changes_requested') &&
                            event.metadata?.stage === stage &&
                            event.timestamp > thisRoundUploadTime &&
                            (!nextRoundUploadTime || event.timestamp < nextRoundUploadTime)
                          )
                          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
                        
                        if (roundEvent) {
                          roundApproval = {
                            status: roundEvent.event_type === 'approval' ? 'approved' : 'changes_requested',
                            created_at: roundEvent.timestamp
                          };
                          roundApprovalDate = new Date(roundEvent.timestamp).toLocaleDateString('en-US', {
                            month: 'long',
                            day: 'numeric', 
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit'
                          });
                        }
                      }
                      
                      // Fallback to current approval for latest round if no timeline entry found
                      if (!roundApproval && isLatest && approval) {
                        roundApproval = approval;
                        roundApprovalDate = approval.created_at
                          ? new Date(approval.created_at).toLocaleDateString('en-US', {
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })
                          : null;
                      }
                      
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
                              <>
                                <Badge className="bg-green-600 text-white text-sm px-2 py-0.5">
                                  ⭐ LATEST REVISION
                                </Badge>
                                <Badge className={`${statusInfo.color} text-white text-sm px-2 py-0.5`}>
                                  {isAdmin ? statusInfo.adminLabel : statusInfo.customerLabel}
                                </Badge>
                                {roundApproval && roundApprovalDate && (
                                  <span className="text-xs text-gray-600 italic">
                                    {roundApproval.status === 'approved' ? 'Approved' : 'Changes Requested'}: {roundApprovalDate}
                                  </span>
                                )}
                              </>
                            )}
                            {!isLatest && (
                              <>
                                <Badge variant="outline" className="text-gray-600 text-sm px-2 py-0.5">
                                  Previous Version
                                </Badge>
                                {roundApproval && roundApprovalDate && (
                                  <span className="text-xs text-gray-600 italic">
                                    {roundApproval.status === 'approved' ? 'Approved' : 'Changes Requested'}: {roundApprovalDate}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                          
                          {/* Round Info */}
                          <div className="mb-3 space-y-1">
                            {roundDate && (
                              <p className="text-xs text-gray-600">
                                <strong>Sent to you:</strong> {roundDate}
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
                                data-testid={`proof-image-${stage}-${round}-${idx}`}
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
                          
                          {/* Customer change request - show when customer has requested changes
                              - If there's only 1 round: show it on that round
                              - If there are multiple rounds: show it on the round before the latest (where customer made the comment)
                          */}
                          {(() => {
                            // Find the change request for this specific round from timeline
                            const roundChangeRequest = order.timeline?.find(
                              event => event.event_type === 'changes_requested' && 
                              event.metadata?.stage === stage &&
                              event.timestamp <= (roundProofs[roundProofs.length - 1]?.uploaded_at || '')
                            );
                            
                            if (!roundChangeRequest && (sortedRounds.length === 1 || !isLatest) && approval?.status === "changes_requested") {
                              // Fallback to current approval if no timeline entry found
                              return (
                                <div className="p-4 bg-orange-50 border-l-4 border-orange-500 rounded" data-testid={`${stage}-changes-message`}>
                                  <p className="font-semibold mb-2 text-orange-900">Your Requested Changes:</p>
                                  <p className="text-gray-700">{approval.message || "No message provided"}</p>
                                  {approval.images && approval.images.length > 0 && (
                                    <>
                                      <p className="text-sm text-gray-600 mt-3 mb-2 font-semibold">📎 Reference Images Uploaded:</p>
                                      <div className="grid grid-cols-2 gap-2">
                                        {approval.images.map((img, idx) => (
                                          <img 
                                            key={idx} 
                                            src={img} 
                                            alt={`Reference ${idx + 1}`}
                                            className="w-full h-32 object-cover rounded border border-orange-300"
                                          />
                                        ))}
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            }
                            
                            if (roundChangeRequest && (sortedRounds.length === 1 || !isLatest)) {
                              return (
                                <div className="p-4 bg-orange-50 border-l-4 border-orange-500 rounded" data-testid={`${stage}-changes-message`}>
                                  <p className="font-semibold mb-2 text-orange-900">Your Requested Changes:</p>
                                  <p className="text-gray-700">{roundChangeRequest.metadata?.message || "No message provided"}</p>
                                  {approval.images && approval.images.length > 0 && (
                                    <>
                                      <p className="text-sm text-gray-600 mt-3 mb-2 font-semibold">📎 Reference Images Uploaded:</p>
                                      <div className="grid grid-cols-2 gap-2">
                                        {approval.images.map((img, idx) => (
                                          <img 
                                            key={idx} 
                                            src={img} 
                                            alt={`Reference ${idx + 1}`}
                                            className="w-full h-32 object-cover rounded border border-orange-300"
                                          />
                                        ))}
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            }
                            return null;
                          })()}
                          
                          {/* Action Buttons - Only show on latest round */}
                          {canInteract && isLatest && (
                            <div className="mt-4 p-3 bg-white rounded-lg border border-gray-200">
                              <p className="text-xs text-gray-700 mb-3 font-semibold">
                                📋 Review Round {round} and let us know:
                              </p>
                              <div className="flex gap-3">
                                <Button 
                                  className="flex-1 bg-green-600 hover:bg-green-700 h-10 text-sm"
                                  onClick={() => handleApprove(stage)}
                                  disabled={loading}
                                  data-testid={`approve-${stage}-btn`}
                                >
                                  <CheckCircle className="w-4 h-4 mr-2" />
                                  ✓ Approve Round {round}
                                </Button>
                                <Button 
                                  variant="outline"
                                  className="flex-1 border-2 border-orange-500 text-orange-700 hover:bg-orange-50 h-10 text-sm"
                                  onClick={() => setCurrentStage(stage)}
                                  data-testid={`request-changes-${stage}-btn`}
                                >
                                  <XCircle className="w-4 h-4 mr-2" />
                                  Request Changes
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
              <ImageIcon className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p>No proofs uploaded yet</p>
              <p className="text-sm mt-1">You'll be notified when proofs are ready for review</p>
            </div>
          )}
        </CardContent>
        )}
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <Button 
            variant="ghost" 
            onClick={() => navigate(isAdmin ? '/admin' : '/customer')}
            className="text-blue-700"
            data-testid="back-btn"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {isAdmin ? 'Back to Dashboard' : 'Back to Search'}
          </Button>
          
          {/* Logo on top right */}
          <img 
            src="https://customer-assets.emergentagent.com/job_order-status-10/artifacts/eprlbu95_Allbobbleheads.com%20logo_color%20512x512.png" 
            alt="AllBobbleheads Logo" 
            className="h-16 w-16 object-contain"
          />
        </div>

        <Card className="mb-4 border-2 border-blue-200">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 py-4">
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-2xl text-white">Order #{order.order_number}</CardTitle>
                <CardDescription className="text-base mt-1 text-blue-100">
                  {order.customer_name} • {order.customer_email}
                </CardDescription>
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
              <div className="flex gap-2 items-center flex-wrap">
                <Badge className={`${getStageColor(order.stage)} text-white text-sm px-3 py-1`} data-testid="current-stage-badge">
                  {getStageLabel(order.stage, workflowConfig).toUpperCase()}
                </Badge>
                {order.stage === 'clay' && order.clay_status && (
                  <Badge className={`${getStatusInfo(order.clay_status).color} text-white text-sm px-3 py-1`}>
                    {getStatusLabel(order.clay_status, workflowConfig)}
                  </Badge>
                )}
                {order.stage === 'paint' && order.paint_status && (
                  <Badge className={`${getStatusInfo(order.paint_status).color} text-white text-sm px-3 py-1`}>
                    {getStatusLabel(order.paint_status, workflowConfig)}
                  </Badge>
                )}
              </div>
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
