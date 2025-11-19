# Order Status & Stage Workflow Logic

## Current Implementation

### 1. Status Types
Each stage (clay, paint) has a status field:
- `sculpting` - Admin is working on the proofs
- `feedback_needed` - Proofs uploaded, waiting for customer response
- `changes_requested` - Customer requested changes
- `approved` - Customer approved the proofs

### 2. Stage Flow
Orders progress through stages:
1. `clay` - Initial sculpting/clay stage
2. `paint` - Painting stage
3. `shipped` - Final stage (order complete)

---

## Current Workflow Rules

### When Admin Uploads Proofs
**Location:** `/app/backend/routes/orders.py` lines 198-273

```python
# RULE 1: Admin uploads proofs → Status becomes "feedback_needed"
@router.post("/{order_id}/upload")
async def upload_proofs():
    # ... upload logic ...
    
    update_data = {
        f"{stage}_status": "feedback_needed",  # HARDCODED
        # ... other fields ...
    }
```

**Action:** 
- Status automatically changes to `feedback_needed`
- Customer is emailed notification
- Round number auto-increments if there are existing proofs

---

### When Customer Approves
**Location:** `/app/backend/server.py` lines 625-710

```python
# RULE 2: Customer approves → Auto-advance to next stage
@api_router.post("/customer/orders/{order_id}/approve")
async def approve_stage():
    if status == "approved":
        if stage == "clay":
            update_data["stage"] = "paint"              # HARDCODED
            update_data["paint_status"] = "sculpting"   # HARDCODED
        elif stage == "paint":
            update_data["stage"] = "shipped"            # HARDCODED
```

**Actions:**
- Clay approved → Moves to Paint stage, paint status = "sculpting"
- Paint approved → Moves to Shipped stage
- Admin is emailed notification

---

### When Customer Requests Changes
**Location:** `/app/backend/server.py` lines 625-710

```python
# RULE 3: Customer requests changes → Status changes, stays in same stage
if status == "changes_requested":
    update_data[f"{stage}_status"] = "changes_requested"  # HARDCODED
    # Stage remains the same (clay or paint)
```

**Actions:**
- Status changes to `changes_requested`
- Stage remains the same (no auto-advance)
- Admin is emailed notification with customer's feedback

---

## Limitations of Current System

### ❌ Not Configurable
1. **Hardcoded Stage Transitions:** Clay always goes to Paint, Paint always goes to Shipped
2. **Fixed Status Names:** Can't customize status labels
3. **Automatic Advancement:** No option to require manual admin approval before stage change
4. **No Custom Stages:** Can't add intermediate stages (e.g., "quality_check", "packaging")
5. **No Conditional Logic:** Can't set rules like "require 2 approvals" or "skip paint if order type = X"

### ❌ Not Flexible for Different Business Processes
- Some businesses might want: Clay → QA → Paint → Packaging → Shipped
- Some might want: Approval doesn't auto-advance (admin manually moves to next stage)
- Some might want: Different workflows per product type

---

## Proposed Solution: Configurable Workflow Settings

### New TenantSettings Fields

```python
class WorkflowConfig(BaseModel):
    """Configurable workflow settings"""
    
    # Stage Configuration
    stages: List[str] = ["clay", "paint", "shipped"]
    stage_labels: Dict[str, str] = {
        "clay": "Clay Stage",
        "paint": "Paint Stage", 
        "shipped": "Shipped"
    }
    
    # Status Configuration per Stage
    stage_statuses: Dict[str, List[str]] = {
        "clay": ["sculpting", "feedback_needed", "changes_requested", "approved"],
        "paint": ["sculpting", "feedback_needed", "changes_requested", "approved"]
    }
    
    status_labels: Dict[str, str] = {
        "sculpting": "In Progress",
        "feedback_needed": "Customer Feedback Needed",
        "changes_requested": "Changes Requested",
        "approved": "Approved"
    }
    
    # Auto-Advance Rules
    auto_advance_on_approval: bool = True
    require_admin_confirmation_for_stage_change: bool = False
    
    # Upload Behavior
    status_after_upload: str = "feedback_needed"
    
    # Stage Transition Rules
    stage_transitions: Dict[str, str] = {
        "clay": "paint",
        "paint": "shipped"
    }
    
    # Custom Stage Configurations
    stage_requires_customer_approval: Dict[str, bool] = {
        "clay": True,
        "paint": True
    }
    
    # Email Notifications
    notify_customer_on_upload: bool = True
    notify_admin_on_customer_response: bool = True
```

### Benefits of This Approach

✅ **Flexibility:**
- Businesses can define their own stages
- Customize status labels to match their terminology
- Enable/disable auto-advancement

✅ **Control:**
- Toggle whether uploads auto-set status to "feedback_needed"
- Control whether customer approval auto-advances stages
- Require admin confirmation before stage changes

✅ **Scalability:**
- Add new stages without code changes
- Configure different workflows per tenant
- Support complex business processes

✅ **User-Friendly:**
- Settings UI allows non-technical users to configure workflow
- Visual workflow builder (future enhancement)
- Test workflow before applying

---

## Implementation Plan

### Phase 1: Backend Workflow Engine
1. Add `WorkflowConfig` to `TenantSettings` model
2. Create workflow service to handle stage/status transitions
3. Update upload and approval endpoints to use workflow config
4. Add validation to ensure workflow rules are followed

### Phase 2: Settings UI
1. Add "Workflow" tab to Admin Settings page
2. Stage configuration (add/remove/reorder stages)
3. Status configuration (customize labels and colors)
4. Auto-advance toggles
5. Preview/test workflow before saving

### Phase 3: Advanced Features (Future)
1. Conditional logic (if order type = X, skip stage Y)
2. Multi-approval requirements
3. Time-based auto-transitions (auto-ship after 7 days)
4. Custom email templates per stage/status
5. Visual workflow diagram builder

---

## Example: Custom Workflow

### Scenario: High-End Custom Bobblehead Shop
**Process:** Clay → Quality Check → Paint → Final Review → Packaging → Shipped

**Configuration:**
```json
{
  "stages": ["clay", "quality_check", "paint", "final_review", "packaging", "shipped"],
  "stage_labels": {
    "clay": "Sculpting",
    "quality_check": "QA Review",
    "paint": "Painting",
    "final_review": "Final Approval",
    "packaging": "Packaging",
    "shipped": "Shipped"
  },
  "auto_advance_on_approval": false,
  "require_admin_confirmation_for_stage_change": true,
  "stage_requires_customer_approval": {
    "clay": true,
    "quality_check": false,
    "paint": true,
    "final_review": true,
    "packaging": false
  }
}
```

**Result:**
- Customer approves clay → Admin manually moves to Quality Check
- QA passes → Admin moves to Paint
- Customer approves paint → Admin moves to Final Review
- Final Review approved → Admin moves to Packaging
- Packaging complete → Admin ships

---

## Recommendation

**Start with Phase 1 (Backend) + Basic Settings UI**

This gives you:
1. ✅ Configurable auto-advance behavior
2. ✅ Custom status labels
3. ✅ Toggle for requiring admin confirmation
4. ✅ Foundation for future advanced features

**Implementation Time:** ~2-3 days
- 1 day: Backend workflow engine
- 1 day: Settings UI (basic toggles)
- 0.5 day: Testing
- 0.5 day: Documentation

Would you like me to implement this configurable workflow system?
