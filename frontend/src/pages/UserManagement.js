import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, UserPlus, Edit, Trash2, Shield, Mail, User as UserIcon } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = window.location.origin;
const API = `${BACKEND_URL}/api`;

const ROLE_LABELS = {
  main_admin: "Main Admin",
  manufacturer: "Manufacturer",
  customer_service: "Customer Service",
  order_manager: "Order Manager"
};

const ROLE_COLORS = {
  main_admin: "bg-purple-500",
  manufacturer: "bg-blue-500",
  customer_service: "bg-green-500",
  order_manager: "bg-orange-500"
};

const UserManagement = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  
  // Form state for create/edit
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    full_name: "",
    role: "customer_service",
    assigned_vendor: ""
  });

  useEffect(() => {
    // Check if admin is authenticated
    const token = localStorage.getItem('admin_token');
    if (!token) {
      navigate('/admin/login');
      return;
    }
    
    // Set default authorization header
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    
    fetchUsers();
  }, [navigate]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/users/`);
      setUsers(response.data);
    } catch (error) {
      toast.error("Failed to load users");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!formData.username || !formData.email || !formData.password || !formData.full_name) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      await axios.post(`${API}/users/`, formData);
      toast.success("User created successfully!");
      setCreateDialogOpen(false);
      resetForm();
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to create user");
      console.error(error);
    }
  };

  const handleEditUser = async () => {
    if (!selectedUser) return;

    try {
      const updateData = {
        email: formData.email,
        username: formData.username,
        full_name: formData.full_name,
        role: formData.role,
        assigned_vendor: formData.assigned_vendor || null
      };
      
      // Only include password if it's been changed
      if (formData.password) {
        updateData.password = formData.password;
      }

      await axios.patch(`${API}/users/${selectedUser.id}`, updateData);
      toast.success("User updated successfully!");
      setEditDialogOpen(false);
      resetForm();
      setSelectedUser(null);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update user");
      console.error(error);
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await axios.delete(`${API}/users/${userId}`);
      toast.success("User deleted successfully");
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete user");
      console.error(error);
    }
  };

  const openEditDialog = (user) => {
    setSelectedUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      password: "", // Don't pre-fill password
      full_name: user.full_name,
      role: user.role,
      assigned_vendor: user.assigned_vendor || ""
    });
    setEditDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      username: "",
      email: "",
      password: "",
      full_name: "",
      role: "customer_service",
      assigned_vendor: ""
    });
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
              User Management
            </h1>
          </div>
          <Button 
            onClick={() => {
              resetForm();
              setCreateDialogOpen(true);
            }}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Create User
          </Button>
        </div>

        <div className="grid gap-4">
          {loading && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-gray-600">Loading users...</p>
              </CardContent>
            </Card>
          )}

          {!loading && users.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <UserIcon className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600 mb-4">No users found</p>
                <Button onClick={() => setCreateDialogOpen(true)}>
                  Create Your First User
                </Button>
              </CardContent>
            </Card>
          )}

          {!loading && users.map((user) => (
            <Card key={user.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full ${ROLE_COLORS[user.role]} flex items-center justify-center text-white font-bold text-xl`}>
                      {user.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-xl font-bold">{user.full_name}</h3>
                        <Badge className={`${ROLE_COLORS[user.role]} text-white`}>
                          {ROLE_LABELS[user.role]}
                        </Badge>
                        {!user.is_active && (
                          <Badge variant="destructive">Inactive</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <UserIcon className="w-4 h-4" />
                          {user.username}
                        </span>
                        <span className="flex items-center gap-1">
                          <Mail className="w-4 h-4" />
                          {user.email}
                        </span>
                      </div>
                      {user.last_login && (
                        <p className="text-xs text-gray-500 mt-1">
                          Last login: {new Date(user.last_login).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(user)}
                      className="border-blue-500 text-blue-600 hover:bg-blue-50"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteUser(user.id, user.username)}
                      className="border-red-500 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
                
                {user.custom_permissions && user.custom_permissions.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                      <Shield className="w-4 h-4" />
                      Custom Permissions:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {user.custom_permissions.map((perm) => (
                        <Badge key={perm} variant="outline" className="text-xs">
                          {perm}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Create User Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>
                Add a new user to your team with specific role and permissions
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="create-full-name">Full Name *</Label>
                <Input
                  id="create-full-name"
                  placeholder="John Doe"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-username">Username *</Label>
                <Input
                  id="create-username"
                  placeholder="johndoe"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-email">Email *</Label>
                <Input
                  id="create-email"
                  type="email"
                  placeholder="john@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-password">Password *</Label>
                <Input
                  id="create-password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-role">Role *</Label>
                <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                  <SelectTrigger id="create-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="main_admin">Main Admin - Full Access</SelectItem>
                    <SelectItem value="order_manager">Order Manager - Manage Orders</SelectItem>
                    <SelectItem value="customer_service">Customer Service - Support & Communication</SelectItem>
                    <SelectItem value="manufacturer">Manufacturer - Upload Proofs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {formData.role === 'manufacturer' && (
                <div className="space-y-2">
                  <Label htmlFor="create-vendor">Assigned Vendor (Optional)</Label>
                  <Input
                    id="create-vendor"
                    placeholder="e.g., China Factory, Vendor A"
                    value={formData.assigned_vendor}
                    onChange={(e) => setFormData({ ...formData, assigned_vendor: e.target.value })}
                  />
                  <p className="text-xs text-gray-500">
                    Manufacturer will only see orders from this vendor
                  </p>
                </div>
              )}
              
              <Button onClick={handleCreateUser} className="w-full">
                Create User
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit User Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>
                Update user information and role
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-full-name">Full Name *</Label>
                <Input
                  id="edit-full-name"
                  placeholder="John Doe"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-username">Username *</Label>
                <Input
                  id="edit-username"
                  placeholder="johndoe"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email *</Label>
                <Input
                  id="edit-email"
                  type="email"
                  placeholder="john@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-password">New Password (leave blank to keep current)</Label>
                <Input
                  id="edit-password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-role">Role *</Label>
                <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                  <SelectTrigger id="edit-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="main_admin">Main Admin - Full Access</SelectItem>
                    <SelectItem value="order_manager">Order Manager - Manage Orders</SelectItem>
                    <SelectItem value="customer_service">Customer Service - Support & Communication</SelectItem>
                    <SelectItem value="manufacturer">Manufacturer - Upload Proofs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {formData.role === 'manufacturer' && (
                <div className="space-y-2">
                  <Label htmlFor="edit-vendor">Assigned Vendor (Optional)</Label>
                  <Input
                    id="edit-vendor"
                    placeholder="e.g., China Factory, Vendor A"
                    value={formData.assigned_vendor}
                    onChange={(e) => setFormData({ ...formData, assigned_vendor: e.target.value })}
                  />
                  <p className="text-xs text-gray-500">
                    Manufacturer will only see orders from this vendor
                  </p>
                </div>
              )}
              
              <Button onClick={handleEditUser} className="w-full">
                Update User
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default UserManagement;
