# Script to update remaining log_to_sheets calls
# These need to be manually updated in server.py:

# Line ~503: Proofs uploaded
await log_to_sheets(
    order['order_number'], 
    f"Proofs Uploaded - {stage}", 
    f"{len(uploaded_proofs)} images - Status: Feedback Needed",
    stage=order.get('stage', ''),
    status=order.get(f"{stage}_status", '')
)

# Line ~616: Customer response (approve/changes)
await log_to_sheets(
    order['order_number'], 
    action, 
    details,
    stage=order.get('stage', ''),
    status=order.get(f"{stage}_status", '')
)

# Line ~672: Customer pinged
await log_to_sheets(
    order['order_number'], 
    "Customer Pinged", 
    f"{stage.capitalize()} - Reminder sent",
    stage=order.get('stage', ''),
    status=order.get(f"{stage}_status", '')
)
