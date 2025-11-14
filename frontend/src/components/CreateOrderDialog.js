import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function CreateOrderDialog({ open, onOpenChange, onOrderCreated }) {
  const [formData, setFormData] = useState({
    order_number: '',
    customer_name: '',
    customer_email: '',
    stage: 'clay'
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.order_number || !formData.customer_name || !formData.customer_email) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API_URL}/api/admin/orders/create`, formData);
      toast.success('Order created successfully!');
      setFormData({
        order_number: '',
        customer_name: '',
        customer_email: '',
        stage: 'clay'
      });
      onOpenChange(false);
      if (onOrderCreated) onOrderCreated();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Order</DialogTitle>
          <DialogDescription>
            Create a manual order that doesn't come from Shopify
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="order_number">Order Number *</Label>
            <Input
              id="order_number"
              placeholder="e.g., 203999"
              value={formData.order_number}
              onChange={(e) => setFormData({...formData, order_number: e.target.value})}
              disabled={loading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="customer_name">Customer Name *</Label>
            <Input
              id="customer_name"
              placeholder="John Doe"
              value={formData.customer_name}
              onChange={(e) => setFormData({...formData, customer_name: e.target.value})}
              disabled={loading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="customer_email">Customer Email *</Label>
            <Input
              id="customer_email"
              type="email"
              placeholder="customer@example.com"
              value={formData.customer_email}
              onChange={(e) => setFormData({...formData, customer_email: e.target.value})}
              disabled={loading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="stage">Initial Stage</Label>
            <Select 
              value={formData.stage} 
              onValueChange={(value) => setFormData({...formData, stage: value})}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="clay">Clay</SelectItem>
                <SelectItem value="paint">Paint</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button 
              type="button" 
              variant="outline" 
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Order'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
