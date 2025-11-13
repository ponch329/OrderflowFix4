"""
Email Templates for Bobblehead Order Approval System

Customize these templates to match your brand and communication style.
"""

def get_approval_email(order_number, customer_name, customer_email, stage):
    """
    Template for when customer approves a stage
    
    Args:
        order_number: The order number (e.g., "203860")
        customer_name: Customer's full name
        customer_email: Customer's email address
        stage: Stage name ("clay" or "paint")
    """
    subject = f"Order #{order_number} - {stage.capitalize()} Stage Approved"
    
    html_content = f"""
    <html>
    <head>
        <style>
            body {{
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
            }}
            .container {{
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
            }}
            .header {{
                background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
                color: white;
                padding: 30px 20px;
                text-align: center;
                border-radius: 8px 8px 0 0;
            }}
            .header h1 {{
                margin: 0;
                font-size: 28px;
            }}
            .content {{
                background: #ffffff;
                padding: 30px 20px;
                border: 1px solid #e0e0e0;
                border-top: none;
            }}
            .info-row {{
                margin: 15px 0;
                padding: 10px;
                background: #f9f9f9;
                border-radius: 4px;
            }}
            .label {{
                font-weight: bold;
                color: #555;
            }}
            .footer {{
                text-align: center;
                padding: 20px;
                color: #888;
                font-size: 12px;
                border-radius: 0 0 8px 8px;
                background: #f5f5f5;
            }}
            .checkmark {{
                font-size: 48px;
                color: #4CAF50;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="checkmark">✓</div>
                <h1>{stage.capitalize()} Stage Approved</h1>
            </div>
            
            <div class="content">
                <p>Great news! Your customer has approved the {stage} stage proofs.</p>
                
                <div class="info-row">
                    <span class="label">Order Number:</span> #{order_number}
                </div>
                
                <div class="info-row">
                    <span class="label">Customer:</span> {customer_name}
                </div>
                
                <div class="info-row">
                    <span class="label">Email:</span> {customer_email}
                </div>
                
                <div class="info-row">
                    <span class="label">Status:</span> Approved - Ready to proceed to next stage
                </div>
                
                <p style="margin-top: 20px; padding: 15px; background: #e8f5e9; border-left: 4px solid #4CAF50; border-radius: 4px;">
                    <strong>Next Steps:</strong><br>
                    {"Move forward with painting stage." if stage == "clay" else "Ready to ship!"}
                </p>
            </div>
            
            <div class="footer">
                <p>This is an automated notification from your Bobblehead Order Approval System</p>
                <p>AllBobbleheads.com | orders@allbobbleheads.com</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return subject, html_content


def get_changes_requested_email(order_number, customer_name, customer_email, stage, message, num_images=0):
    """
    Template for when customer requests changes
    
    Args:
        order_number: The order number
        customer_name: Customer's full name
        customer_email: Customer's email address
        stage: Stage name ("clay" or "paint")
        message: Customer's change request message
        num_images: Number of reference images attached
    """
    subject = f"Order #{order_number} - {stage.capitalize()} Stage Changes Requested"
    
    html_content = f"""
    <html>
    <head>
        <style>
            body {{
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
            }}
            .container {{
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
            }}
            .header {{
                background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%);
                color: white;
                padding: 30px 20px;
                text-align: center;
                border-radius: 8px 8px 0 0;
            }}
            .header h1 {{
                margin: 0;
                font-size: 28px;
            }}
            .content {{
                background: #ffffff;
                padding: 30px 20px;
                border: 1px solid #e0e0e0;
                border-top: none;
            }}
            .info-row {{
                margin: 15px 0;
                padding: 10px;
                background: #f9f9f9;
                border-radius: 4px;
            }}
            .label {{
                font-weight: bold;
                color: #555;
            }}
            .message-box {{
                background: #fff3e0;
                padding: 20px;
                border-left: 4px solid #FF9800;
                border-radius: 4px;
                margin: 20px 0;
            }}
            .footer {{
                text-align: center;
                padding: 20px;
                color: #888;
                font-size: 12px;
                border-radius: 0 0 8px 8px;
                background: #f5f5f5;
            }}
            .warning-icon {{
                font-size: 48px;
                color: #FF9800;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="warning-icon">⚠</div>
                <h1>Changes Requested</h1>
            </div>
            
            <div class="content">
                <p>Your customer has reviewed the {stage} stage proofs and is requesting some changes.</p>
                
                <div class="info-row">
                    <span class="label">Order Number:</span> #{order_number}
                </div>
                
                <div class="info-row">
                    <span class="label">Customer:</span> {customer_name}
                </div>
                
                <div class="info-row">
                    <span class="label">Email:</span> {customer_email}
                </div>
                
                <div class="info-row">
                    <span class="label">Stage:</span> {stage.capitalize()}
                </div>
                
                <div class="message-box">
                    <strong style="color: #F57C00;">Requested Changes:</strong><br><br>
                    {message or '<em>No specific message provided</em>'}
                </div>
                
                {f'<div class="info-row" style="background: #e3f2fd; border-left: 3px solid #2196F3;"><span class="label">📎 Reference Images:</span> {num_images} image(s) attached by customer</div>' if num_images > 0 else ''}
                
                <p style="margin-top: 20px; padding: 15px; background: #fff3e0; border-left: 4px solid #FF9800; border-radius: 4px;">
                    <strong>Action Required:</strong><br>
                    Please review the customer's feedback and make the necessary adjustments to the {stage} stage.
                </p>
            </div>
            
            <div class="footer">
                <p>This is an automated notification from your Bobblehead Order Approval System</p>
                <p>AllBobbleheads.com | orders@allbobbleheads.com</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return subject, html_content


def get_proofs_uploaded_notification(order_number, stage, num_images):
    """
    Template for internal notification when proofs are uploaded (optional)
    
    Args:
        order_number: The order number
        stage: Stage name ("clay" or "paint")
        num_images: Number of images uploaded
    """
    subject = f"Proofs Uploaded - Order #{order_number}"
    
    html_content = f"""
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h3 style="color: #2196F3;">📸 Proofs Uploaded</h3>
        <p><strong>Order:</strong> #{order_number}</p>
        <p><strong>Stage:</strong> {stage.capitalize()}</p>
        <p><strong>Images:</strong> {num_images} proof image(s)</p>
        <p style="color: #666;">Proofs are now ready for customer review.</p>
    </body>
    </html>
    """
    
    return subject, html_content
