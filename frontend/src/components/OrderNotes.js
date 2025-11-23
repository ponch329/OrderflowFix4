import { useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MessageSquare, User, Clock } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const OrderNotes = ({ orderId, notes = [], onNotesUpdate }) => {
  const [newNote, setNewNote] = useState("");
  const [visibleToCustomer, setVisibleToCustomer] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAddNote = async () => {
    if (!newNote.trim()) {
      toast.error("Please enter a note");
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/admin/orders/${orderId}/notes`, {
        content: newNote,
        visible_to_customer: visibleToCustomer
      });

      toast.success("Note added successfully!");
      setNewNote("");
      setVisibleToCustomer(false);
      
      // Refresh notes
      if (onNotesUpdate) {
        onNotesUpdate();
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to add note");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const getRoleBadgeColor = (role) => {
    switch(role?.toLowerCase()) {
      case 'admin':
      case 'main_admin':
        return 'bg-purple-500';
      case 'manufacturer':
        return 'bg-blue-500';
      case 'customer_service':
      case 'order_manager':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <Card className="mb-6 border-2 border-gray-200">
      <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-gray-700" />
              Order Notes
            </CardTitle>
            <CardDescription className="text-gray-600">
              Internal notes and communications about this order
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-gray-600">
            {notes.length} note{notes.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pt-6">
        {/* Add New Note */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <Label className="text-sm font-semibold text-gray-700 mb-2 block">
            Add New Note
          </Label>
          <Textarea
            placeholder="Enter your note here..."
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            rows={3}
            className="mb-3"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Switch
                id="visible-to-customer"
                checked={visibleToCustomer}
                onCheckedChange={setVisibleToCustomer}
              />
              <Label htmlFor="visible-to-customer" className="text-sm cursor-pointer">
                Visible to customer
              </Label>
            </div>
            <Button 
              onClick={handleAddNote} 
              disabled={loading || !newNote.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {loading ? "Adding..." : "Add Note"}
            </Button>
          </div>
        </div>

        {/* Notes List */}
        <div className="space-y-4">
          {notes.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
              <MessageSquare className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p>No notes yet</p>
              <p className="text-sm mt-1">Add your first note above</p>
            </div>
          ) : (
            notes
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
              .map((note) => (
                <div 
                  key={note.id} 
                  className={`p-4 rounded-lg border-l-4 ${
                    note.visible_to_customer 
                      ? 'bg-green-50 border-green-500' 
                      : 'bg-gray-50 border-gray-400'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-600" />
                      <span className="font-semibold text-gray-900">
                        {note.user_name}
                      </span>
                      <Badge className={`${getRoleBadgeColor(note.user_role)} text-white text-xs px-2 py-0.5`}>
                        {note.user_role?.replace('_', ' ')}
                      </Badge>
                      {note.visible_to_customer && (
                        <Badge className="bg-green-600 text-white text-xs px-2 py-0.5">
                          Customer Visible
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="w-3 h-3" />
                      {formatTimestamp(note.created_at)}
                    </div>
                  </div>
                  <p className="text-gray-700 whitespace-pre-wrap">{note.content}</p>
                </div>
              ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default OrderNotes;
