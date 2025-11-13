from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import shopify
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build
from google_auth_oauthlib.flow import Flow
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
import zipfile
import io
import base64
from PIL import Image
import warnings
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Shopify Configuration
SHOPIFY_API_KEY = os.environ.get('SHOPIFY_API_KEY', '')
SHOPIFY_API_SECRET = os.environ.get('SHOPIFY_API_SECRET', '')
SHOPIFY_SHOP_NAME = os.environ.get('SHOPIFY_SHOP_NAME', '')
SHOPIFY_ACCESS_TOKEN = os.environ.get('SHOPIFY_ACCESS_TOKEN', '')
SHOPIFY_API_VERSION = "2024-10"

# Initialize Shopify Session setup
if SHOPIFY_API_KEY and SHOPIFY_API_SECRET:
    shopify.Session.setup(api_key=SHOPIFY_API_KEY, secret=SHOPIFY_API_SECRET)

# Google Sheets Configuration
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', '')
SHEETS_REDIRECT_URI = os.environ.get('SHEETS_REDIRECT_URI', '')
SPREADSHEET_ID = os.environ.get('SPREADSHEET_ID', '')
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile"
]

# SMTP Configuration
SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
SMTP_PORT = int(os.environ.get('SMTP_PORT', '587'))
SMTP_USER = os.environ.get('SMTP_USER', '')
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD', '')
SMTP_FROM_EMAIL = os.environ.get('SMTP_FROM_EMAIL', '')

# Models
class ProofImage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    url: str
    filename: str
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ApprovalRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: str  # 'approved' or 'changes_requested'
    message: Optional[str] = None
    images: List[str] = []  # URLs of additional images
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    shopify_order_id: str
    order_number: str
    customer_email: str
    customer_name: str
    stage: str = "clay"  # clay, paint, shipped
    clay_proofs: List[ProofImage] = []
    paint_proofs: List[ProofImage] = []
    clay_approval: Optional[ApprovalRequest] = None
    paint_approval: Optional[ApprovalRequest] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class OrderCreate(BaseModel):
    shopify_order_id: str
    order_number: str
    customer_email: str
    customer_name: str

class ApprovalRequestCreate(BaseModel):
    status: str
    message: Optional[str] = None

# Helper Functions
def get_shopify_session():
    """Initialize Shopify session"""
    if not SHOPIFY_ACCESS_TOKEN or not SHOPIFY_SHOP_NAME:
        return None
    session = shopify.Session(f"{SHOPIFY_SHOP_NAME}.myshopify.com", SHOPIFY_API_VERSION, SHOPIFY_ACCESS_TOKEN)
    shopify.ShopifyResource.activate_session(session)
    return session

async def get_sheets_creds():
    """Get Google Sheets credentials"""
    token = await db.google_tokens.find_one({"type": "admin"})
    if not token:
        return None
    
    creds = Credentials(
        token=token["access_token"],
        refresh_token=token.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET
    )
    
    expires = token["expires_at"]
    if isinstance(expires, str):
        expires = datetime.fromisoformat(expires)
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    
    if datetime.now(timezone.utc) >= expires:
        creds.refresh(GoogleRequest())
        await db.google_tokens.update_one(
            {"type": "admin"},
            {"$set": {"access_token": creds.token, "expires_at": datetime.now(timezone.utc).isoformat()}}
        )
    
    return creds

async def log_to_sheets(order_number: str, action: str, details: str):
    """Log action to Google Sheets"""
    try:
        creds = await get_sheets_creds()
        if not creds or not SPREADSHEET_ID:
            logger.warning("Google Sheets not configured, skipping log")
            return
        
        service = build('sheets', 'v4', credentials=creds)
        timestamp = datetime.now(timezone.utc).isoformat()
        values = [[timestamp, order_number, action, details]]
        body = {"values": values}
        
        await asyncio.to_thread(
            service.spreadsheets().values().append(
                spreadsheetId=SPREADSHEET_ID,
                range="Sheet1!A:D",
                valueInputOption="RAW",
                body=body
            ).execute
        )
    except Exception as e:
        logger.error(f"Failed to log to sheets: {e}")

