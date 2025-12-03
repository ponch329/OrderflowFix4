import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Mail, Edit, Eye, Send, CheckCircle } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = window.location.origin;
const API = `${BACKEND_URL}/api`;

// Email template definitions - these match the actual HTML emails being sent
const EMAIL_TEMPLATES = [
  {
    id: "proof_ready_clay",
    name: "Clay Proofs Ready (Customer)",
    description: "Sent to customer when clay proofs are uploaded and ready for review",
    trigger: "Automatically sent when proofs are uploaded to Clay stage",
    default_subject: "Your Clay Proofs Are Ready for Review - Order #{order_number}",
    default_body: `<html>
<head><style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
.content { background: #ffffff; padding: 30px 20px; border: 1px solid #e0e0e0; }
.button { background: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
.footer { text-align: center; padding: 20px; color: #888; font-size: 12px; background: #f5f5f5; }
</style></head>
<body>
<div class="container">
<div class="header"><h1>🎨 Your Clay Proofs Are Ready!</h1></div>
<div class="content">
<p>Hi {customer_name},</p>
<p>Great news! We've uploaded {num_images} clay proof(s) for your order #{order_number}.</p>
<p>Please review them and let us know if you approve or if you'd like any changes.</p>
<a href="{portal_url}" class="button">View Your Proofs</a>
<p style="color: #666; font-size: 14px;">If you have any questions, just reply to this email!</p>
</div>
<div class="footer"><p>AllBobbleheads.com | orders@allbobbleheads.com</p></div>
</div>
</body>
</html>`
  },
  {
    id: "proof_ready_paint",
    name: "Paint Proofs Ready (Customer)",
    description: "Sent to customer when paint proofs are uploaded and ready for review",
    trigger: "Automatically sent when proofs are uploaded to Paint stage",
    default_subject: "Your Paint Proofs Are Ready for Review - Order #{order_number}",
    default_body: `<html>
<head><style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
.content { background: #ffffff; padding: 30px 20px; border: 1px solid #e0e0e0; }
.button { background: #ec4899; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
.footer { text-align: center; padding: 20px; color: #888; font-size: 12px; background: #f5f5f5; }
</style></head>
<body>
<div class="container">
<div class="header"><h1>🎨 Your Paint Proofs Are Ready!</h1></div>
<div class="content">
<p>Hi {customer_name},</p>
<p>Excellent news! We've uploaded {num_images} painted proof(s) for your order #{order_number}.</p>
<p>Please review them and let us know if you approve or if you'd like any adjustments.</p>
<a href="{portal_url}" class="button">View Your Proofs</a>
<p style="color: #666; font-size: 14px;">We're excited to show you the final result!</p>
</div>
<div class="footer"><p>AllBobbleheads.com | orders@allbobbleheads.com</p></div>
</div>
</body>
</html>`
  },
  {
    id: "approved_clay",
    name: "Clay Approved (Admin Notification)",
    description: "Sent to admin when customer approves clay proofs",
    trigger: "Automatically sent when customer clicks 'Approve' on clay proofs",
    default_subject: "Order #{order_number} - Clay Stage Approved ✓",
    default_body: `<html>
<head><style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
.content { background: #ffffff; padding: 30px 20px; border: 1px solid #e0e0e0; }
.info-row { margin: 15px 0; padding: 10px; background: #f9f9f9; border-radius: 4px; }
.footer { text-align: center; padding: 20px; color: #888; font-size: 12px; background: #f5f5f5; }
</style></head>
<body>
<div class="container">
<div class="header"><div style="font-size: 48px;">✓</div><h1>Clay Stage Approved</h1></div>
<div class="content">
<p>Great news! Your customer has approved the clay stage proofs.</p>
<div class="info-row"><strong>Order:</strong> #{order_number}</div>
<div class="info-row"><strong>Customer:</strong> {customer_name}</div>
<div class="info-row"><strong>Email:</strong> {customer_email}</div>
<p style="background: #e8f5e9; padding: 15px; border-left: 4px solid #4CAF50;"><strong>Next Steps:</strong> Move forward with painting stage.</p>
</div>
<div class="footer"><p>AllBobbleheads.com | orders@allbobbleheads.com</p></div>
</div>
</body>
</html>`
  },
  {
    id: "approved_paint",
    name: "Paint Approved (Admin Notification)",
    description: "Sent to admin when customer approves paint proofs",
    trigger: "Automatically sent when customer clicks 'Approve' on paint proofs",
    default_subject: "Order #{order_number} - Paint Stage Approved ✓",
    default_body: `<html>
<head><style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
.content { background: #ffffff; padding: 30px 20px; border: 1px solid #e0e0e0; }
.info-row { margin: 15px 0; padding: 10px; background: #f9f9f9; border-radius: 4px; }
.footer { text-align: center; padding: 20px; color: #888; font-size: 12px; background: #f5f5f5; }
</style></head>
<body>
<div class="container">
<div class="header"><div style="font-size: 48px;">✓</div><h1>Paint Stage Approved</h1></div>
<div class="content">
<p>Excellent! Your customer has approved the paint stage proofs.</p>
<div class="info-row"><strong>Order:</strong> #{order_number}</div>
<div class="info-row"><strong>Customer:</strong> {customer_name}</div>
<div class="info-row"><strong>Email:</strong> {customer_email}</div>
<p style="background: #e8f5e9; padding: 15px; border-left: 4px solid #4CAF50;"><strong>Next Steps:</strong> Ready to ship!</p>
</div>
<div class="footer"><p>AllBobbleheads.com | orders@allbobbleheads.com</p></div>
</div>
</body>
</html>`
  },
  {
    id: "changes_requested_clay",
    name: "Clay Changes Requested (Admin Notification)",
    description: "Sent to admin when customer requests changes to clay proofs",
    trigger: "Automatically sent when customer clicks 'Request Changes' on clay proofs",
    default_subject: "Order #{order_number} - Clay Stage Changes Requested",
    default_body: `<html>
<head><style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
.content { background: #ffffff; padding: 30px 20px; border: 1px solid #e0e0e0; }
.info-row { margin: 15px 0; padding: 10px; background: #f9f9f9; border-radius: 4px; }
.message-box { background: #fff3e0; padding: 20px; border-left: 4px solid #FF9800; margin: 20px 0; }
.footer { text-align: center; padding: 20px; color: #888; font-size: 12px; background: #f5f5f5; }
</style></head>
<body>
<div class="container">
<div class="header"><div style="font-size: 48px;">⚠</div><h1>Changes Requested</h1></div>
<div class="content">
<p>Your customer has reviewed the clay stage proofs and is requesting some changes.</p>
<div class="info-row"><strong>Order:</strong> #{order_number}</div>
<div class="info-row"><strong>Customer:</strong> {customer_name}</div>
<div class="info-row"><strong>Email:</strong> {customer_email}</div>
<div class="message-box"><strong>Requested Changes:</strong><br><br>{customer_message}</div>
<p style="background: #fff3e0; padding: 15px; border-left: 4px solid #FF9800;"><strong>Action Required:</strong> Please review the customer's feedback and make the necessary adjustments to the clay stage.</p>
</div>
<div class="footer"><p>AllBobbleheads.com | orders@allbobbleheads.com</p></div>
</div>
</body>
</html>`
  },
  {
    id: "changes_requested_paint",
    name: "Paint Changes Requested (Admin Notification)",
    description: "Sent to admin when customer requests changes to paint proofs",
    trigger: "Automatically sent when customer clicks 'Request Changes' on paint proofs",
    default_subject: "Order #{order_number} - Paint Stage Changes Requested",
    default_body: `<html>
<head><style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
.content { background: #ffffff; padding: 30px 20px; border: 1px solid #e0e0e0; }
.info-row { margin: 15px 0; padding: 10px; background: #f9f9f9; border-radius: 4px; }
.message-box { background: #fff3e0; padding: 20px; border-left: 4px solid #FF9800; margin: 20px 0; }
.footer { text-align: center; padding: 20px; color: #888; font-size: 12px; background: #f5f5f5; }
</style></head>
<body>
<div class="container">
<div class="header"><div style="font-size: 48px;">⚠</div><h1>Changes Requested</h1></div>
<div class="content">
<p>Your customer has reviewed the paint stage proofs and is requesting some changes.</p>
<div class="info-row"><strong>Order:</strong> #{order_number}</div>
<div class="info-row"><strong>Customer:</strong> {customer_name}</div>
<div class="info-row"><strong>Email:</strong> {customer_email}</div>
<div class="message-box"><strong>Requested Changes:</strong><br><br>{customer_message}</div>
<p style="background: #fff3e0; padding: 15px; border-left: 4px solid #FF9800;"><strong>Action Required:</strong> Please review the customer's feedback and make the necessary adjustments to the paint stage.</p>
</div>
<div class="footer"><p>AllBobbleheads.com | orders@allbobbleheads.com</p></div>
</div>
</body>
</html>`
  }
];

