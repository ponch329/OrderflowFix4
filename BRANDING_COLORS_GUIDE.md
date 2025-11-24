# Branding Colors Display Guide

## Where Branding Colors Are Currently Applied

Branding colors are dynamically applied throughout the application via the `BrandingContext` which converts your hex colors to both formats:
- `--color-primary` and `--color-secondary` (hex format for backward compatibility)
- `--primary` and `--secondary` (HSL format for Shadcn UI/Tailwind components)

### Current Implementation

**1. Shadcn UI Components (Most Visible)**
All Shadcn UI components automatically use the branding colors:
- **Buttons**: Default variant buttons (like "Upload Proofs", "Create Order", "Save", etc.)
- **Primary Actions**: Any button without a specific variant
- **Links**: Link-styled buttons

**2. Admin Portal**
- **Dashboard Analytics**: Background gradients use primary color scheme
- **Order Cards**: Hover effects and interactive elements
- **Action Buttons**: 
  - "Upload Proofs" buttons (blue with primary color)
  - "Create Order" button (green but can be customized)
  - "Save Changes" buttons
  - "Edit" buttons

**3. Customer Portal**
- **Login Button**: "View My Order" button uses primary color
- **Action Buttons**: Submit, Approve, Request Changes buttons
- **Links and Interactive Elements**

### How to See Branding Colors in Action

1. **Go to Admin Settings** (`/admin/settings`)
   - Click on the "Branding" tab
   - Change the "Primary Color" (default: #2196F3 - blue)
   - Click "Save Branding Settings"

2. **View Changes Immediately**
   - Navigate to the Dashboard
   - Look at the **"Create Order"** button (it will reflect your primary color if you set it)
   - Look at **all default buttons** throughout the app
   - The **"Upload Proofs"** buttons in order details will use the primary color

3. **Example Locations to Check:**
   - Admin Dashboard: "Create Order" button, Analytics cards background
   - Order Details Page: "Upload Proofs", "Save Changes", "Edit Info" buttons
   - Customer Portal: "View My Order" button

### Customizing Branding

**Admin Settings → Branding Tab:**
- **Primary Color**: Main action buttons, links, highlights
- **Secondary Color**: Secondary actions, accents
- **Font Family**: Text throughout the app
- **Logo URL**: Company logo in header

**Technical Note:**
The branding system uses CSS custom properties that are automatically applied to all Shadcn components. The `hexToHSL()` converter in `BrandingContext.js` ensures compatibility with Tailwind's HSL-based color system.

### Future Enhancement Opportunities

To make branding more visible, you could:
1. Apply branding to the Order Status badges colors
2. Use primary color for the header gradient
3. Apply to the Analytics dashboard cards more prominently
4. Add branding to the customer portal header/logo area

The infrastructure is in place - any component using `bg-primary`, `text-primary`, or Shadcn button defaults will automatically respect your branding colors.
