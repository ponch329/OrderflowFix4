import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Palette, Mail, Bell, Settings as SettingsIcon, Save, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import WorkflowConfig from "@/components/WorkflowConfig";
import WorkflowTableEditor from "@/components/WorkflowTableEditor";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const Settings = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Tenant info
  const [tenantName, setTenantName] = useState("");
  
  // Branding settings
  const [brandingSettings, setBrandingSettings] = useState({
    logo_url: "",
    primary_color: "#2196F3",
    secondary_color: "#9C27B0",
    font_family: "Arial, sans-serif",
    font_size_base: "16px"
  });
  
  // Email settings
  const [emailSettings, setEmailSettings] = useState({
    email_templates_enabled: true,
    bcc_email: "",
    manufacturer_can_change_status: false,
    manufacturer_can_add_notes: true,
    notes_visible_to_customer: false,
    manufacturer_can_email_customers: false,
    manufacturer_can_upload_tracking: true,
    order_manager_can_upload_tracking: true
  });
  
  // SMTP settings
  const [smtpSettings, setSmtpSettings] = useState({
    smtp_host: "",
    smtp_port: "587",
    smtp_user: "",
    smtp_password: "",
    smtp_from_email: ""
  });
  
  // Shopify settings
  const [shopifySettings, setShopifySettings] = useState({
    shopify_shop_name: "",
    shopify_api_key: "",
    shopify_api_secret: "",
    shopify_access_token: ""
  });
  const [syncingShopify, setSyncingShopify] = useState(false);
  const [syncingTags, setSyncingTags] = useState(false);
  const [fixingStages, setFixingStages] = useState(false);
  
  // Workflow settings
  const [workflowSettings, setWorkflowSettings] = useState({
    auto_advance_on_approval: true,
    require_admin_confirmation_for_stage_change: false,
    status_after_upload: "feedback_needed",
    notify_customer_on_upload: true,
    notify_admin_on_customer_response: true,
    stage_labels: [
      "Clay Stage",
      "Paint Stage", 
      "Shipped",
      "",
      "",
      "",
      "",
      ""
    ],
    status_labels: [
      "Pending",
      "In Progress",
      "Customer Feedback Needed",
      "Changes Requested",
      "Approved",
      "",
      "",
      ""
    ]
  });
  
  // Dashboard preference
  const [defaultDashboard, setDefaultDashboard] = useState("classic");

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) {
      navigate('/admin/login');
      return;
    }
    
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    fetchSettings();
  }, [navigate]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/settings/tenant`);
      const settings = response.data.settings;
      
      setTenantName(response.data.name || "");
      
      setBrandingSettings({
        logo_url: settings.logo_url || "",
        primary_color: settings.primary_color || "#2196F3",
        secondary_color: settings.secondary_color || "#9C27B0",
        font_family: settings.font_family || "Arial, sans-serif",
        font_size_base: settings.font_size_base || "16px"
      });
      
      setEmailSettings({
        email_templates_enabled: settings.email_templates_enabled ?? true,
        bcc_email: settings.bcc_email || "",
        manufacturer_can_change_status: settings.manufacturer_can_change_status ?? false,
        manufacturer_can_add_notes: settings.manufacturer_can_add_notes ?? true,
        notes_visible_to_customer: settings.notes_visible_to_customer ?? false,
        manufacturer_can_email_customers: settings.manufacturer_can_email_customers ?? false,
        manufacturer_can_upload_tracking: settings.manufacturer_can_upload_tracking ?? true,
        order_manager_can_upload_tracking: settings.order_manager_can_upload_tracking ?? true
      });
      
      setSmtpSettings({
        smtp_host: settings.smtp_host || "",
        smtp_port: settings.smtp_port || "587",
        smtp_user: settings.smtp_user || "",
        smtp_password: "", // Don't load password for security
        smtp_from_email: settings.smtp_from_email || ""
      });
      
      setShopifySettings({
        shopify_shop_name: settings.shopify_shop_name || "",
        shopify_api_key: settings.shopify_api_key || "",
        shopify_api_secret: "", // Don't load secret for security
        shopify_access_token: "" // Don't load token for security
      });
      
      setWorkflowSettings({
        auto_advance_on_approval: settings.workflow?.auto_advance_on_approval ?? true,
        require_admin_confirmation_for_stage_change: settings.workflow?.require_admin_confirmation_for_stage_change ?? false,
        status_after_upload: settings.workflow?.status_after_upload || "feedback_needed",
        notify_customer_on_upload: settings.workflow?.notify_customer_on_upload ?? true,
        notify_admin_on_customer_response: settings.workflow?.notify_admin_on_customer_response ?? true,
        stage_labels: settings.workflow?.stage_labels || [
          "Clay Stage",
          "Paint Stage", 
          "Shipped",
          "",
          "",
          "",
          "",
          ""
        ],
        status_labels: settings.workflow?.status_labels || [
          "Pending",
          "In Progress",
          "Customer Feedback Needed",
          "Changes Requested",
          "Approved",
          "",
          "",
          ""
        ]
      });
      
      setDefaultDashboard(settings.default_dashboard || "classic");
    } catch (error) {
      toast.error("Failed to load settings");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBranding = async () => {
    setSaving(true);
    try {
      const response = await axios.patch(`${API}/settings/tenant`, {
        name: tenantName,
        settings: {
          ...brandingSettings,
          default_dashboard: defaultDashboard
        }
      });
      toast.success("Company branding saved successfully!");
      console.log("Saved settings:", response.data);
    } catch (error) {
      if (error.response?.status === 401) {
        toast.error("Your session has expired. Please login again.");
        localStorage.removeItem('admin_token');
        setTimeout(() => navigate('/admin/login'), 2000);
      } else {
        toast.error(error.response?.data?.detail || "Failed to save branding settings");
      }
      console.error("Save error:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEmail = async () => {
    setSaving(true);
    try {
      const response = await axios.patch(`${API}/settings/tenant`, {
        settings: emailSettings
      });
      toast.success("Email & Permission settings saved successfully!");
      console.log("Saved settings:", response.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save email settings");
      console.error("Save error:", error);
    } finally {
      setSaving(false);
    }
  };
  
  const handleSaveIntegrations = async () => {
    setSaving(true);
    try {
      // Prepare integration settings, only including non-empty values
      const integrationSettings = {
        ...smtpSettings,
        ...shopifySettings
      };
      
      // Remove empty password/secret fields to avoid overwriting with blanks
      if (!smtpSettings.smtp_password) {
        delete integrationSettings.smtp_password;
      }
      if (!shopifySettings.shopify_api_secret) {
        delete integrationSettings.shopify_api_secret;
      }
      if (!shopifySettings.shopify_access_token) {
        delete integrationSettings.shopify_access_token;
      }
      
      const response = await axios.patch(`${API}/settings/tenant`, {
        settings: integrationSettings
      });
      toast.success("Integration settings saved successfully!");
      console.log("Saved integration settings:", response.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save integration settings");
      console.error("Save error:", error);
    } finally {
      setSaving(false);
    }
  };
  
  const handleSaveWorkflow = async () => {
    setSaving(true);
    try {
      const response = await axios.patch(`${API}/settings/tenant`, {
        settings: {
          workflow: workflowSettings
        }
      });
      toast.success("Workflow settings saved successfully!");
      console.log("Saved workflow settings:", response.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save workflow settings");
      console.error("Save error:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestEmail = async () => {
    const testEmail = prompt("Enter email address to send test email:");
    if (!testEmail) return;

    try {
      await axios.post(`${API}/settings/test-email`, {
        to_email: testEmail
      });
      toast.success(`Test email sent to ${testEmail}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to send test email");
      console.error(error);
    }
  };

  const handleShopifySync = async () => {
    setSyncingShopify(true);
    try {
      const response = await axios.post(`${API}/settings/shopify/sync`, null, {
        params: { limit: 50 }
      });
      
      const result = response.data;
      toast.success(result.message || `Synced ${result.synced} orders from Shopify!`);
      
      if (result.errors && result.errors.length > 0) {
        console.warn("Shopify sync errors:", result.errors);
        toast.warning(`Some orders had errors. Check console for details.`);
      }
      
      console.log("Shopify sync result:", result);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to sync Shopify orders");
      console.error("Shopify sync error:", error);
    } finally {
      setSyncingShopify(false);
    }
  };
  
  const handleBulkTagSync = async () => {
    setSyncingTags(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await axios.post(`${API}/admin/orders/bulk-sync-shopify-tags`, 
        { all_orders: true },
        { 
          headers: { Authorization: `Bearer ${token}` },
          timeout: 300000 // 5 minute timeout for large syncs
        }
      );
      
      const result = response.data;
      toast.success(`Synced ${result.success} order tags to Shopify! (${result.failed} failed)`);
      console.log("Bulk tag sync result:", result);
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        toast.info("Sync is still running in the background. Check Shopify to verify.");
      } else {
        toast.error(error.response?.data?.detail || "Failed to sync tags");
      }
      console.error("Bulk tag sync error:", error);
    } finally {
      setSyncingTags(false);
    }
  };
  
  const handleFixOrderStages = async () => {
    setFixingStages(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await axios.post(`${API}/admin/orders/fix-stages`, 
        { dry_run: false },
        { 
          headers: { Authorization: `Bearer ${token}` },
          timeout: 300000 // 5 minute timeout for large operations
        }
      );
      
      const result = response.data;
      const { results } = result;
      toast.success(
        `Fixed ${results.fulfilled_to_shipped.fixed} "Fulfilled" orders and ${results.tracking_workflow_applied.fixed} orders with tracking!`
      );
      console.log("Fix stages result:", result);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to fix order stages");
      console.error("Fix stages error:", error);
    } finally {
      setFixingStages(false);
    }
  };
  
  // Extract values for button state
  const shopifyShop = shopifySettings.shopify_shop_name;
  const shopifyAccessToken = shopifySettings.shopify_access_token;


  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              onClick={() => navigate('/admin')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              Settings
            </h1>
          </div>
        </div>

        <Tabs defaultValue="branding" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 lg:w-[1000px]">
            <TabsTrigger value="branding">
              <Palette className="w-4 h-4 mr-2" />
              Branding
            </TabsTrigger>
            <TabsTrigger value="email">
              <Mail className="w-4 h-4 mr-2" />
              Email
            </TabsTrigger>
            <TabsTrigger value="integrations">
              <SettingsIcon className="w-4 h-4 mr-2" />
              Integrations
            </TabsTrigger>
            <TabsTrigger value="permissions">
              <SettingsIcon className="w-4 h-4 mr-2" />
              Permissions
            </TabsTrigger>
            <TabsTrigger value="workflow">
              <Bell className="w-4 h-4 mr-2" />
              Workflow
            </TabsTrigger>
          </TabsList>

          {/* Branding Tab */}
          <TabsContent value="branding" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Company Branding</CardTitle>
                <CardDescription>
                  Customize your company name, logo, colors, and typography
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="company-name">Company Name *</Label>
                  <Input
                    id="company-name"
                    placeholder="AllBobbleheads"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                  />
                  <p className="text-sm text-gray-500">Your company name used in emails and customer portal</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="logo-url">Logo URL</Label>
                  <Input
                    id="logo-url"
                    placeholder="https://example.com/logo.png"
                    value={brandingSettings.logo_url}
                    onChange={(e) => setBrandingSettings({ ...brandingSettings, logo_url: e.target.value })}
                  />
                  <p className="text-sm text-gray-500">Logo will be displayed in emails and customer portal (recommended size: 200x60px)</p>
                  {brandingSettings.logo_url && (
                    <div className="mt-2 p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-600 mb-2">Preview:</p>
                      <img src={brandingSettings.logo_url} alt="Logo preview" className="max-h-16" onError={(e) => e.target.style.display = 'none'} />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="primary-color">Primary Color</Label>
                    <div className="flex gap-2">
                      <Input
                        id="primary-color"
                        type="color"
                        value={brandingSettings.primary_color}
                        onChange={(e) => setBrandingSettings({ ...brandingSettings, primary_color: e.target.value })}
                        className="w-20 h-10"
                      />
                      <Input
                        value={brandingSettings.primary_color}
                        onChange={(e) => setBrandingSettings({ ...brandingSettings, primary_color: e.target.value })}
                        placeholder="#2196F3"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="secondary-color">Secondary Color</Label>
                    <div className="flex gap-2">
                      <Input
                        id="secondary-color"
                        type="color"
                        value={brandingSettings.secondary_color}
                        onChange={(e) => setBrandingSettings({ ...brandingSettings, secondary_color: e.target.value })}
                        className="w-20 h-10"
                      />
                      <Input
                        value={brandingSettings.secondary_color}
                        onChange={(e) => setBrandingSettings({ ...brandingSettings, secondary_color: e.target.value })}
                        placeholder="#9C27B0"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="font-family">Font Family</Label>
                    <Input
                      id="font-family"
                      value={brandingSettings.font_family}
                      onChange={(e) => setBrandingSettings({ ...brandingSettings, font_family: e.target.value })}
                      placeholder="Arial, sans-serif"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="font-size">Base Font Size</Label>
                    <Input
                      id="font-size"
                      value={brandingSettings.font_size_base}
                      onChange={(e) => setBrandingSettings({ ...brandingSettings, font_size_base: e.target.value })}
                      placeholder="16px"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="default-dashboard">Default Dashboard View</Label>
                  <select
                    id="default-dashboard"
                    className="w-full p-2 border rounded-md"
                    value={defaultDashboard}
                    onChange={(e) => setDefaultDashboard(e.target.value)}
                  >
                    <option value="classic">Classic Dashboard</option>
                    <option value="orderdesk">OrderDesk View</option>
                  </select>
                  <p className="text-sm text-gray-500">Choose which dashboard view to show by default when logging in</p>
                </div>

                <Button onClick={handleSaveBranding} disabled={saving} className="w-full">
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? "Saving..." : "Save Branding Settings"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Email Tab */}
          <TabsContent value="email" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Email Notifications</CardTitle>
                <CardDescription>
                  Manage email templates and notification settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800 mb-2">
                    <strong>Email Templates</strong>
                  </p>
                  <p className="text-sm text-gray-600 mb-3">
                    Customize the content and appearance of automated emails sent to customers
                  </p>
                  <Button 
                    onClick={() => navigate('/admin/email-templates')}
                    variant="outline"
                    size="sm"
                    className="border-blue-500 text-blue-600 hover:bg-blue-50"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Manage Email Templates (7)
                  </Button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Email Notifications</Label>
                    <p className="text-sm text-gray-500">
                      Turn on/off all automatic email notifications to customers
                    </p>
                  </div>
                  <Switch
                    checked={emailSettings.email_templates_enabled}
                    onCheckedChange={(checked) => setEmailSettings({ ...emailSettings, email_templates_enabled: checked })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bcc-email">BCC Email Address</Label>
                  <Input
                    id="bcc-email"
                    type="email"
                    placeholder="admin@example.com"
                    value={emailSettings.bcc_email}
                    onChange={(e) => setEmailSettings({ ...emailSettings, bcc_email: e.target.value })}
                  />
                  <p className="text-sm text-gray-500">Receive a blind copy of all outgoing customer emails</p>
                </div>

                <div className="pt-4">
                  <Button onClick={handleSendTestEmail} variant="outline" className="w-full">
                    <Bell className="w-4 h-4 mr-2" />
                    Send Test Email
                  </Button>
                </div>

                <Button onClick={handleSaveEmail} disabled={saving} className="w-full">
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? "Saving..." : "Save All Email Settings"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Integrations Tab */}
          <TabsContent value="integrations" className="space-y-4">
            {/* SMTP Configuration */}
            <Card>
              <CardHeader>
                <CardTitle>SMTP / Email Server</CardTitle>
                <CardDescription>
                  Configure your email server to send automated notifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="smtp-host">SMTP Host *</Label>
                    <Input
                      id="smtp-host"
                      type="text"
                      placeholder="smtp.gmail.com"
                      value={smtpSettings.smtp_host}
                      onChange={(e) => setSmtpSettings({ ...smtpSettings, smtp_host: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtp-port">SMTP Port *</Label>
                    <Input
                      id="smtp-port"
                      type="text"
                      placeholder="587"
                      value={smtpSettings.smtp_port}
                      onChange={(e) => setSmtpSettings({ ...smtpSettings, smtp_port: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="smtp-user">SMTP Username *</Label>
                  <Input
                    id="smtp-user"
                    type="text"
                    placeholder="your-email@gmail.com"
                    value={smtpSettings.smtp_user}
                    onChange={(e) => setSmtpSettings({ ...smtpSettings, smtp_user: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="smtp-password">SMTP Password *</Label>
                  <Input
                    id="smtp-password"
                    type="password"
                    placeholder="••••••••"
                    value={smtpSettings.smtp_password}
                    onChange={(e) => setSmtpSettings({ ...smtpSettings, smtp_password: e.target.value })}
                  />
                  <p className="text-xs text-gray-500">Leave blank to keep existing password</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="smtp-from">From Email Address *</Label>
                  <Input
                    id="smtp-from"
                    type="email"
                    placeholder="noreply@yourcompany.com"
                    value={smtpSettings.smtp_from_email}
                    onChange={(e) => setSmtpSettings({ ...smtpSettings, smtp_from_email: e.target.value })}
                  />
                  <p className="text-xs text-gray-500">Email address that appears as the sender</p>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-800">
                    <strong>Gmail Users:</strong> Use "smtp.gmail.com" on port 587. You may need to generate an "App Password" in your Google Account settings.
                  </p>
                </div>

                <div className="pt-2">
                  <Button onClick={handleSaveIntegrations} disabled={saving} className="w-full">
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? "Saving..." : "Save SMTP Settings"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Shopify Integration */}
            <Card>
              <CardHeader>
                <CardTitle>Shopify Integration</CardTitle>
                <CardDescription>
                  Connect to your Shopify store to sync orders and tracking information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="shopify-shop">Shop Name *</Label>
                  <Input
                    id="shopify-shop"
                    type="text"
                    placeholder="your-store"
                    value={shopifySettings.shopify_shop_name}
                    onChange={(e) => setShopifySettings({ ...shopifySettings, shopify_shop_name: e.target.value })}
                  />
                  <p className="text-xs text-gray-500">Your Shopify store name (e.g., "your-store" from your-store.myshopify.com)</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shopify-api-key">API Key *</Label>
                  <Input
                    id="shopify-api-key"
                    type="text"
                    placeholder="Your Shopify API Key"
                    value={shopifySettings.shopify_api_key}
                    onChange={(e) => setShopifySettings({ ...shopifySettings, shopify_api_key: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shopify-api-secret">API Secret *</Label>
                  <Input
                    id="shopify-api-secret"
                    type="password"
                    placeholder="••••••••"
                    value={shopifySettings.shopify_api_secret}
                    onChange={(e) => setShopifySettings({ ...shopifySettings, shopify_api_secret: e.target.value })}
                  />
                  <p className="text-xs text-gray-500">Leave blank to keep existing secret</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shopify-token">Access Token *</Label>
                  <Input
                    id="shopify-token"
                    type="password"
                    placeholder="••••••••"
                    value={shopifySettings.shopify_access_token}
                    onChange={(e) => setShopifySettings({ ...shopifySettings, shopify_access_token: e.target.value })}
                  />
                  <p className="text-xs text-gray-500">Leave blank to keep existing token</p>
                </div>

                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-xs text-yellow-800">
                    <strong>How to get Shopify credentials:</strong> Go to your Shopify Admin → Apps → Develop apps → Create an app → Configure Admin API scopes → Install app → Get API credentials
                  </p>
                </div>

                <div className="pt-2 space-y-2">
                  <Button onClick={handleSaveIntegrations} disabled={saving} className="w-full">
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? "Saving..." : "Save Shopify Settings"}
                  </Button>
                  
                  <Button 
                    onClick={handleShopifySync} 
                    disabled={syncingShopify || !shopifyShop || !shopifyAccessToken}
                    variant="outline"
                    className="w-full"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${syncingShopify ? 'animate-spin' : ''}`} />
                    {syncingShopify ? "Syncing..." : "Sync Orders from Shopify"}
                  </Button>
                  
                  <Button 
                    onClick={handleBulkTagSync} 
                    disabled={syncingTags || !shopifyShop}
                    variant="outline"
                    className="w-full"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${syncingTags ? 'animate-spin' : ''}`} />
                    {syncingTags ? "Syncing Tags..." : "Sync All Order Tags to Shopify"}
                  </Button>
                  
                  {(!shopifyShop || !shopifyAccessToken) && (
                    <p className="text-xs text-gray-500 text-center">
                      Save your Shopify credentials first before syncing
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Google Sheets Integration */}
            <Card>
              <CardHeader>
                <CardTitle>Google Sheets Logging</CardTitle>
                <CardDescription>
                  Automatically log order activities to a Google Spreadsheet
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
                  <p className="text-sm text-blue-800 mb-3">
                    Click below to connect your Google account and select a spreadsheet for logging
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => window.location.href = `${API}/oauth/sheets/login`}
                    className="border-blue-500 text-blue-600 hover:bg-blue-50"
                  >
                    <SettingsIcon className="w-4 h-4 mr-2" />
                    Configure Google Sheets
                  </Button>
                  <p className="text-xs text-gray-500 mt-2">
                    You'll be redirected to Google to authorize access
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Permissions Tab */}
          <TabsContent value="permissions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Role Permissions</CardTitle>
                <CardDescription>
                  Configure what manufacturers and other roles can do
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Manufacturer Permissions</h3>
                  
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="space-y-0.5">
                      <Label>Can Email Customers Directly</Label>
                      <p className="text-sm text-gray-500">
                        Allow manufacturers to send emails directly to customers about their orders
                      </p>
                    </div>
                    <Switch
                      checked={emailSettings.manufacturer_can_email_customers}
                      onCheckedChange={(checked) => setEmailSettings({ ...emailSettings, manufacturer_can_email_customers: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Can Change Order Status</Label>
                      <p className="text-sm text-gray-500">
                        Allow manufacturers to update order statuses (e.g., from sculpting to feedback_needed)
                      </p>
                    </div>
                    <Switch
                      checked={emailSettings.manufacturer_can_change_status}
                      onCheckedChange={(checked) => setEmailSettings({ ...emailSettings, manufacturer_can_change_status: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Can Add Notes</Label>
                      <p className="text-sm text-gray-500">
                        Allow manufacturers to add internal notes to orders
                      </p>
                    </div>
                    <Switch
                      checked={emailSettings.manufacturer_can_add_notes}
                      onCheckedChange={(checked) => setEmailSettings({ ...emailSettings, manufacturer_can_add_notes: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Notes Visible to Customers</Label>
                      <p className="text-sm text-gray-500">
                        Show manufacturer and admin notes to customers in their portal
                      </p>
                    </div>
                    <Switch
                      checked={emailSettings.notes_visible_to_customer}
                      onCheckedChange={(checked) => setEmailSettings({ ...emailSettings, notes_visible_to_customer: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Manufacturer Can Upload Tracking</Label>
                      <p className="text-sm text-gray-500">
                        Allow manufacturer role to add tracking information
                      </p>
                    </div>
                    <Switch
                      checked={emailSettings.manufacturer_can_upload_tracking}
                      onCheckedChange={(checked) => setEmailSettings({ ...emailSettings, manufacturer_can_upload_tracking: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Order Manager Can Upload Tracking</Label>
                      <p className="text-sm text-gray-500">
                        Allow customer service role to add tracking information
                      </p>
                    </div>
                    <Switch
                      checked={emailSettings.order_manager_can_upload_tracking}
                      onCheckedChange={(checked) => setEmailSettings({ ...emailSettings, order_manager_can_upload_tracking: checked })}
                    />
                  </div>
                </div>

                <Button onClick={handleSaveEmail} disabled={saving} className="w-full">
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? "Saving..." : "Save Permission Settings"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Workflow Tab */}
          <TabsContent value="workflow" className="space-y-4">
            <WorkflowTableEditor />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Settings;
