import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const BrandingContext = createContext();

// Helper function to convert hex color to HSL format for Tailwind
const hexToHSL = (hex) => {
  // Remove # if present
  hex = hex.replace('#', '');
  
  // Convert hex to RGB
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
      default:
        h = 0;
    }
  }
  
  h = Math.round(h * 360);
  s = Math.round(s * 100);
  l = Math.round(l * 100);
  
  return `${h} ${s}% ${l}%`;
};

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

// Default workflow stages - used only as fallback when DB config unavailable
const DEFAULT_WORKFLOW_STAGES = [
  {
    id: 'clay',
    name: 'Clay',
    order: 1,
    statuses: [
      { id: 'sculpting', name: 'In Progress' },
      { id: 'feedback_needed', name: 'Feedback Needed' },
      { id: 'changes_requested', name: 'Changes Requested' },
      { id: 'approved', name: 'Approved' },
    ]
  },
  {
    id: 'paint',
    name: 'Paint',
    order: 2,
    statuses: [
      { id: 'painting', name: 'In Progress' },
      { id: 'feedback_needed', name: 'Feedback Needed' },
      { id: 'changes_requested', name: 'Changes Requested' },
      { id: 'approved', name: 'Approved' },
    ]
  },
  {
    id: 'shipped',
    name: 'Shipped',
    order: 3,
    statuses: [
      { id: 'in_transit', name: 'In Transit' },
      { id: 'delivered', name: 'Delivered' },
    ]
  },
  {
    id: 'archived',
    name: 'Archived',
    order: 4,
    statuses: [
      { id: 'completed', name: 'Completed' },
      { id: 'canceled', name: 'Canceled' },
    ]
  }
];

export const BrandingProvider = ({ children }) => {
  const [branding, setBranding] = useState({
    logo_url: '',
    primary_color: '#2196F3',
    secondary_color: '#9C27B0',
    font_family: 'Arial, sans-serif',
    font_size_base: '16px',
    company_name: ''
  });
  
  // Full workflow configuration from database - single source of truth
  const [workflowConfig, setWorkflowConfig] = useState({
    stages: DEFAULT_WORKFLOW_STAGES,
    rules: [],
    timers: [],
    // Legacy label arrays for backward compatibility
    stage_labels: [],
    status_labels: []
  });
  
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBrandingSettings();
  }, []);

  const fetchBrandingSettings = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      if (!token) {
        setLoading(false);
        return;
      }

      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      const response = await axios.get(`${API}/settings/tenant`);
      const settings = response.data.settings || {};
      
      setBranding({
        logo_url: settings.logo_url || '',
        primary_color: settings.primary_color || '#2196F3',
        secondary_color: settings.secondary_color || '#9C27B0',
        font_family: settings.font_family || 'Arial, sans-serif',
        font_size_base: settings.font_size_base || '16px',
        company_name: response.data.name || ''
      });
      
      // Load complete workflow_config from DB - this is the single source of truth
      const dbWorkflowConfig = settings.workflow_config || {};
      const stages = dbWorkflowConfig.stages || DEFAULT_WORKFLOW_STAGES;
      
      // Build legacy label arrays from stages for backward compatibility
      const stageLabels = stages.map(s => s.name);
      const allStatuses = stages.flatMap(s => s.statuses || []);
      const uniqueStatusIds = [...new Set(allStatuses.map(st => st.id))];
      const statusLabels = uniqueStatusIds.map(id => {
        const status = allStatuses.find(st => st.id === id);
        return status?.name || id;
      });
      
      setWorkflowConfig({
        stages: stages,
        rules: dbWorkflowConfig.rules || [],
        timers: dbWorkflowConfig.timers || [],
        // Legacy support
        stage_labels: stageLabels,
        status_labels: statusLabels
      });
    } catch (error) {
      console.error('Failed to fetch branding settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // Apply CSS custom properties for branding
  useEffect(() => {
    if (!loading) {
      const root = document.documentElement;
      // Set custom color variables (for backward compatibility)
      root.style.setProperty('--color-primary', branding.primary_color);
      root.style.setProperty('--color-secondary', branding.secondary_color);
      
      // Convert hex to HSL and set Tailwind/Shadcn variables
      const primaryHSL = hexToHSL(branding.primary_color);
      const secondaryHSL = hexToHSL(branding.secondary_color);
      root.style.setProperty('--primary', primaryHSL);
      root.style.setProperty('--secondary', secondaryHSL);
      
      // Set font variables
      root.style.setProperty('--font-family-base', branding.font_family);
      root.style.setProperty('--font-size-base', branding.font_size_base);
    }
  }, [branding, loading]);

  return (
    <BrandingContext.Provider value={{ branding, workflowConfig, loading, refreshBranding: fetchBrandingSettings }}>
      {children}
    </BrandingContext.Provider>
  );
};

export const useBranding = () => {
  const context = useContext(BrandingContext);
  if (!context) {
    throw new Error('useBranding must be used within a BrandingProvider');
  }
  return context;
};

export default BrandingContext;
