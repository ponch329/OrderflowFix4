"""
Utility functions for splitting orders with multiple bobbleheads into sub-orders.
Each bobblehead gets its own order number suffix (-1, -2, etc.)
"""
from typing import List, Dict, Any
import uuid
from datetime import datetime, timezone

def _item_key(item: Dict[str, Any]) -> str:
    """Return a stable identity for a line item used to detect 'identical' items.
    Prefer SKU when available, fall back to variant id / title / vendor pair.
    """
    sku = (item.get('sku') or '').strip()
    if sku:
        return f"sku::{sku}"
    variant_id = item.get('variant_id') or item.get('id')
    if variant_id:
        return f"var::{variant_id}"
    return f"title::{(item.get('title') or '').strip().lower()}|{(item.get('vendor') or '').strip().lower()}"


async def split_order_by_bobblehead_count(db, order_data: Dict[str, Any], line_items: List[Dict[str, Any]], workflow_config: dict = None) -> List[str]:
    """
    Split an order into sub-orders only when the order contains multiple distinct
    SKUs/products. Identical items (same SKU x N) stay as a single order with
    quantity preserved, because they share a single proof workflow.

    When an order contains multiple distinct SKUs, one sub-order is created per
    unique SKU and that sub-order carries the full quantity for that SKU.

    Args:
        db: Database connection
        order_data: Base order data
        line_items: List of line items with quantity information
        workflow_config: Optional workflow config for default stage/status

    Returns:
        List of created sub-order IDs (empty if splitting wasn't needed)
    """
    # Group line items by identity (SKU / variant / title+vendor)
    groups: Dict[str, Dict[str, Any]] = {}
    for item in line_items:
        key = _item_key(item)
        qty = int(item.get('quantity', 1) or 1)
        if key in groups:
            groups[key]['quantity'] += qty
        else:
            # Clone so we don't mutate caller's list
            groups[key] = {**item, 'quantity': qty}

    # If one unique SKU (however many units) — don't split
    if len(groups) <= 1:
        return []

    # Default stage/status from workflow config
    first_stage = "clay"
    first_status = "sculpting"
    if workflow_config and workflow_config.get("stages"):
        stages = workflow_config["stages"]
        if stages:
            first_stage = stages[0].get("id", "clay")
            statuses = stages[0].get("statuses", [])
            if statuses:
                first_status = statuses[0].get("id", "sculpting")

    created_order_ids: List[str] = []
    parent_order_number = order_data.get('order_number')
    total_groups = len(groups)

    for idx, group_item in enumerate(groups.values(), start=1):
        sub_order_number = f"{parent_order_number}-{idx}"

        # Skip if sub-order already exists (idempotent re-sync)
        existing = await db.orders.find_one({
            "tenant_id": order_data['tenant_id'],
            "order_number": sub_order_number
        })
        if existing:
            continue

        sub_line_item = {
            **group_item,
            'bobblehead_number': idx,
            'total_bobbleheads_in_order': total_groups
        }

        sub_order = {
            "id": str(uuid.uuid4()),
            "tenant_id": order_data['tenant_id'],
            "shopify_order_id": order_data.get('shopify_order_id'),
            "order_number": sub_order_number,
            "parent_order_id": order_data.get('id'),
            "customer_email": order_data.get('customer_email', ''),
            "customer_name": order_data.get('customer_name', ''),
            "item_vendor": group_item.get('vendor', 'Unknown'),
            "line_items": [sub_line_item],
            "total_quantity": int(sub_line_item.get('quantity', 1) or 1),
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
                "message": f"Sub-order {idx} of {total_groups} created from parent {parent_order_number} (SKU: {group_item.get('sku') or group_item.get('title', 'n/a')}, Qty: {group_item.get('quantity', 1)})",
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
    An order is split only when it contains more than one distinct SKU/product.
    Identical items (same SKU, any quantity) share a single proof workflow and
    are NOT split.
    """
    if not line_items:
        return False
    unique_keys = {_item_key(item) for item in line_items}
    return len(unique_keys) > 1


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
