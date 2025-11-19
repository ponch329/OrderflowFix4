# Branding & Custom Labels Implementation Guide

## Question 1: What Does Branding Settings Affect?

### Current Status: ⚠️ PARTIALLY IMPLEMENTED

**What's Working:**
- ✅ **Logo URL** - Currently used in email templates (appears in email headers)
- ✅ All settings are saved to database
- ✅ Settings UI is fully functional

**What's NOT Yet Implemented:**
The following branding settings are stored but not yet applied to the frontend:

1. **Primary Color** (`#2196F3` default)
2. **Secondary Color** (`#9C27B0` default)
3. **Font Family** (Arial default)
4. **Font Size Base** (16px default)

### Where These SHOULD Be Applied:

#### Logo URL ✅ (Already Working)
- Email templates (header logo)
- Could also appear on:
  - Customer order portal (top right corner)
  - Admin dashboard (top left corner)
  - Login page

#### Primary Color (Not Yet Applied)
**Should affect:**
- Main navigation background
- Primary buttons (Create Order, Sync, Upload buttons)
- Active tab indicators
- Links and hover states
- Header gradients (currently blue)
- Stage badges background
- Progress indicators

**Example locations:**
- Admin Dashboard header gradient
- Button colors (`bg-blue-600` should become `bg-[primary_color]`)
- Badge colors for stages
- Navigation highlights

#### Secondary Color (Not Yet Applied)
**Should affect:**
- Secondary buttons (Settings, Users buttons)
- Accent elements
- Secondary navigation items
- Hover states
- Border highlights

**Example locations:**
- Outline button colors
- Secondary badges
- Filter highlights
- Card borders on hover

#### Font Family (Not Yet Applied)
**Should affect:**
- All text throughout the application
- Titles, headings, body text
- Form inputs
- Buttons

**Current:** Hardcoded to system defaults (Inter, Tailwind defaults)
**Should be:** Applied globally via CSS custom property

#### Font Size Base (Not Yet Applied)
**Should affect:**
- Base text size (currently 16px)
- Scales up for headings (1.25x, 1.5x, 2x)
- Scales down for small text (0.875x, 0.75x)

---

## Question 2: Where Will Stage/Status Labels Be Implemented?

### Current Status: ⚠️ UI CREATED, USAGE NOT IMPLEMENTED

**What Exists:**
- ✅ Settings UI with 8 stage labels (Stage 1-8)
- ✅ Settings UI with 8 status labels (Status 1-8)
- ✅ Data saved to database in workflow configuration
- ✅ Workflow engine created

**What's NOT Yet Implemented:**
The custom labels are not yet being used anywhere in the application!

### Where They SHOULD Be Used:

#### Stage Labels (Stage 1-8)

**Currently Hardcoded As:**
```javascript
// In code:
order.stage === "clay"    // Displays as "Clay" or "CLAY"
order.stage === "paint"   // Displays as "Paint" or "PAINT"
order.stage === "shipped" // Displays as "Shipped"
```

**Should Display As Custom Labels:**
```javascript
// If user sets:
// Stage 1 Label = "Sculpting Phase"
// Stage 2 Label = "Painting Phase"
// Stage 3 Label = "Quality Control"
// Stage 4 Label = "Packaging"
// Stage 5 Label = "Shipped"

// Then displays should show:
"Sculpting Phase" instead of "Clay"
"Painting Phase" instead of "Paint"
"Quality Control", "Packaging", "Shipped" as additional stages
```

**Locations to Display:**
1. **Admin Dashboard**
   - Order cards: "Clay Stage" → "Sculpting Phase"
   - Stage filter dropdown: "Clay" → "Sculpting Phase"
   - Status badges on cards

2. **Customer Order Portal**
   - Order header: "CLAY" badge → "SCULPTING PHASE" badge
   - Section headers: "Clay Stage" → "Sculpting Phase"

3. **Admin Order Details**
   - Stage dropdown options
   - Section headers
   - Timeline events

4. **Email Templates**
   - Subject lines: "Clay Proofs Ready" → "Sculpting Phase Proofs Ready"
   - Body text: "clay stage" → "sculpting phase"

5. **Filters and Navigation**
   - Stage filter: "All Stages" dropdown with custom labels
   - Breadcrumbs
   - Analytics dashboard

#### Status Labels (Status 1-8)

