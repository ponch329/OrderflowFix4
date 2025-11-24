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

  const formatDateTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const timeStr = date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });

    if (isToday) {
      return `Today ${timeStr}`;
    } else if (isYesterday) {
      return `Yesterday ${timeStr}`;
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      }) + ' ' + timeStr;
    }
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
          <div className="space-y-4">
            {sortedTimeline.map((event, index) => {
              const Icon = getEventIcon(event.event_type);
              const colorClass = getEventColor(event.event_type);
              
              // Extract actual message for changes_requested events
              const displayDescription = event.event_type === 'changes_requested' && event.metadata?.message
                ? `Requested changes: "${event.metadata.message}"`
                : event.description;
              
              return (
                <div key={event.id || index} className="flex gap-3">
                  {/* Date/Time on the left */}
                  <div className="w-32 flex-shrink-0 text-right">
                    <span className="text-xs text-gray-500">
                      {formatDateTime(event.timestamp)}
                    </span>
                  </div>
                  
                  {/* Icon */}
                  <div className={`${colorClass} p-2 rounded-full shrink-0 h-9 w-9 flex items-center justify-center`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">{displayDescription}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {event.user_name}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {event.user_role}
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
