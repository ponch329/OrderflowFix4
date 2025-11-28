"""
Shopify Integration - Sync orders from Shopify to the application
"""
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)

async def sync_shopify_orders(db, tenant_id: str, limit: int = 50) -> Dict[str, Any]:
    """
    Sync recent orders from Shopify
    
    Args:
        db: Database connection
        tenant_id: Tenant ID
        limit: Maximum number of orders to sync (default 50)
        
    Returns:
        Dict with sync results
    """
    try:
        import shopify
        
        # Get tenant settings
        tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
        if not tenant:
            return {"success": False, "error": "Tenant not found"}
        
        settings = tenant.get("settings", {})
        shopify_shop = settings.get("shopify_shop")
        shopify_api_key = settings.get("shopify_api_key")
        shopify_access_token = settings.get("shopify_access_token")
        
        if not all([shopify_shop, shopify_access_token]):
            return {
                "success": False,
                "error": "Shopify not configured. Please add your Shopify credentials in Settings > Integrations."
            }
        
        # Initialize Shopify session
        shopify_api_version = "2024-10"
        session = shopify.Session(
            f"{shopify_shop}.myshopify.com",
            shopify_api_version,
            shopify_access_token
        )
        shopify.ShopifyResource.activate_session(session)
        
        # Fetch recent orders from Shopify
        shopify_orders = shopify.Order.find(status="any", limit=limit)
        
        synced_count = 0
        skipped_count = 0
        updated_count = 0
        errors = []
        
        for shopify_order in shopify_orders:
            try:
                order_number = str(shopify_order.order_number)
                
                # Check if order already exists
                existing_order = await db.orders.find_one(
                    {"order_number": order_number, "tenant_id": tenant_id},
                    {"_id": 0}
                )
                
                if existing_order:
                    skipped_count += 1
                    continue
                
                # Extract customer info
                customer = shopify_order.customer if hasattr(shopify_order, 'customer') else None
                customer_name = f"{customer.first_name} {customer.last_name}" if customer else "Unknown Customer"
                customer_email = customer.email if customer else None
                
                # Create new order
                new_order = {
                    "id": str(uuid4()),
                    "tenant_id": tenant_id,
                    "order_number": order_number,
                    "customer_name": customer_name,
                    "customer_email": customer_email,
                    "shopify_order_id": str(shopify_order.id),
                    "stage": "clay",
                    "clay_status": "pending",
                    "paint_status": "pending",
                    "clay_proofs": [],
                    "paint_proofs": [],
                    "clay_approval": None,
                    "paint_approval": None,
                    "tracking_number": None,
                    "tracking_url": None,
                    "notes": f"Imported from Shopify on {datetime.now(timezone.utc).strftime('%Y-%m-%d')}",
                    "created_at": shopify_order.created_at if hasattr(shopify_order, 'created_at') else datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "last_updated_by": "system",
                    "last_updated_at": datetime.now(timezone.utc).isoformat(),
                    "timeline": [{
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "event_type": "order_created",
                        "user_name": "System",
                        "user_role": "system",
                        "description": f"Order imported from Shopify (Order #{order_number})"
                    }]
                }
                
                await db.orders.insert_one(new_order)
                synced_count += 1
                logger.info(f"Synced Shopify order #{order_number}")
                
            except Exception as e:
                logger.error(f"Failed to sync Shopify order: {e}")
                errors.append(f"Order #{shopify_order.order_number}: {str(e)}")
                continue
        
        shopify.ShopifyResource.clear_session()
        
        return {
            "success": True,
            "synced": synced_count,
            "skipped": skipped_count,
            "updated": updated_count,
            "total_fetched": len(shopify_orders),
            "errors": errors,
            "message": f"Synced {synced_count} new orders from Shopify (skipped {skipped_count} existing orders)"
        }
        
    except ImportError:
        return {
            "success": False,
            "error": "Shopify Python library not installed"
        }
    except Exception as e:
        logger.error(f"Shopify sync failed: {e}")
        return {
            "success": False,
            "error": str(e)
        }
