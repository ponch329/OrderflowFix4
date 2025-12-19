"""
Workflow Scheduler - Time-Based Rule Processing

This module processes time-delay workflow rules, automatically transitioning
orders that have been in a specific stage/status for a specified duration.

The scheduler runs periodically (every few minutes) and checks for orders
that match time-delay rules.
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import os

logger = logging.getLogger(__name__)

async def get_db():
    """Get database connection"""
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME')
    client = AsyncIOMotorClient(mongo_url)
    return client[db_name]

async def process_time_delay_rules():
    """
    Process all time-delay workflow rules.
    
    For each rule with trigger='time_delay':
    1. Find orders in the specified fromStage/fromStatus
    2. Check if they've been in that status longer than delayDays + delayHours
    3. If so, transition them to toStage/toStatus and optionally send email
    """
    db = await get_db()
    
    # Get all tenants
    tenants = await db.tenants.find({}, {"_id": 0}).to_list(100)
    
    total_processed = 0
    
    for tenant in tenants:
        tenant_id = tenant.get("id")
        settings = tenant.get("settings", {})
        workflow_config = settings.get("workflow_config", {})
        rules = workflow_config.get("rules", [])
        
        # Filter to only time_delay rules
        time_delay_rules = [r for r in rules if r.get("trigger") == "time_delay"]
        
        if not time_delay_rules:
            continue
        
        logger.info(f"Processing {len(time_delay_rules)} time-delay rules for tenant {tenant_id}")
        
        for rule in time_delay_rules:
            from_stage = rule.get("fromStage")
            from_status = rule.get("fromStatus")
            to_stage = rule.get("toStage")
            to_status = rule.get("toStatus")
            delay_days = rule.get("delayDays", 0)
            delay_hours = rule.get("delayHours", 0)
            email_action = rule.get("emailAction", "none")
            
            if not from_stage or not from_status or not to_stage or not to_status:
                continue
            
            # Calculate the threshold time
            total_delay_hours = (delay_days * 24) + delay_hours
            if total_delay_hours <= 0:
                continue
                
            threshold_time = datetime.now(timezone.utc) - timedelta(hours=total_delay_hours)
            
            # Find the status field name and timestamp field
            status_field = f"{from_stage}_status"
            entered_at_field = f"{from_stage}_entered_at"
            
            # Query for orders matching this rule's criteria
            query = {
                "tenant_id": tenant_id,
                "stage": from_stage,
                status_field: from_status,
                "$or": [
                    {"is_archived": False},
                    {"is_archived": {"$exists": False}},
                    {"archived": False},
                    {"archived": {"$exists": False}}
                ]
            }
            
            orders = await db.orders.find(query, {"_id": 0}).to_list(1000)
            
            for order in orders:
                # Check when the order entered this stage/status
                entered_at_str = order.get(entered_at_field) or order.get("updated_at") or order.get("created_at")
                
                if not entered_at_str:
                    continue
                
                try:
                    if isinstance(entered_at_str, str):
                        entered_at = datetime.fromisoformat(entered_at_str.replace('Z', '+00:00'))
                    else:
                        entered_at = entered_at_str
                    
                    # Make timezone-aware if not already
                    if entered_at.tzinfo is None:
                        entered_at = entered_at.replace(tzinfo=timezone.utc)
                    
                except (ValueError, TypeError) as e:
                    logger.warning(f"Could not parse entered_at for order {order.get('id')}: {e}")
                    continue
                
                # Check if enough time has passed
                if entered_at <= threshold_time:
                    # Time to transition this order!
                    await transition_order(
                        db, 
                        tenant, 
                        order, 
                        to_stage, 
                        to_status, 
                        email_action,
                        f"Auto-transitioned after {delay_days}d {delay_hours}h by time-delay rule"
                    )
                    total_processed += 1
                    logger.info(f"Auto-transitioned order {order.get('order_number')} from {from_stage}/{from_status} to {to_stage}/{to_status}")
    
    return total_processed

async def transition_order(db, tenant, order, to_stage, to_status, email_action, reason):
    """
    Transition an order to a new stage/status and optionally send email.
    """
    from utils.timeline import create_timeline_event
    
    order_id = order.get("id")
    now = datetime.now(timezone.utc)
    
    # Build update data
    to_status_field = f"{to_stage}_status"
    to_entered_at_field = f"{to_stage}_entered_at"
    
    update_data = {
        "stage": to_stage,
        to_status_field: to_status,
        "updated_at": now.isoformat(),
        "last_updated_by": "workflow_scheduler",
        "last_updated_at": now.isoformat()
    }
    
    # Set entered_at if moving to a new stage
    if order.get("stage") != to_stage:
        update_data[to_entered_at_field] = now.isoformat()
    
    # Create timeline event
    timeline_event = create_timeline_event(
        event_type="auto_transition",
        user_name="Workflow Scheduler",
        user_role="system",
        description=reason,
        metadata={
            "from_stage": order.get("stage"),
            "from_status": order.get(f"{order.get('stage')}_status"),
            "to_stage": to_stage,
            "to_status": to_status,
            "trigger": "time_delay"
        }
    )
    
    # Update the order
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": update_data,
            "$push": {"timeline": timeline_event}
        }
    )
    
    # Sync tags to Shopify if order has Shopify ID
    if order.get("shopify_order_id"):
        try:
            # Import here to avoid circular imports
            import sys
            sys.path.insert(0, '/app/backend')
            from server import sync_order_tags_to_shopify
            
            settings = tenant.get("settings", {})
            workflow_config = settings.get("workflow_config", {})
            
            await sync_order_tags_to_shopify(
                order["shopify_order_id"],
                to_stage,
                to_status,
                tenant,
                workflow_config
            )
            logger.info(f"Synced Shopify tags for order {order.get('order_number')}: {to_stage} - {to_status}")
        except Exception as e:
            logger.warning(f"Failed to sync Shopify tags for order {order.get('order_number')}: {e}")
    
    # Send email if configured
    if email_action and email_action != "none":
        try:
            await send_workflow_email(db, tenant, order, to_stage, to_status, email_action)
        except Exception as e:
            logger.error(f"Failed to send workflow email for order {order.get('order_number')}: {e}")

async def send_workflow_email(db, tenant, order, stage, status, email_action):
    """
    Send email based on workflow rule email action.
    """
    from utils.helpers import send_email
    from email_templates import (
        get_customer_proofs_ready_email,
        get_approval_email,
        get_changes_requested_email
    )
    
    customer_email = order.get("customer_email")
    if not customer_email:
        return
    
    order_number = order.get("order_number")
    customer_name = order.get("customer_name", "Customer")
    logo_url = tenant.get("settings", {}).get("logo_url")
    
    subject = None
    html_content = None
    
    if email_action == "proof_ready":
        subject, html_content = get_customer_proofs_ready_email(
            order_number, customer_name, customer_email, stage, logo_url=logo_url
        )
    elif email_action == "stage_complete":
        subject = f"Order #{order_number} - {stage.capitalize()} Stage Complete"
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>Stage Complete</h2>
            <p>Hi {customer_name},</p>
            <p>Great news! Your order #{order_number} has completed the {stage.capitalize()} stage and is now in {status.replace('_', ' ').title()}.</p>
            <p>Thank you for your patience!</p>
        </body>
        </html>
        """
    elif email_action == "reminder":
        subject = f"Reminder: Order #{order_number} - Action Needed"
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>Reminder</h2>
            <p>Hi {customer_name},</p>
            <p>This is a friendly reminder about your order #{order_number}.</p>
            <p>Please check your customer portal for any pending actions.</p>
        </body>
        </html>
        """
    
    if subject and html_content:
        await send_email(tenant, customer_email, subject, html_content)
        logger.info(f"Sent {email_action} email to {customer_email} for order {order_number}")

async def run_scheduler_once():
    """Run the scheduler once (for testing or manual triggering)"""
    try:
        processed = await process_time_delay_rules()
        logger.info(f"Workflow scheduler completed. Processed {processed} orders.")
        return processed
    except Exception as e:
        logger.error(f"Workflow scheduler error: {e}")
        return 0

async def start_scheduler_loop(interval_minutes=5):
    """
    Start the scheduler loop that runs every interval_minutes.
    This should be called as a background task when the app starts.
    """
    logger.info(f"Starting workflow scheduler loop (interval: {interval_minutes} minutes)")
    
    while True:
        try:
            processed = await process_time_delay_rules()
            if processed > 0:
                logger.info(f"Workflow scheduler processed {processed} orders")
        except Exception as e:
            logger.error(f"Workflow scheduler error: {e}")
        
        # Wait for next interval
        await asyncio.sleep(interval_minutes * 60)
