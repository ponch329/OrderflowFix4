import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const BrandingContext = createContext();

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
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
      root.style.setProperty('--color-primary', branding.primary_color);
      root.style.setProperty('--color-secondary', branding.secondary_color);
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
