"""
Helper functions for Google Sheets logging and email notifications
"""
import os
import asyncio
import logging
from datetime import datetime, timezone
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
from typing import List, Optional

from email_templates import get_customer_proofs_ready_email

logger = logging.getLogger(__name__)

async def get_sheets_creds(db, tenant_id: str):
    """Get Google Sheets credentials for a tenant"""
    token = await db.google_tokens.find_one({"tenant_id": tenant_id, "type": "admin"})
    if not token:
        return None
    
    # Get tenant config for credentials
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant or not tenant.get("google_client_id"):
        return None
    
    creds = Credentials(
        token=token["access_token"],
        refresh_token=token.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=tenant["google_client_id"],
        client_secret=tenant["google_client_secret"]
    )
    
    expires = token["expires_at"]
    if isinstance(expires, str):
        expires = datetime.fromisoformat(expires)
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    
    if datetime.now(timezone.utc) >= expires:
        creds.refresh(GoogleRequest())
        await db.google_tokens.update_one(
            {"tenant_id": tenant_id, "type": "admin"},
            {"$set": {"access_token": creds.token, "expires_at": datetime.now(timezone.utc).isoformat()}}
        )
    
    return creds

async def log_to_sheets(db, tenant_id: str, order_number: str, action: str, details: str, stage: str = "", status: str = "", emailed_customer: str = "No"):
    """Log action to Google Sheets with Stage, Status, Timestamp, and Emailed Customer"""
    try:
        # Get tenant config
        tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
        if not tenant or not tenant.get("spreadsheet_id"):
            logger.warning(f"Google Sheets not configured for tenant {tenant_id}, skipping log")
            return
        
        creds = await get_sheets_creds(db, tenant_id)
        if not creds:
            logger.warning("Google Sheets credentials not available, skipping log")
            return
        
        service = build('sheets', 'v4', credentials=creds)
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        # Format: Timestamp, Order Number, Action, Details, Stage, Status, Emailed Customer
        values = [[timestamp, order_number, action, details, stage, status, emailed_customer]]
        body = {"values": values}
        
        await asyncio.to_thread(
            service.spreadsheets().values().append(
                spreadsheetId=tenant["spreadsheet_id"],
                range="Sheet1!A:G",  # Extended to column G
                valueInputOption="RAW",
                body=body
            ).execute
        )
    except Exception as e:
        logger.error(f"Failed to log to sheets: {e}")

async def send_email(tenant_config: dict, to_email: str, subject: str, html_content: str, attachments: List[dict] = None):
    """Send email via SMTP using tenant configuration"""
    try:
        # Check both root level and settings level for SMTP config (backwards compatibility)
        settings = tenant_config.get("settings", {})
        
        smtp_from_email = tenant_config.get("smtp_from_email") or settings.get("smtp_from_email", "noreply@example.com")
        smtp_host = tenant_config.get("smtp_host") or settings.get("smtp_host", "smtp.gmail.com")
        smtp_port = tenant_config.get("smtp_port") or settings.get("smtp_port", 587)
        smtp_user = tenant_config.get("smtp_user") or settings.get("smtp_user")
        smtp_password = tenant_config.get("smtp_password") or settings.get("smtp_password")
        
        # Convert port to int if it's a string
        if isinstance(smtp_port, str):
            smtp_port = int(smtp_port)
        
        if not smtp_user or not smtp_password:
            logger.warning("SMTP credentials not configured for tenant")
            raise Exception("SMTP credentials not configured. Please configure SMTP settings in the Integrations tab.")
        
        msg = MIMEMultipart('related')
        msg['From'] = smtp_from_email
        msg['To'] = to_email
        msg['Subject'] = subject
        
        msg.attach(MIMEText(html_content, 'html'))
        
        if attachments:
            for att in attachments:
                img = MIMEImage(att['data'])
                img.add_header('Content-ID', f"<{att['cid']}>")
                msg.attach(img)
        
        logger.info(f"Attempting to send email via SMTP: {smtp_host}:{smtp_port} from {smtp_from_email}")
        
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.send_message(msg)
            
        logger.info(f"Email sent successfully to {to_email}")
    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        raise

async def send_customer_proof_notification(db, tenant_id: str, order: dict, stage: str, proof_count: int) -> bool:
    """
    Send automated email notification to customer when proofs are ready
    Returns True if email was sent successfully, False otherwise
    """
    try:
        tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
        if not tenant:
            return False
        
        if not tenant.get("settings", {}).get("email_templates_enabled", True):
            logger.info("Email templates disabled for this tenant")
            return False
        
        customer_email = order.get('customer_email')
        if not customer_email:
            return False
        
        logo_url = tenant.get("settings", {}).get("logo_url")
        company_name = tenant.get("name", "")
        
        # Get customer portal URL from tenant settings or use FRONTEND_URL env variable
        frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
        portal_url = tenant.get("settings", {}).get("customer_portal_url", f"{frontend_url}/customer")
        
        subject, html_content = get_customer_proofs_ready_email(
            order['order_number'],
            order.get('customer_name', 'Valued Customer'),
            stage,
            proof_count,
            portal_url=portal_url,
            logo_url=logo_url,
            company_name=company_name
        )
        
        await send_email(tenant, customer_email, subject, html_content)
        logger.info(f"Automated customer notification sent for order {order['order_number']}")
        return True
    except Exception as e:
        logger.error(f"Failed to send customer notification email: {e}")
        return False
