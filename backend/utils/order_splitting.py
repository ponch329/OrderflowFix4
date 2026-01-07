"""
Utility functions for splitting orders with multiple bobbleheads into sub-orders.
Each bobblehead gets its own order number suffix (-1, -2, etc.)
"""
from typing import List, Dict, Any
import uuid
from datetime import datetime, timezone

async def split_order_by_bobblehead_count(db, order_data: Dict[str, Any], line_items: List[Dict[str, Any]], workflow_config: dict = None) -> List[str]:
    """
    Split an order with multiple bobbleheads into separate sub-orders.
    Each bobblehead (based on quantity) gets its own order number suffix (-1, -2, etc.)
    
    Args:
        db: Database connection
        order_data: Base order data from Shopify
        line_items: List of line items with quantity information
        workflow_config: Optional workflow config for default stage/status
    
    Returns:
        List of created sub-order IDs
    """
    # Calculate total number of bobbleheads across all line items
    total_bobbleheads = 0
    bobblehead_details = []  # Track each bobblehead with its item details
    
    for item in line_items:
        quantity = item.get('quantity', 1)
        # Each unit of quantity is a separate bobblehead
        for i in range(quantity):
            total_bobbleheads += 1
            bobblehead_details.append({
                'item': item,
                'bobblehead_index': total_bobbleheads,
                'item_index_within_line': i + 1
            })
    
    # Only create suborders if there are multiple bobbleheads
    if total_bobbleheads <= 1:
        return []
    
    # Get default stage/status from workflow config
    first_stage = "clay"
    first_status = "sculpting"
    if workflow_config and workflow_config.get("stages"):
        stages = workflow_config["stages"]
        if stages:
            first_stage = stages[0].get("id", "clay")
            statuses = stages[0].get("statuses", [])
            if statuses:
                first_status = statuses[0].get("id", "sculpting")
    
    # Create sub-orders for each bobblehead
    created_order_ids = []
    parent_order_number = order_data.get('order_number')
    
    for idx, bobblehead_info in enumerate(bobblehead_details, start=1):
        sub_order_number = f"{parent_order_number}-{idx}"
        item = bobblehead_info['item']
        
        # Check if sub-order already exists
        existing = await db.orders.find_one({
            "tenant_id": order_data['tenant_id'],
            "order_number": sub_order_number
        })
        
        if existing:
            continue
        
        # Create single-item line_items for this sub-order (quantity = 1)
        sub_line_item = {
            **item,
            'quantity': 1,
            'bobblehead_number': idx,
            'total_bobbleheads_in_order': total_bobbleheads
        }
        
        # Create sub-order
        sub_order = {
            "id": str(uuid.uuid4()),
            "tenant_id": order_data['tenant_id'],
            "shopify_order_id": order_data.get('shopify_order_id'),
            "order_number": sub_order_number,
            "parent_order_id": order_data.get('id'),
            "customer_email": order_data.get('customer_email', ''),
            "customer_name": order_data.get('customer_name', ''),
            "item_vendor": item.get('vendor', 'Unknown'),
            "line_items": [sub_line_item],  # Single bobblehead per sub-order
            "stage": first_stage,
            f"{first_stage}_status": first_status,
            "clay_status": first_status if first_stage == "clay" else "pending",
            "paint_status": "pending",
            "is_manual_order": False,
            "is_archived": False,
            "shopify_fulfillment_status": order_data.get('shopify_fulfillment_status'),
            "clay_entered_at": datetime.now(timezone.utc).isoformat() if first_stage == "clay" else None,
            "paint_entered_at": datetime.now(timezone.utc).isoformat() if first_stage == "paint" else None,
            "fulfilled_at": None,
            "canceled_at": None,
            "clay_proofs": [],
            "paint_proofs": [],
            "clay_approval": None,
            "paint_approval": None,
            "notes": [],
            "timeline": [{
                "id": str(uuid.uuid4()),
                "type": "system",
                "message": f"Sub-order created from parent order {parent_order_number} (Bobblehead {idx} of {total_bobbleheads})",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "created_by": "system"
            }],
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
    Determine if an order should be split based on total bobblehead quantity.
    
    Args:
        line_items: List of line items with quantity information
    
    Returns:
        True if order has more than 1 bobblehead total, False otherwise
    """
    total_quantity = sum(item.get('quantity', 1) for item in line_items)
    return total_quantity > 1


# Keep old function name as alias for backward compatibility
split_order_by_vendor = split_order_by_bobblehead_count


async def get_sub_orders(db, parent_order_id: str, tenant_id: str) -> List[Dict[str, Any]]:
    """
    Get all sub-orders for a parent order
    
    Args:
        db: Database connection
        parent_order_id: ID of the parent order
        tenant_id: Tenant ID
    
    Returns:
        List of sub-orders sorted by order number
    """
    sub_orders = await db.orders.find(
        {
            "tenant_id": tenant_id,
            "parent_order_id": parent_order_id
        },
        {"_id": 0}
    ).sort("order_number", 1).to_list(100)
    
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


async def get_bobblehead_count(line_items: List[Dict[str, Any]]) -> int:
    """
    Get the total number of bobbleheads in an order based on line item quantities.
    
    Args:
        line_items: List of line items with quantity information
    
    Returns:
        Total number of bobbleheads
    """
    return sum(item.get('quantity', 1) for item in line_items)
