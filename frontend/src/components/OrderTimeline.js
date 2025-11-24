import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Upload, CheckCircle, Edit, MessageSquare, Bell, Package, Trash2 } from 'lucide-react';

const OrderTimeline = ({ timeline = [] }) => {
  const getEventIcon = (eventType) => {
    const iconMap = {
      order_created: Package,
      status_change: Edit,
      stage_change: Edit,
      proof_upload: Upload,
      approval: CheckCircle,
      changes_requested: MessageSquare,
      note_added: MessageSquare,
      ping: Bell,
      tracking_added: Package,
      tracking_updated: Package,
      order_edited: Edit,
      proof_deleted: Trash2,
      approval_edited: Edit
    };
    return iconMap[eventType] || Clock;
  };

  const getEventColor = (eventType) => {
    const colorMap = {
      order_created: 'bg-blue-500',
      status_change: 'bg-purple-500',
      stage_change: 'bg-indigo-500',
      proof_upload: 'bg-green-500',
      approval: 'bg-green-600',
      changes_requested: 'bg-orange-500',
      note_added: 'bg-gray-500',
      ping: 'bg-yellow-500',
      tracking_added: 'bg-cyan-500',
      tracking_updated: 'bg-cyan-500',
      order_edited: 'bg-purple-500',
      proof_deleted: 'bg-red-500',
      approval_edited: 'bg-purple-500'
    };
    return colorMap[eventType] || 'bg-gray-400';
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  // Sort timeline by timestamp (newest first)
  const sortedTimeline = [...timeline].sort((a, b) => 
    new Date(b.timestamp) - new Date(a.timestamp)
  );

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-600" />
          Order Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sortedTimeline.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No timeline events yet</p>
        ) : (
          <div className="space-y-3">
            {sortedTimeline.map((event, index) => {
              const Icon = getEventIcon(event.event_type);
              const colorClass = getEventColor(event.event_type);
              
              return (
                <div key={event.id || index} className="flex gap-3 items-start">
                  <div className={`${colorClass} p-2 rounded-full shrink-0`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{event.description}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {event.user_name}
                          </Badge>
                          <span className="text-xs text-gray-500">
                            {event.user_role}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {formatTimestamp(event.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OrderTimeline;
