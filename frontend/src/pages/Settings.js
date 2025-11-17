import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Palette, Mail, Bell, Settings as SettingsIcon, Save } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Settings = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
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
    notes_visible_to_customer: false
  });

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
        notes_visible_to_customer: settings.notes_visible_to_customer ?? false
      });
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
      await axios.patch(`${API}/settings/tenant`, {
        settings: brandingSettings
      });
      toast.success("Branding settings saved successfully!");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save branding settings");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEmail = async () => {
    setSaving(true);
    try {
      await axios.patch(`${API}/settings/tenant`, {
        settings: emailSettings
      });
      toast.success("Email settings saved successfully!");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save email settings");
      console.error(error);
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
          <TabsList className="grid w-full grid-cols-3 lg:w-[600px]">
            <TabsTrigger value="branding">
              <Palette className="w-4 h-4 mr-2" />
              Branding
            </TabsTrigger>
            <TabsTrigger value="email">
              <Mail className="w-4 h-4 mr-2" />
              Email
            </TabsTrigger>
            <TabsTrigger value="permissions">
              <SettingsIcon className="w-4 h-4 mr-2" />
              Permissions
            </TabsTrigger>
          </TabsList>

          {/* Branding Tab */}
          <TabsContent value="branding" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Branding & Appearance</CardTitle>
                <CardDescription>
                  Customize your brand colors, logo, and typography
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="logo-url">Logo URL</Label>
                  <Input
                    id="logo-url"
                    placeholder="https://example.com/logo.png"
                    value={brandingSettings.logo_url}
                    onChange={(e) => setBrandingSettings({ ...brandingSettings, logo_url: e.target.value })}
                  />
                  <p className="text-sm text-gray-500">Enter the URL of your logo image</p>
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
                <CardTitle>Email Configuration</CardTitle>
                <CardDescription>
                  Manage email templates and notification settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Email Templates</Label>
                    <p className="text-sm text-gray-500">
                      Turn on/off automatic email notifications to customers
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
                  <p className="text-sm text-gray-500">Receive a copy of all customer emails sent</p>
                </div>

                <div className="pt-4">
                  <Button onClick={handleSendTestEmail} variant="outline" className="w-full">
                    <Bell className="w-4 h-4 mr-2" />
                    Send Test Email
                  </Button>
                </div>

                <Button onClick={handleSaveEmail} disabled={saving} className="w-full">
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? "Saving..." : "Save Email Settings"}
                </Button>
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
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Can Change Order Status</Label>
                      <p className="text-sm text-gray-500">
                        Allow manufacturers to update order statuses
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
                        Allow manufacturers to add notes to orders
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
                        Show manufacturer notes to customers in their portal
                      </p>
                    </div>
                    <Switch
                      checked={emailSettings.notes_visible_to_customer}
                      onCheckedChange={(checked) => setEmailSettings({ ...emailSettings, notes_visible_to_customer: checked })}
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
        </Tabs>
      </div>
    </div>
  );
};

export default Settings;