async def send_email(to_email: str, subject: str, html_content: str, attachments: List[dict] = None):
    """Send email via SMTP"""
    try:
        msg = MIMEMultipart('related')
        msg['From'] = SMTP_FROM_EMAIL
        msg['To'] = to_email
        msg['Subject'] = subject
        
        msg.attach(MIMEText(html_content, 'html'))
        
        if attachments:
            for att in attachments:
                img = MIMEImage(att['data'])
                img.add_header('Content-ID', f"<{att['cid']}>")
                msg.attach(img)
        
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)
    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        raise

# Routes
@api_router.get("/")
async def root():
    return {"message": "Bobblehead Order Approval System API"}

# Admin Routes
@api_router.post("/admin/sync-orders")
async def sync_orders():
    """Sync orders from Shopify"""
    session = get_shopify_session()
    if not session:
        raise HTTPException(status_code=400, detail="Shopify not configured")
    
    try:
        orders = shopify.Order.find(status='any', limit=250)
        synced_count = 0
        
        for order in orders:
            existing = await db.orders.find_one({"shopify_order_id": str(order.id)})
            if not existing:
                order_doc = {
                    "id": str(uuid.uuid4()),
                    "shopify_order_id": str(order.id),
                    "order_number": str(order.order_number),
                    "customer_email": order.customer.email if order.customer else "",
                    "customer_name": f"{order.customer.first_name} {order.customer.last_name}" if order.customer else "",
                    "stage": "clay",
                    "clay_proofs": [],
                    "paint_proofs": [],
                    "clay_approval": None,
                    "paint_approval": None,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
                await db.orders.insert_one(order_doc)
                synced_count += 1
        
        return {"message": f"Synced {synced_count} new orders", "total": len(orders)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/admin/orders", response_model=List[Order])
async def get_all_orders():
    """Get all orders for admin"""
    orders = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    for order in orders:
        for field in ['created_at', 'updated_at']:
            if isinstance(order.get(field), str):
                order[field] = datetime.fromisoformat(order[field])
    
    return orders

@api_router.post("/admin/orders/{order_id}/proofs")
async def upload_proofs(
    order_id: str,
    stage: str = Form(...),
    files: List[UploadFile] = File(...)
):
    """Upload proof images for an order (supports zip files)"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    uploaded_proofs = []
    
    for file in files:
        if file.filename.endswith('.zip'):
            # Handle zip file
            content = await file.read()
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                for name in zf.namelist():
                    if name.lower().endswith(('.png', '.jpg', '.jpeg', '.gif')):
                        image_data = zf.read(name)
                        # In production, upload to S3/cloud storage
                        # For now, store as base64 in DB
                        image_base64 = base64.b64encode(image_data).decode('utf-8')
                        proof = {
                            "id": str(uuid.uuid4()),
                            "url": f"data:image/jpeg;base64,{image_base64}",
                            "filename": name,
                            "uploaded_at": datetime.now(timezone.utc).isoformat()
                        }
                        uploaded_proofs.append(proof)
        else:
            # Handle individual image file
            content = await file.read()
            image_base64 = base64.b64encode(content).decode('utf-8')
            proof = {
                "id": str(uuid.uuid4()),
                "url": f"data:image/jpeg;base64,{image_base64}",
                "filename": file.filename,
                "uploaded_at": datetime.now(timezone.utc).isoformat()
            }
            uploaded_proofs.append(proof)
    
    # Update order with proofs
    field = f"{stage}_proofs"
    await db.orders.update_one(
        {"id": order_id},
        {"$push": {field: {"$each": uploaded_proofs}}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    await log_to_sheets(order['order_number'], f"Proofs Uploaded - {stage}", f"{len(uploaded_proofs)} images")
    
    return {"message": f"Uploaded {len(uploaded_proofs)} proofs", "proofs": uploaded_proofs}

# Customer Routes
@api_router.get("/customer/lookup")
async def lookup_order(email: str, order_number: str):
    """Customer lookup by email and order number"""
    order = await db.orders.find_one(
        {"customer_email": email.lower(), "order_number": order_number},
        {"_id": 0}
    )
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    for field in ['created_at', 'updated_at']:
        if isinstance(order.get(field), str):
            order[field] = datetime.fromisoformat(order[field])
    
    return order

@api_router.post("/customer/orders/{order_id}/approve")
async def approve_stage(
    order_id: str,
    stage: str,
    request: ApprovalRequestCreate,
    files: Optional[List[UploadFile]] = File(None)
):
    """Customer approves or requests changes for a stage"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Handle additional images if provided
    additional_images = []
    if files:
        for file in files:
            content = await file.read()
            image_base64 = base64.b64encode(content).decode('utf-8')
            additional_images.append(f"data:image/jpeg;base64,{image_base64}")
    
    approval = {
        "id": str(uuid.uuid4()),
        "status": request.status,
        "message": request.message,
        "images": additional_images,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Update order
    field = f"{stage}_approval"
    update_data = {field: approval, "updated_at": datetime.now(timezone.utc).isoformat()}
    
    # Move to next stage if approved
    if request.status == "approved":
        if stage == "clay":
            update_data["stage"] = "paint"
        elif stage == "paint":
            update_data["stage"] = "shipped"
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    # Send email notification
    subject = f"Order #{order['order_number']} - {stage.capitalize()} Stage {'Approved' if request.status == 'approved' else 'Changes Requested'}"
    
    if request.status == "approved":
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4CAF50;">✓ {stage.capitalize()} Stage Approved</h2>
            <p><strong>Order Number:</strong> {order['order_number']}</p>
            <p><strong>Customer:</strong> {order['customer_name']} ({order['customer_email']})</p>
            <p>The customer has approved the {stage} stage proofs.</p>
        </body>
        </html>
        """
    else:
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #FF9800;">⚠ Changes Requested</h2>
            <p><strong>Order Number:</strong> {order['order_number']}</p>
            <p><strong>Customer:</strong> {order['customer_name']} ({order['customer_email']})</p>
            <p><strong>Requested Changes:</strong></p>
            <p style="background: #f5f5f5; padding: 15px; border-left: 4px solid #FF9800;">{request.message or 'No message provided'}</p>
            {f'<p><strong>Additional Images Attached:</strong> {len(additional_images)}</p>' if additional_images else ''}
        </body>
        </html>
        """
    
    try:
        await send_email(SMTP_FROM_EMAIL, subject, html_content)
    except Exception as e:
        logger.warning(f"Email send failed: {e}")
    
    # Log to Google Sheets
    action = "Approved" if request.status == "approved" else "Changes Requested"
    details = f"{stage.capitalize()} - {request.message or 'No message'}" if request.status != "approved" else f"{stage.capitalize()}"
    await log_to_sheets(order['order_number'], action, details)
    
    return {"message": "Response recorded", "approval": approval}

# Google Sheets OAuth
@api_router.get("/oauth/sheets/login")
async def sheets_login():
    """Initialize Google Sheets OAuth"""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=400, detail="Google Sheets not configured")
    
    flow = Flow.from_client_config({
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token"
        }
    }, scopes=SCOPES, redirect_uri=SHEETS_REDIRECT_URI)
    
    url, state = flow.authorization_url(access_type='offline', prompt='consent')
    
    # Save state temporarily
    await db.oauth_states.insert_one({
        "state": state,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc).timestamp() + 600)
    })
    
    return RedirectResponse(url)

