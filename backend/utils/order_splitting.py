"""
Utility functions for splitting multi-vendor orders into sub-orders
"""
from typing import List, Dict, Any
import uuid
from datetime import datetime, timezone

async def split_order_by_vendor(db, order_data: Dict[str, Any], line_items: List[Dict[str, Any]]) -> List[str]:
    """
    Split an order with multiple vendors into separate sub-orders
    
    Args:
        db: Database connection
        order_data: Base order data from Shopify
        line_items: List of line items with vendor information
    
    Returns:
        List of created sub-order IDs
    """
    # Group line items by vendor
    vendor_groups = {}
    for item in line_items:
        vendor = item.get('vendor', 'Unknown')
        if vendor not in vendor_groups:
            vendor_groups[vendor] = []
        vendor_groups[vendor].append(item)
    
    # If only one vendor, no need to split
    if len(vendor_groups) <= 1:
        return []
    
    # Create sub-orders for each vendor
    created_order_ids = []
    parent_order_number = order_data.get('order_number')
    
    for idx, (vendor, items) in enumerate(vendor_groups.items(), start=1):
        sub_order_number = f"{parent_order_number}-{idx}"
        
        # Check if sub-order already exists
        existing = await db.orders.find_one({
            "tenant_id": order_data['tenant_id'],
            "order_number": sub_order_number
        })
        
        if existing:
            continue
        
        # Create sub-order
        sub_order = {
            "id": str(uuid.uuid4()),
            "tenant_id": order_data['tenant_id'],
            "shopify_order_id": order_data.get('shopify_order_id'),
            "order_number": sub_order_number,
            "parent_order_id": order_data.get('id'),
            "customer_email": order_data.get('customer_email', ''),
            "customer_name": order_data.get('customer_name', ''),
            "item_vendor": vendor,
            "line_items": items,  # Store the specific items for this vendor
            "stage": "clay",
            "clay_status": "sculpting",
            "paint_status": "pending",
            "is_manual_order": False,
            "is_archived": False,
            "shopify_fulfillment_status": order_data.get('shopify_fulfillment_status'),
            "clay_entered_at": datetime.now(timezone.utc).isoformat(),
            "paint_entered_at": None,
            "fulfilled_at": None,
            "canceled_at": None,
            "clay_proofs": [],
            "paint_proofs": [],
            "clay_approval": None,
            "paint_approval": None,
            "notes": [],
            "last_updated_by": "system",
            "last_updated_at": datetime.now(timezone.utc).isoformat(),
            "created_at": order_data.get('created_at', datetime.now(timezone.utc).isoformat()),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.orders.insert_one(sub_order)
        created_order_ids.append(sub_order['id'])
    
    return created_order_ids

async def should_split_order(line_items: List[Dict[str, Any]]) -> bool:
    """
    Determine if an order should be split based on vendors
    
    Args:
        line_items: List of line items with vendor information
    
    Returns:
        True if order has multiple vendors, False otherwise
    """
    vendors = set()
    for item in line_items:
        vendor = item.get('vendor', 'Unknown')
        vendors.add(vendor)
    
    return len(vendors) > 1

async def get_sub_orders(db, parent_order_id: str, tenant_id: str) -> List[Dict[str, Any]]:
    """
    Get all sub-orders for a parent order
    
    Args:
        db: Database connection
        parent_order_id: ID of the parent order
        tenant_id: Tenant ID
    
    Returns:
        List of sub-orders
    """
    sub_orders = await db.orders.find(
        {
            "tenant_id": tenant_id,
            "parent_order_id": parent_order_id
        },
        {"_id": 0}
    ).to_list(100)
    
    return sub_orders

async def get_parent_order(db, sub_order: Dict[str, Any]) -> Dict[str, Any]:
    """
    Get the parent order for a sub-order
    
    Args:
        db: Database connection
        sub_order: Sub-order document
    
    Returns:
        Parent order document or None
    """
    parent_id = sub_order.get('parent_order_id')
    if not parent_id:
        return None
    
    parent = await db.orders.find_one(
        {
            "id": parent_id,
            "tenant_id": sub_order['tenant_id']
        },
        {"_id": 0}
    )
    
    return parent
