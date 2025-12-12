import { useState } from "react";
import { 
  Package, 
  ExternalLink, 
  Copy, 
  Check, 
  Truck,
  MapPin,
  Clock,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// Carrier configurations with tracking URL templates
const CARRIER_CONFIG = {
  usps: {
    name: "USPS",
    displayName: "USPS (United States Postal Service)",
    color: "#004B87",
    trackingUrl: (num) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${num}`,
    logo: "📦",
    embedUrl: (num) => `https://tools.usps.com/go/TrackConfirmAction?tRef=fullpage&tLc=2&text28777=&tLabels=${num}`,
  },
  fedex: {
    name: "FedEx",
    displayName: "FedEx",
    color: "#4D148C",
    trackingUrl: (num) => `https://www.fedex.com/fedextrack/?trknbr=${num}`,
    logo: "📮",
  },
  ups: {
    name: "UPS",
    displayName: "UPS (United Parcel Service)",
    color: "#351C15",
    trackingUrl: (num) => `https://www.ups.com/track?tracknum=${num}`,
    logo: "🚚",
  },
  dhl: {
    name: "DHL",
    displayName: "DHL Express",
    color: "#FFCC00",
    trackingUrl: (num) => `https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=${num}`,
    logo: "✈️",
  },
  amazon: {
    name: "Amazon",
    displayName: "Amazon Logistics",
    color: "#FF9900",
    trackingUrl: (num) => `https://www.amazon.com/progress-tracker/package?itemId=${num}`,
    logo: "📦",
  },
  ontrac: {
    name: "OnTrac",
    displayName: "OnTrac",
    color: "#00529B",
    trackingUrl: (num) => `https://www.ontrac.com/tracking/?number=${num}`,
    logo: "🚛",
  },
  lasership: {
    name: "LaserShip",
    displayName: "LaserShip",
    color: "#E31837",
    trackingUrl: (num) => `https://www.lasership.com/track/${num}`,
    logo: "⚡",
  },
  other: {
    name: "Other",
    displayName: "Other Carrier",
    color: "#666666",
    trackingUrl: (num) => `https://www.google.com/search?q=track+package+${num}`,
    logo: "📦",
  }
};

// Normalize carrier name to key
const normalizeCarrier = (carrier) => {
  if (!carrier) return 'other';
  const normalized = carrier.toLowerCase().trim();
  
  if (normalized.includes('usps') || normalized.includes('postal')) return 'usps';
  if (normalized.includes('fedex') || normalized.includes('fed ex')) return 'fedex';
  if (normalized.includes('ups')) return 'ups';
  if (normalized.includes('dhl')) return 'dhl';
  if (normalized.includes('amazon')) return 'amazon';
  if (normalized.includes('ontrac')) return 'ontrac';
  if (normalized.includes('laser')) return 'lasership';
  
  return 'other';
};

// Get tracking URL for a carrier and tracking number
export const getTrackingUrl = (carrier, trackingNumber) => {
  const carrierKey = normalizeCarrier(carrier);
  const config = CARRIER_CONFIG[carrierKey] || CARRIER_CONFIG.other;
  return config.trackingUrl(trackingNumber);
};

// Tracking Status Timeline (placeholder for future API integration)
function TrackingTimeline({ status }) {
  const stages = [
    { id: 'label_created', label: 'Label Created', icon: Package },
    { id: 'picked_up', label: 'Picked Up', icon: Truck },
    { id: 'in_transit', label: 'In Transit', icon: MapPin },
    { id: 'out_for_delivery', label: 'Out for Delivery', icon: Truck },
    { id: 'delivered', label: 'Delivered', icon: Check },
  ];

  const currentIndex = stages.findIndex(s => s.id === status) || 0;

  return (
    <div className="mt-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-3">Tracking Status</h4>
      <div className="flex items-center justify-between">
        {stages.map((stage, index) => {
          const Icon = stage.icon;
          const isCompleted = index <= currentIndex;
          const isCurrent = index === currentIndex;

          return (
            <div key={stage.id} className="flex flex-col items-center flex-1">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center
                ${isCompleted ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'}
                ${isCurrent ? 'ring-2 ring-green-300 ring-offset-2' : ''}
              `}>
                <Icon className="w-4 h-4" />
              </div>
              <span className={`text-xs mt-1 text-center ${isCompleted ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                {stage.label}
              </span>
              {index < stages.length - 1 && (
                <div className={`hidden sm:block absolute h-0.5 w-full top-4 left-1/2 ${isCompleted ? 'bg-green-500' : 'bg-gray-200'}`} />
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-500 mt-4 text-center italic">
        For real-time tracking updates, click "Track on Carrier Website" below
      </p>
    </div>
  );
}

// Main Tracking Widget Component
export default function TrackingWidget({ 
  trackingNumber, 
  carrier, 
  trackingUrl: customTrackingUrl,
  shipmentStatus = 'in_transit',
  shippedAt,
  compact = false 
}) {
  const [copied, setCopied] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!trackingNumber) {
    return null;
  }

  const carrierKey = normalizeCarrier(carrier);
  const carrierConfig = CARRIER_CONFIG[carrierKey] || CARRIER_CONFIG.other;
  const trackingUrl = customTrackingUrl || carrierConfig.trackingUrl(trackingNumber);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(trackingNumber);
      setCopied(true);
      toast.success("Tracking number copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error("Failed to copy");
    }
  };

  const handleTrack = () => {
    window.open(trackingUrl, '_blank', 'noopener,noreferrer');
  };

  // Compact inline version
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-lg">{carrierConfig.logo}</span>
        <a 
          href={trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline font-medium"
        >
          {trackingNumber}
        </a>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-6 w-6 p-0"
          onClick={handleCopy}
        >
          {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
        </Button>
      </div>
    );
  }

  // Full dialog version
  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Package className="w-4 h-4" />
          Track Package
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">{carrierConfig.logo}</span>
            Package Tracking
          </DialogTitle>
          <DialogDescription>
            Track your shipment via {carrierConfig.displayName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tracking Number Card */}
          <Card className="border-2" style={{ borderColor: carrierConfig.color }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500">Tracking Number</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-xl font-mono font-bold tracking-wider">
                  {trackingNumber}
                </span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleCopy}
                  className="gap-2"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-green-500" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Carrier Info */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm text-gray-500">Carrier</p>
              <p className="font-semibold" style={{ color: carrierConfig.color }}>
                {carrierConfig.displayName}
              </p>
            </div>
            {shippedAt && (
              <div className="text-right">
                <p className="text-sm text-gray-500">Shipped</p>
                <p className="font-semibold">
                  {new Date(shippedAt).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>

          {/* Tracking Timeline */}
          <TrackingTimeline status={shipmentStatus} />

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button 
              className="flex-1 gap-2" 
              onClick={handleTrack}
              style={{ backgroundColor: carrierConfig.color }}
            >
              <ExternalLink className="w-4 h-4" />
              Track on {carrierConfig.name} Website
            </Button>
          </div>

          {/* Future API Integration Notice */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-blue-800">
                <strong>Coming Soon:</strong> Real-time tracking updates and delivery notifications directly in this dashboard.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Export helper for inline tracking link
export function TrackingLink({ trackingNumber, carrier, className = "" }) {
  if (!trackingNumber) return <span className="text-gray-400">-</span>;
  
  const trackingUrl = getTrackingUrl(carrier, trackingNumber);
  const carrierKey = normalizeCarrier(carrier);
  const carrierConfig = CARRIER_CONFIG[carrierKey] || CARRIER_CONFIG.other;

  return (
    <a 
      href={trackingUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-blue-600 hover:underline flex items-center gap-1 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <span>{carrierConfig.logo}</span>
      {trackingNumber}
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}
