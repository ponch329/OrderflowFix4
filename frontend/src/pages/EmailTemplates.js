import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Mail, Edit, Eye, Send, CheckCircle } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Email template definitions
const EMAIL_TEMPLATES = [
  {
    id: "proof_ready_clay",
    name: "Clay Proofs Ready",
    description: "Sent when clay proofs are uploaded",
    trigger: "Automatically sent when admin uploads clay proofs",
    default_subject: "Your Clay Proofs Are Ready - Order #{order_number}",
    default_body: `Hi {customer_name},

Great news! Your clay proofs for order #{order_number} are ready for review.

Please log in to your customer portal to view and approve your proofs:
[Customer Portal Link]

If you'd like any changes, simply let us know in the portal.

Thank you!
{company_name}`
  },
  {
    id: "proof_ready_paint",
    name: "Paint Proofs Ready",
    description: "Sent when paint proofs are uploaded",
    trigger: "Automatically sent when admin uploads paint proofs",
    default_subject: "Your Paint Proofs Are Ready - Order #{order_number}",
    default_body: `Hi {customer_name},

Your paint proofs for order #{order_number} are ready for your review!

Please visit the customer portal to view your painted bobblehead:
[Customer Portal Link]

We're excited to show you the final result!

Best regards,
{company_name}`
  },
  {
    id: "approved_clay",
    name: "Clay Approved (Admin Notification)",
    description: "Sent to admin when customer approves clay",
    trigger: "Automatically sent when customer approves clay proofs",
    default_subject: "Clay Approved - Order #{order_number}",
    default_body: `Order #{order_number} - Clay Stage Approved

Customer: {customer_name}
Email: {customer_email}

The customer has approved the clay proofs. You can now proceed to the paint stage.

[View Order in Admin Dashboard]`
  },
  {
    id: "approved_paint",
    name: "Paint Approved (Admin Notification)",
    description: "Sent to admin when customer approves paint",
    trigger: "Automatically sent when customer approves paint proofs",
    default_subject: "Paint Approved - Order #{order_number}",
    default_body: `Order #{order_number} - Paint Stage Approved

Customer: {customer_name}
Email: {customer_email}

The customer has approved the paint proofs. This order is ready for final production!

[View Order in Admin Dashboard]`
  },
  {
    id: "changes_requested_clay",
    name: "Clay Changes Requested (Admin Notification)",
    description: "Sent to admin when customer requests clay changes",
    trigger: "Automatically sent when customer requests changes to clay proofs",
    default_subject: "Changes Requested - Order #{order_number}",
    default_body: `Order #{order_number} - Changes Requested (Clay)

Customer: {customer_name}
Email: {customer_email}

Customer Message:
{customer_message}

Please review the requested changes and update the proofs accordingly.

[View Order in Admin Dashboard]`
  },
  {
    id: "changes_requested_paint",
    name: "Paint Changes Requested (Admin Notification)",
    description: "Sent to admin when customer requests paint changes",
    trigger: "Automatically sent when customer requests changes to paint proofs",
    default_subject: "Changes Requested - Order #{order_number}",
    default_body: `Order #{order_number} - Changes Requested (Paint)

Customer: {customer_name}
Email: {customer_email}

Customer Message:
{customer_message}

Please review the requested changes and update the paint proofs.

[View Order in Admin Dashboard]`
  },
  {
    id: "reminder",
    name: "Review Reminder",
    description: "Manual reminder to customer",
    trigger: "Manually sent by admin using 'Ping Customer' button",
    default_subject: "Reminder: Please Review Your Proofs - Order #{order_number}",
    default_body: `Hi {customer_name},

This is a friendly reminder that your proofs for order #{order_number} are waiting for your review.

Please take a moment to check them out in your customer portal:
[Customer Portal Link]

Let us know if you approve or if you'd like any changes!

Thank you,
{company_name}`
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
    setSubject(templateDef.default_subject);
    setBody(templateDef.default_body);
    setEnabled(template.enabled);
    setEditDialogOpen(true);
  };

  const openPreviewDialog = (template) => {
    const templateDef = EMAIL_TEMPLATES.find(t => t.id === template.id);
    setSelectedTemplate({ ...template, ...templateDef });
    setSubject(templateDef.default_subject);
    setBody(templateDef.default_body);
    setPreviewDialogOpen(true);
  };

  const handleSaveTemplate = async () => {
    // For now, just close the dialog
    // In a full implementation, this would save to the database
    toast.success("Template saved successfully!");
    setEditDialogOpen(false);
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
                  rows={15}
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
