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

export const BrandingProvider = ({ children }) => {
  const [branding, setBranding] = useState({
    logo_url: '',
    primary_color: '#2196F3',
    secondary_color: '#9C27B0',
    font_family: 'Arial, sans-serif',
    font_size_base: '16px',
    company_name: ''
  });
  
  const [workflowConfig, setWorkflowConfig] = useState({
    stage_labels: [
      'Clay Stage',
      'Paint Stage',
      'Shipped',
      '',
      '',
      '',
      '',
      ''
    ],
    status_labels: [
      'Pending',
      'In Progress',
      'Customer Feedback Needed',
      'Changes Requested',
      'Approved',
      '',
      '',
      ''
    ]
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
      const settings = response.data.settings;
      
      if (settings) {
        setBranding({
          logo_url: settings.logo_url || '',
          primary_color: settings.primary_color || '#2196F3',
          secondary_color: settings.secondary_color || '#9C27B0',
          font_family: settings.font_family || 'Arial, sans-serif',
          font_size_base: settings.font_size_base || '16px',
          company_name: response.data.name || ''
        });
        
        if (settings.workflow) {
          setWorkflowConfig({
            stage_labels: settings.workflow.stage_labels || workflowConfig.stage_labels,
            status_labels: settings.workflow.status_labels || workflowConfig.status_labels
          });
        }
      }
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
