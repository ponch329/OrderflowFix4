"""
Tracking Utilities - Fetch and update order tracking information from Shopify
"""
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

async def fetch_shopify_tracking(order_id: str, shopify_order_id: str, db, tenant_settings: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Fetch tracking information from Shopify for a given order
    
    Args:
        order_id: Internal order ID
        shopify_order_id: Shopify order ID
        db: Database connection
        tenant_settings: Tenant configuration with Shopify credentials
        
    Returns:
        Dict with tracking information or None if not available
    """
    try:
        import shopify
        
        shopify_shop_name = tenant_settings.get("shopify_shop_name")
        shopify_access_token = tenant_settings.get("shopify_access_token")
        
        if not shopify_shop_name or not shopify_access_token:
            logger.warning(f"Shopify not configured for order {order_id}")
            return None
        
        # Initialize Shopify session
        shopify_api_version = "2024-10"
        session = shopify.Session(
            f"{shopify_shop_name}.myshopify.com",
            shopify_api_version,
            shopify_access_token
        )
        shopify.ShopifyResource.activate_session(session)
        
        # Fetch order from Shopify
        shopify_order = shopify.Order.find(shopify_order_id)
        
        if not shopify_order:
            logger.warning(f"Shopify order {shopify_order_id} not found")
            return None
        
        # Extract tracking information from fulfillments
        tracking_info = None
        
        if hasattr(shopify_order, 'fulfillments') and shopify_order.fulfillments:
            # Get the most recent fulfillment
            fulfillment = shopify_order.fulfillments[-1]
            
            if hasattr(fulfillment, 'tracking_number') and fulfillment.tracking_number:
                tracking_info = {
                    'tracking_number': fulfillment.tracking_number,
                    'tracking_url': getattr(fulfillment, 'tracking_url', None) or getattr(fulfillment, 'tracking_urls', [None])[0],
                    'tracking_company': getattr(fulfillment, 'tracking_company', 'Unknown'),
                    'shipment_status': getattr(fulfillment, 'shipment_status', 'in_transit'),
                    'shipped_at': datetime.now(timezone.utc).isoformat()
                }
                
                # Build tracking URL if not provided
                if not tracking_info['tracking_url'] and tracking_info['tracking_number']:
                    tracking_info['tracking_url'] = build_tracking_url(
                        tracking_info['tracking_number'],
                        tracking_info['tracking_company']
                    )
                
                logger.info(f"Fetched tracking for order {order_id}: {tracking_info['tracking_number']}")
        
        shopify.ShopifyResource.clear_session()
        return tracking_info
        
    except Exception as e:
        logger.error(f"Failed to fetch Shopify tracking for order {order_id}: {e}")
        return None


def build_tracking_url(tracking_number: str, carrier: str) -> str:
    """
    Build a tracking URL based on carrier and tracking number
    
    Args:
        tracking_number: Tracking number
        carrier: Carrier name (UPS, FedEx, USPS, etc.)
        
    Returns:
        Tracking URL
    """
    carrier_lower = carrier.lower() if carrier else ""
    
    # Common carrier tracking URLs
    if 'ups' in carrier_lower:
        return f"https://www.ups.com/track?tracknum={tracking_number}"
    elif 'fedex' in carrier_lower:
        return f"https://www.fedex.com/fedextrack/?trknbr={tracking_number}"
    elif 'usps' in carrier_lower:
        return f"https://tools.usps.com/go/TrackConfirmAction?tLabels={tracking_number}"
    elif 'dhl' in carrier_lower:
        return f"https://www.dhl.com/en/express/tracking.html?AWB={tracking_number}"
    elif 'canada post' in carrier_lower or 'canadapost' in carrier_lower:
        return f"https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor={tracking_number}"
    else:
        # Generic tracking search
        return f"https://www.google.com/search?q=track+{tracking_number}"


async def update_order_tracking(order_id: str, shopify_order_id: str, db, tenant_settings: Dict[str, Any]) -> bool:
    """
    Fetch and update tracking information for an order
    
    Args:
        order_id: Internal order ID
        shopify_order_id: Shopify order ID
        db: Database connection
        tenant_settings: Tenant configuration
        
    Returns:
        True if tracking was updated, False otherwise
    """
    tracking_info = await fetch_shopify_tracking(order_id, shopify_order_id, db, tenant_settings)
    
    if not tracking_info:
        return False
    
    # Update order in database
    result = await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "tracking_number": tracking_info['tracking_number'],
            "tracking_url": tracking_info['tracking_url'],
            "tracking_company": tracking_info['tracking_company'],
            "shipment_status": tracking_info['shipment_status'],
            "shipped_at": tracking_info['shipped_at'],
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return result.modified_count > 0