**Currently Hardcoded As:**
```javascript
// In code:
clay_status: "sculpting"          // Displays as "In Progress"
clay_status: "feedback_needed"    // Displays as "Customer Feedback Needed"
clay_status: "changes_requested"  // Displays as "Changes Requested"
clay_status: "approved"          // Displays as "Approved"
clay_status: "pending"           // Displays as "Not Started"
```

**Should Display As Custom Labels:**
```javascript
// If user sets:
// Status 1 Label = "Waiting to Start"
// Status 2 Label = "Work in Progress"
// Status 3 Label = "Needs Review"
// Status 4 Label = "Revisions Required"
// Status 5 Label = "Customer Approved"

// Then displays should show:
"Work in Progress" instead of "In Progress"
"Needs Review" instead of "Customer Feedback Needed"
"Revisions Required" instead of "Changes Requested"
```

**Locations to Display:**
1. **Admin Dashboard**
   - Status dropdowns in order cards
   - Status badges
   - Status filter dropdown

2. **Customer Order Portal**
   - Status badges in order header
   - Section status indicators

3. **Email Templates**
   - Status descriptions in emails
   - Notification text

4. **Notifications**
   - Toast messages: "Status changed to approved" → "Status changed to Customer Approved"

---

## How to Implement Custom Labels

### Step 1: Create Label Mapping Utility

```javascript
// utils/labelMapper.js
export const getStageLabel = (internalStage, workflowConfig) => {
  const stageIndex = {
    'clay': 0,
    'paint': 1,
    'shipped': 2
  }[internalStage];
  
  return workflowConfig?.stage_labels?.[stageIndex] || internalStage;
};

export const getStatusLabel = (internalStatus, workflowConfig) => {
  const statusIndex = {
    'pending': 0,
    'sculpting': 1,
    'feedback_needed': 2,
    'changes_requested': 3,
    'approved': 4
  }[internalStatus];
  
  return workflowConfig?.status_labels?.[statusIndex] || internalStatus;
};
```

### Step 2: Fetch Workflow Config on App Load

```javascript
// In main App.js or context provider
const [workflowConfig, setWorkflowConfig] = useState(null);

useEffect(() => {
  fetchWorkflowConfig();
}, []);

const fetchWorkflowConfig = async () => {
  const response = await axios.get('/api/settings/tenant');
  setWorkflowConfig(response.data.settings.workflow);
};
```

### Step 3: Use Labels Throughout App

```javascript
// Instead of:
<h3>Clay Stage</h3>

// Use:
<h3>{getStageLabel('clay', workflowConfig)} Stage</h3>

// Instead of:
<Badge>Feedback Needed</Badge>

// Use:
<Badge>{getStatusLabel('feedback_needed', workflowConfig)}</Badge>
```

---

## Implementation Priority

### Phase 1: Custom Labels (High Impact, Medium Effort)
1. ✅ Create label mapping utility
2. ✅ Fetch workflow config globally
3. ✅ Replace hardcoded stage names with custom labels
4. ✅ Replace hardcoded status names with custom labels
5. ✅ Update email templates to use custom labels

**Time: 4-6 hours**
**Impact: Enables full workflow customization**

### Phase 2: Branding Colors (High Impact, Low Effort)
1. ✅ Create CSS custom properties for colors
2. ✅ Replace hardcoded colors with custom properties
3. ✅ Apply primary/secondary colors to buttons, badges, headers
4. ✅ Add logo to customer portal and admin header

**Time: 2-3 hours**
**Impact: Makes app look branded and professional**

### Phase 3: Typography (Medium Impact, Low Effort)
1. ✅ Apply font family globally
2. ✅ Scale font sizes based on base size
3. ✅ Update all text elements to respect settings

**Time: 1-2 hours**
**Impact: Complete branding control**

---

## Current State Summary

### ✅ What's Working:
- Settings UI for branding and labels
- Data persistence in database
- Logo in email templates
- Workflow engine backend logic

### ⚠️ What's Missing:
- **Branding colors not applied to UI** (stored but not used)
- **Fonts not applied to UI** (stored but not used)
- **Stage labels not displayed** (stored but hardcoded names shown)
- **Status labels not displayed** (stored but hardcoded names shown)
- No global branding context/provider

### 🎯 Recommendation:
Implement **Phase 1 (Custom Labels)** first, as it provides the most value to users who want to customize their workflow terminology. Then add **Phase 2 (Branding Colors)** for visual customization.

Would you like me to implement these missing pieces?
