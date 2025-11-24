"""
Timeline utility functions for tracking order events
"""
from datetime import datetime, timezone
from typing import Dict, Any
import uuid

def create_timeline_event(
    event_type: str,
    user_name: str,
    user_role: str,
    description: str,
    metadata: Dict[str, Any] = None
) -> Dict[str, Any]:
    """
    Create a timeline event dict to be added to order timeline
    
    Args:
        event_type: Type of event (status_change, proof_upload, approval, etc.)
        user_name: Name of user who performed the action
        user_role: Role of user
        description: Human-readable description of the event
        metadata: Optional additional data about the event
        
    Returns:
        Timeline event dict
    """
    return {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": event_type,
        "user_name": user_name,
        "user_role": user_role,
        "description": description,
        "metadata": metadata or {}
    }

def get_event_description(event_type: str, metadata: Dict[str, Any]) -> str:
    """
    Generate human-readable description for an event
    
    Args:
        event_type: Type of event
        metadata: Event metadata
        
    Returns:
        Human-readable description
    """
    descriptions = {
        "order_created": "Order created",
        "status_change": f"Changed {metadata.get('stage', 'stage')} status from {metadata.get('old_status', 'N/A')} to {metadata.get('new_status', 'N/A')}",
        "stage_change": f"Moved order from {metadata.get('old_stage', 'N/A')} to {metadata.get('new_stage', 'N/A')} stage",
        "proof_upload": f"Uploaded {metadata.get('count', 1)} proof(s) for {metadata.get('stage', 'stage')} stage",
        "approval": f"Approved {metadata.get('stage', 'stage')} proofs",
        "changes_requested": f"Requested changes for {metadata.get('stage', 'stage')} stage",
        "note_added": "Added internal note",
        "ping": f"Sent reminder to customer for {metadata.get('stage', 'stage')} stage",
        "tracking_added": f"Added tracking number: {metadata.get('tracking_number', 'N/A')}",
        "tracking_updated": "Updated tracking information",
        "order_edited": f"Edited order details: {metadata.get('fields', 'multiple fields')}",
        "proof_deleted": f"Deleted proof from {metadata.get('stage', 'stage')} stage",
        "approval_edited": f"Edited customer change request for {metadata.get('stage', 'stage')} stage"
    }
    
    return descriptions.get(event_type, f"{event_type.replace('_', ' ').title()}")
