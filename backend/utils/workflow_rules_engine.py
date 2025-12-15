"""
Data-Driven Workflow Engine - Uses workflow_rules as source of truth
"""
from typing import Dict, Optional, Any, List
from datetime import datetime, timezone

class WorkflowRulesEngine:
    """
    Manages order workflow based on configurable rules from workflow_rules table
    This is the new data-driven approach that replaces hardcoded stages/statuses
    """
    
    def __init__(self, workflow_rules: List[Dict], workflow_config: Dict):
        """
        Initialize with workflow rules and basic config
        
        Args:
            workflow_rules: List of workflow rule dictionaries from settings
            workflow_config: Basic workflow configuration (auto_advance, etc.)
        """
        self.rules = workflow_rules or []
        self.config = workflow_config or {}
        
        # Build indexes for fast lookup
        self._build_indexes()
    
    def _build_indexes(self):
        """Build lookup indexes from rules for better performance"""
        self.stages = set()
        self.statuses = set()
        self.transitions = {}  # (stage, status) -> (next_stage, next_status)
        
        for rule in self.rules:
            # Ensure rule is a dictionary
            if not isinstance(rule, dict):
                continue
                
            stage = rule.get('stage', '').lower() if rule.get('stage') else ''
            status = rule.get('status', '').lower().replace(' ', '_') if rule.get('status') else ''
            next_stage = rule.get('nextStage', '').lower() if rule.get('nextStage') else ''
            next_status = rule.get('nextStatus', '').lower().replace(' ', '_') if rule.get('nextStatus') else ''
            
            if stage:
                self.stages.add(stage)
            if status:
                self.statuses.add(status)
            
            # Map current state to next state
            if stage and status and next_stage and next_status:
                # Handle "Either X or Y" patterns in next_status
                if 'either' in next_status.lower():
                    # Parse the pattern - for now, just skip these
                    continue
                self.transitions[(stage, status)] = (next_stage, next_status)
    
    def get_available_stages(self) -> List[str]:
        """Get list of all available stages from rules"""
        return sorted(list(self.stages))
    
    def get_available_statuses(self, stage: str = None) -> List[str]:
        """
        Get list of available statuses, optionally filtered by stage
        
        Args:
            stage: Optional stage to filter statuses for
            
        Returns:
            List of status names
        """
        if stage:
            # Find statuses that are used with this stage
            stage_statuses = set()
            for rule in self.rules:
                if rule.get('stage', '').lower() == stage.lower():
                    status = rule.get('status', '').lower().replace(' ', '_')
                    if status:
                        stage_statuses.add(status)
            return sorted(list(stage_statuses))
        
        return sorted(list(self.statuses))
    
    def get_next_state(self, current_stage: str, current_status: str) -> Optional[tuple]:
        """
        Get the next stage and status based on current state
        
        Args:
            current_stage: Current stage name
            current_status: Current status name
            
        Returns:
            Tuple of (next_stage, next_status) or None if no transition found
        """
        key = (current_stage.lower(), current_status.lower())
        return self.transitions.get(key)
    
    def get_next_stage(self, current_stage: str) -> Optional[str]:
        """
        Get the next stage for auto-advancement (approval flow)
        
        Args:
            current_stage: Current stage name
            
        Returns:
            Next stage name or None
        """
        # Find approved status transition for this stage
        approved_key = (current_stage.lower(), 'approved')
        next_state = self.transitions.get(approved_key)
        
        if next_state and next_state[0] != current_stage.lower():
            return next_state[0]
        
        return None
    
    def should_auto_advance(self, current_stage: str, approval_status: str) -> bool:
        """
        Determine if order should auto-advance to next stage
        
        Args:
            current_stage: Current stage name
            approval_status: Approval status
            
        Returns:
            True if should auto-advance
        """
        # Only auto-advance on approval
        if approval_status != "approved":
            return False
        
        # Check global auto-advance setting
        if not self.config.get('auto_advance_on_approval', True):
            return False
        
        # Check if there's a next stage
        next_stage = self.get_next_stage(current_stage)
        if not next_stage:
            return False
        
        return True
    
    def get_status_after_upload(self, stage: str) -> str:
        """
        Get the status that should be set after admin uploads proofs
        
        Args:
            stage: The current stage
            
        Returns:
            Status to set (default: feedback_needed)
        """
        # Look for rules triggered by "Admin uploads" for this stage
        for rule in self.rules:
            if (rule.get('stage', '').lower() == stage.lower() and
                'upload' in rule.get('triggeredBy', '').lower() and
                'admin' in rule.get('triggeredBy', '').lower()):
                next_status = rule.get('nextStatus', '').lower().replace(' ', '_')
                if next_status and 'either' not in next_status:
                    return next_status
        
        # Fallback to config or default
        return self.config.get('status_after_upload', 'feedback_needed')
    
    def calculate_stage_transition(self, 
                                   current_stage: str, 
                                   approval_status: str,
                                   action: str = 'customer_response') -> Dict[str, Any]:
        """
        Calculate stage/status updates based on an action
        
        Args:
            current_stage: Current stage name
            approval_status: Approval status (approved, changes_requested)
            action: Action that triggered the transition
            
        Returns:
            Dictionary of updates to apply to the order
        """
        updates = {}
        
        if action == 'customer_response':
            # Mark current stage as approved or changes requested
            updates[f"{current_stage}_status"] = approval_status
            
            # Check if should auto-advance (but NOT from paint stage)
            if current_stage != "paint" and self.should_auto_advance(current_stage, approval_status):
                next_stage = self.get_next_stage(current_stage)
                if next_stage:
                    updates["stage"] = next_stage
                    # Find the initial status for next stage
                    next_status = self.get_initial_status_for_stage(next_stage)
                    if next_status:
                        updates[f"{next_stage}_status"] = next_status
        
        return updates
    
    def get_initial_status_for_stage(self, stage: str) -> str:
        """
        Get the initial status when entering a stage
        
        Args:
            stage: Stage name
            
        Returns:
            Initial status for the stage
        """
        # Look for rules where an order "enters" this stage
        for rule in self.rules:
            if rule.get('nextStage', '').lower() == stage.lower():
                next_status = rule.get('nextStatus', '').lower().replace(' ', '_')
                if next_status and 'either' not in next_status:
                    return next_status
        
        # Fallback to common statuses
        if stage.lower() == 'paint':
            return 'painting'
        return 'sculpting'
    
    def get_stage_label(self, stage: str) -> str:
        """Get display label for a stage"""
        # Try to find from config first
        stage_labels = self.config.get('stage_labels', {})
        if stage in stage_labels:
            return stage_labels[stage]
        
        # Fallback to title case
        return stage.title()
    
    def get_status_label(self, status: str) -> str:
        """Get display label for a status"""
        # Try to find from config first
        status_labels = self.config.get('status_labels', {})
        if status in status_labels:
            return status_labels[status]
        
        # Fallback to formatted name
        return status.replace('_', ' ').title()
    
    def validate_stage_transition(self, from_stage: str, to_stage: str) -> bool:
        """
        Validate if a stage transition is allowed
        
        Args:
            from_stage: Starting stage
            to_stage: Target stage
            
        Returns:
            True if transition is valid
        """
        # Check if there's any rule that allows this transition
        for rule in self.rules:
            if (rule.get('stage', '').lower() == from_stage.lower() and
                rule.get('nextStage', '').lower() == to_stage.lower()):
                return True
        
        # Allow same-stage transitions
        if from_stage.lower() == to_stage.lower():
            return True
        
        return False