@api_router.get("/oauth/sheets/callback")
async def sheets_callback(code: str, state: str):
    """Handle Google Sheets OAuth callback"""
    # Verify state
    saved_state = await db.oauth_states.find_one({"state": state})
    if not saved_state:
        raise HTTPException(status_code=400, detail="Invalid state")
    
    flow = Flow.from_client_config({
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token"
        }
    }, scopes=SCOPES, redirect_uri=SHEETS_REDIRECT_URI)
    
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        flow.fetch_token(code=code)
    
    creds = flow.credentials
    
    # Verify scopes
    required_scopes = {"https://www.googleapis.com/auth/spreadsheets"}
    granted_scopes = set(creds.scopes or [])
    if not required_scopes.issubset(granted_scopes):
        missing = required_scopes - granted_scopes
        raise HTTPException(status_code=400, detail=f"Missing scopes: {', '.join(missing)}")
    
    # Save tokens
    token_doc = {
        "type": "admin",
        "access_token": creds.token,
        "refresh_token": creds.refresh_token,
        "expires_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.google_tokens.update_one(
        {"type": "admin"},
        {"$set": token_doc},
        upsert=True
    )
    
    # Clean up state
    await db.oauth_states.delete_one({"state": state})
    
    return RedirectResponse("/admin")

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()