const EmailTemplates = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  
  // Form state
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [ccEmail, setCcEmail] = useState("");
  const [bccEmail, setBccEmail] = useState("");

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) {
      navigate('/admin/login');
      return;
    }
    
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    fetchTemplates();
  }, [navigate]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/settings/email-templates`);
      setTemplates(response.data);
    } catch (error) {
      toast.error("Failed to load email templates");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (template) => {
    const templateDef = EMAIL_TEMPLATES.find(t => t.id === template.id);
    setSelectedTemplate({ ...template, ...templateDef });
    // Use saved content if available, otherwise use default
    setSubject(template.subject || templateDef.default_subject);
    setBody(template.body || templateDef.default_body);
    setEnabled(template.enabled);
    setCcEmail(template.cc_email || "");
    setBccEmail(template.bcc_email || "");
    setEditDialogOpen(true);
  };

  const openPreviewDialog = (template) => {
    const templateDef = EMAIL_TEMPLATES.find(t => t.id === template.id);
    setSelectedTemplate({ ...template, ...templateDef });
    // Use saved content if available, otherwise use default
    setSubject(template.subject || templateDef.default_subject);
    setBody(template.body || templateDef.default_body);
    setPreviewDialogOpen(true);
  };

  const handleSaveTemplate = async () => {
    setLoading(true);
    try {
      await axios.patch(`${API}/settings/email-template/${selectedTemplate.id}`, {
        enabled: enabled,
        cc_email: ccEmail,
        bcc_email: bccEmail,
        subject: subject,
        body: body
      });
      
      toast.success("Template saved successfully!");
      setEditDialogOpen(false);
      
      // Refresh templates to show updated data
      await fetchTemplates();
    } catch (error) {
      toast.error("Failed to save template");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendTest = async () => {
    const testEmail = prompt("Enter email address to send test:");
    if (!testEmail) return;

    try {
      await axios.post(`${API}/settings/test-email`, {
        to_email: testEmail,
        template_id: selectedTemplate.id
      });
      toast.success(`Test email sent to ${testEmail}`);
    } catch (error) {
      toast.error("Failed to send test email");
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              onClick={() => navigate('/admin/settings')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Settings
            </Button>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              Email Templates
            </h1>
          </div>
        </div>

        <div className="grid gap-4">
          {loading && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-gray-600">Loading templates...</p>
              </CardContent>
            </Card>
          )}

          {!loading && EMAIL_TEMPLATES.map((template) => {
            const templateStatus = templates.find(t => t.id === template.id);
            const isEnabled = templateStatus?.enabled ?? true;

            return (
              <Card key={template.id} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white">
                        <Mail className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-xl font-bold">{template.name}</h3>
                          {isEnabled ? (
                            <Badge className="bg-green-500">Enabled</Badge>
                          ) : (
                            <Badge variant="secondary">Disabled</Badge>
                          )}
                        </div>
                        <p className="text-gray-600 mb-3">{template.description}</p>
                        <div className="bg-blue-50 p-3 rounded-lg">
                          <p className="text-sm text-blue-800">
                            <strong>Trigger:</strong> {template.trigger}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openPreviewDialog(templateStatus || template)}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Preview
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(templateStatus || template)}
                        className="border-blue-500 text-blue-600"
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Email Template</DialogTitle>
              <DialogDescription>
                {selectedTemplate?.name} - Customize subject and body
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                <div>
                  <Label>Template Enabled</Label>
                  <p className="text-sm text-gray-600">Enable or disable this email notification</p>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={setEnabled}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cc-email">CC (Carbon Copy)</Label>
                  <Input
                    id="cc-email"
                    type="email"
                    placeholder="cc@example.com"
                    value={ccEmail}
                    onChange={(e) => setCcEmail(e.target.value)}
                  />
                  <p className="text-xs text-gray-500">
                    Send a copy to this email (optional)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bcc-email">BCC (Blind Carbon Copy)</Label>
                  <Input
                    id="bcc-email"
                    type="email"
                    placeholder="bcc@example.com"
                    value={bccEmail}
                    onChange={(e) => setBccEmail(e.target.value)}
                  />
                  <p className="text-xs text-gray-500">
                    Hidden copy to this email (optional)
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Email Subject</Label>
                <Textarea
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  rows={2}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-gray-500">
                  Available variables: {'{order_number}'}, {'{customer_name}'}, {'{customer_email}'}, {'{company_name}'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="body">Email Body</Label>
                <Textarea
                  id="body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={12}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-gray-500">
                  Available variables: {'{order_number}'}, {'{customer_name}'}, {'{customer_email}'}, {'{company_name}'}, {'{customer_message}'}
                </p>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSaveTemplate} className="flex-1">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Save Template
                </Button>
                <Button onClick={handleSendTest} variant="outline">
                  <Send className="w-4 h-4 mr-2" />
                  Send Test
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Preview Dialog */}
        <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Preview: {selectedTemplate?.name}</DialogTitle>
              <DialogDescription>
                How this email will appear to recipients
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="border-b pb-4">
                <p className="text-sm text-gray-500 mb-1">Subject:</p>
                <p className="font-semibold">{subject.replace('{order_number}', '12345').replace('{customer_name}', 'John Doe').replace('{company_name}', 'AllBobbleheads')}</p>
              </div>
              <div className="bg-white p-6 border rounded-lg">
                <pre className="whitespace-pre-wrap font-sans">
                  {body
                    .replace('{order_number}', '12345')
                    .replace('{customer_name}', 'John Doe')
                    .replace('{customer_email}', 'john@example.com')
                    .replace('{company_name}', 'AllBobbleheads')
                    .replace('{customer_message}', 'Please make the hair slightly darker.')
                  }
                </pre>
              </div>
              <Button onClick={handleSendTest} variant="outline" className="w-full">
                <Send className="w-4 h-4 mr-2" />
                Send Test Email
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default EmailTemplates;
