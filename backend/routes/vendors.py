"""
Vendor management and order splitting routes
"""
from fastapi import APIRouter, HTTPException, Depends
from motor.motor_asyncio import AsyncIOMotorClient
from typing import List
import os

from models.user import Permission
from middleware.auth import AuthContext, require_permissions
from utils.order_splitting import split_order_by_vendor, get_sub_orders

router = APIRouter(prefix="/vendors", tags=["Vendor Management"])

def get_db():
    """Dependency to get database connection"""
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    return db

@router.get("/list")
async def get_all_vendors(
    auth: AuthContext = Depends(require_permissions(Permission.VIEW_ORDERS)),
    db = Depends(get_db)
):
    """
    Get list of all unique vendors from orders
    Requires: VIEW_ORDERS permission
    """
    # Get distinct vendors from orders
    vendors = await db.orders.distinct("item_vendor", {"tenant_id": auth.tenant_id})
    
    # Count orders per vendor
    vendor_stats = []
    for vendor in vendors:
        if vendor:  # Skip None/empty vendors
            count = await db.orders.count_documents({
                "tenant_id": auth.tenant_id,
                "item_vendor": vendor
            })
            vendor_stats.append({
                "name": vendor,
                "order_count": count
            })
    
    # Sort by order count descending
    vendor_stats.sort(key=lambda x: x['order_count'], reverse=True)
    
    return {
        "vendors": vendor_stats,
        "total_vendors": len(vendor_stats)
    }

@router.post("/orders/{order_id}/split")
async def split_order_manually(
    order_id: str,
    auth: AuthContext = Depends(require_permissions(Permission.EDIT_ORDERS)),
    db = Depends(get_db)
):
    """
    Manually split an order by vendor
    Requires: EDIT_ORDERS permission
    """
    # Find the order
    order = await db.orders.find_one({
        "id": order_id,
        "tenant_id": auth.tenant_id
    }, {"_id": 0})
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Check if order has line items
    line_items = order.get('line_items', [])
    if not line_items:
        raise HTTPException(status_code=400, detail="Order has no line items to split")
    
    # Check if order has multiple vendors
    vendors = set()
    for item in line_items:
        vendors.add(item.get('vendor', 'Unknown'))
    
    if len(vendors) <= 1:
        raise HTTPException(status_code=400, detail="Order has only one vendor, no need to split")
    
    # Check if already split
    existing_sub_orders = await get_sub_orders(db, order_id, auth.tenant_id)
    if existing_sub_orders:
        raise HTTPException(status_code=400, detail=f"Order already split into {len(existing_sub_orders)} sub-orders")
    
    # Split the order
    sub_order_ids = await split_order_by_vendor(db, order, line_items)
    
    return {
        "message": f"Order split into {len(sub_order_ids)} sub-orders",
        "parent_order": order_id,
        "sub_order_ids": sub_order_ids,
        "vendors": list(vendors)
    }

@router.get("/orders/{order_id}/sub-orders")
async def get_order_sub_orders(
    order_id: str,
    auth: AuthContext = Depends(require_permissions(Permission.VIEW_ORDERS)),
    db = Depends(get_db)
):
    """
    Get all sub-orders for a parent order
    Requires: VIEW_ORDERS permission
    """
    sub_orders = await get_sub_orders(db, order_id, auth.tenant_id)
    
    return {
        "parent_order_id": order_id,
        "sub_orders": sub_orders,
        "count": len(sub_orders)
    }