def get_workflow_engine_from_tenant(tenant_settings: Dict) -> WorkflowRulesEngine:
    """
    Factory function to create workflow engine from tenant settings
    
    Args:
        tenant_settings: Tenant settings dictionary
        
    Returns:
        WorkflowRulesEngine instance
    """
    # Support both new workflow_config format and legacy workflow format
    workflow_config = tenant_settings.get('workflow_config') or tenant_settings.get('workflow', {})
    
    # New format uses 'rules' key, legacy uses 'workflow_rules'
    workflow_rules = workflow_config.get('rules') or workflow_config.get('workflow_rules', [])
    
    # Convert new format rules to engine format if needed
    converted_rules = []
    for rule in workflow_rules:
        # Ensure rule is a dictionary
        if not isinstance(rule, dict):
            continue
        # New format has fromStage/toStage, legacy has stage/nextStage
        converted_rule = {
            'stage': rule.get('fromStage') or rule.get('stage', ''),
            'status': rule.get('fromStatus') or rule.get('status', ''),
            'triggeredBy': rule.get('trigger') or rule.get('triggeredBy', ''),
            'nextStage': rule.get('toStage') or rule.get('nextStage', ''),
            'nextStatus': rule.get('toStatus') or rule.get('nextStatus', '')
        }
        converted_rules.append(converted_rule)
    
    # Build stage and status labels from new format if available
    stages_config = workflow_config.get('stages', [])
    if stages_config and isinstance(stages_config, list):
        stage_labels = {}
        status_labels = {}
        for stage in stages_config:
            # Ensure stage is a dictionary
            if isinstance(stage, dict):
                stage_id = stage.get('id', '')
                stage_name = stage.get('name', stage_id)
                if stage_id:
                    stage_labels[stage_id] = stage_name
                for status in stage.get('statuses', []):
                    # Ensure status is a dictionary
                    if isinstance(status, dict):
                        status_id = status.get('id', '')
                        status_name = status.get('name', status_id)
                        if status_id:
                            status_labels[status_id] = status_name
        workflow_config['stage_labels'] = stage_labels
        workflow_config['status_labels'] = status_labels
    
    return WorkflowRulesEngine(converted_rules, workflow_config)
