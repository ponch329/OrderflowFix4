"""
Workflow Engine - Handles order stage and status transitions based on tenant configuration
"""
from typing import Dict, Optional, Any
from models.tenant import WorkflowConfig

class WorkflowEngine:
    """
    Manages order workflow transitions based on configurable rules
    """
    
    def __init__(self, workflow_config: WorkflowConfig):
        self.config = workflow_config
    
    def get_status_after_upload(self, stage: str) -> str:
        """
        Get the status that should be set after admin uploads proofs
        
        Args:
            stage: The current stage (clay, paint, etc.)
            
        Returns:
            Status to set (default: feedback_needed)
        """
        return self.config.status_after_upload
    
    def get_next_stage(self, current_stage: str) -> Optional[str]:
        """
        Get the next stage in the workflow
        
        Args:
            current_stage: Current stage name
            
        Returns:
            Next stage name or None if no next stage
        """
        return self.config.stage_transitions.get(current_stage)
    
    def should_auto_advance(self, current_stage: str, approval_status: str) -> bool:
        """
        Determine if order should auto-advance to next stage
        
        Args:
            current_stage: Current stage name
            approval_status: Approval status (approved, changes_requested)
            
        Returns:
            True if should auto-advance, False otherwise
        """
        # Only auto-advance on approval, not on changes_requested
        if approval_status != "approved":
            return False
        
        # Check if auto-advance is enabled globally
        if not self.config.auto_advance_on_approval:
            return False
        
        # Check if there's a next stage
        next_stage = self.get_next_stage(current_stage)
        if not next_stage:
            return False
        
        return True
    
    def requires_customer_approval(self, stage: str) -> bool:
        """
        Check if a stage requires customer approval
        
        Args:
            stage: Stage name
            
        Returns:
            True if customer approval is required
        """
        return self.config.stage_requires_customer_approval.get(stage, True)
    
    def get_stage_label(self, stage: str) -> str:
        """
        Get display label for a stage
        
        Args:
            stage: Stage name
            
        Returns:
            Display label
        """
        return self.config.stage_labels.get(stage, stage.title())
    
    def get_status_label(self, status: str) -> str:
        """
        Get display label for a status
        
        Args:
            status: Status name
            
        Returns:
            Display label
        """
        return self.config.status_labels.get(status, status.replace("_", " ").title())
    
    def calculate_stage_transition(
        self, 
        current_stage: str, 
        approval_status: str
    ) -> Dict[str, Any]:
        """
        Calculate what updates should be made to order based on approval
        
        Args:
            current_stage: Current order stage
            approval_status: Customer approval status (approved/changes_requested)
            
        Returns:
            Dict with stage and status updates to apply
        """
        updates = {}
        
        if approval_status == "approved":
            # Customer approved
            updates[f"{current_stage}_status"] = "approved"
            
            # Check if should auto-advance
            if self.should_auto_advance(current_stage, approval_status):
                next_stage = self.get_next_stage(current_stage)
                if next_stage:
                    updates["stage"] = next_stage
                    # Set next stage status based on whether it's shipped or needs work
                    if next_stage == "shipped":
                        # Don't set status for shipped stage
                        pass
                    else:
                        updates[f"{next_stage}_status"] = "sculpting"
        
        elif approval_status == "changes_requested":
            # Customer requested changes
            updates[f"{current_stage}_status"] = "changes_requested"
            # Stage remains the same
        
        return updates
    
    def validate_stage_transition(self, from_stage: str, to_stage: str) -> bool:
        """
        Validate if a stage transition is allowed
        
        Args:
            from_stage: Current stage
            to_stage: Target stage
            
        Returns:
            True if transition is valid
        """
        expected_next = self.get_next_stage(from_stage)
        
        # Allow transition if it's the configured next stage
        if to_stage == expected_next:
            return True
        
        # Allow moving backwards (for corrections)
        if to_stage in self.config.stages:
            from_idx = self.config.stages.index(from_stage) if from_stage in self.config.stages else -1
            to_idx = self.config.stages.index(to_stage)
            if to_idx < from_idx:
                return True
        
        return False
    
    def get_available_statuses(self, stage: str) -> list[str]:
        """
        Get list of available statuses for a stage
        
        Args:
            stage: Stage name
            
        Returns:
            List of status names
        """
        # For now, all stages have same statuses
        return ["sculpting", "feedback_needed", "changes_requested", "approved", "pending"]


def get_workflow_engine(tenant_settings: Dict[str, Any]) -> WorkflowEngine:
    """
    Factory function to create WorkflowEngine from tenant settings
    
    Args:
        tenant_settings: Tenant settings dict
        
    Returns:
        Configured WorkflowEngine instance
    """
    workflow_config_data = tenant_settings.get("workflow", {})
    
    # Create WorkflowConfig with defaults if not present
    workflow_config = WorkflowConfig(**workflow_config_data) if workflow_config_data else WorkflowConfig()
    
    return WorkflowEngine(workflow_config)
