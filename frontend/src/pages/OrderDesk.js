import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  FolderOpen, 
  ChevronDown, 
  ChevronRight, 
  Printer, 
  Info, 
  Download, 
  Settings2,
  GripVertical,
  Search,
  User as UserIcon,
  Settings,
  Bell,
  RefreshCw,
  Archive,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { TrackingLink } from "@/components/TrackingWidget";
import { useBranding } from "@/contexts/BrandingContext";
import { getStageLabel, getStatusLabel } from "@/utils/labelMapper";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

// Retry utility for API calls
const fetchWithRetry = async (fetchFn, maxRetries = 3, delay = 1000) => {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetchFn();
    } catch (error) {
      lastError = error;
      console.warn(`API call failed (attempt ${i + 1}/${maxRetries}):`, error.message);
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  throw lastError;
};

// Default columns configuration
const DEFAULT_COLUMNS = [
  { id: 'checkbox', label: '', width: '40px', visible: true, sortable: false },
  { id: 'order_id', label: 'Order ID', width: '120px', visible: true, sortable: true, sortKey: 'order_number' },
  { id: 'order_date', label: 'Order Date', width: '180px', visible: true, sortable: true, sortKey: 'created_at' },
  { id: 'email', label: 'Email', width: '200px', visible: true, sortable: true, sortKey: 'customer_email' },
  { id: 'folder', label: 'Folder', width: '150px', visible: true, sortable: true, sortKey: 'stage' },
  { id: 'name', label: 'Name', width: '150px', visible: true, sortable: true, sortKey: 'customer_name' },
  { id: 'stage', label: 'Stage', width: '120px', visible: true, sortable: true, sortKey: 'stage' },
  { id: 'status', label: 'Status', width: '150px', visible: true, sortable: true, sortKey: 'status' },
  { id: 'tracking_number', label: 'Tracking Number', width: '150px', visible: true, sortable: true, sortKey: 'tracking_number' },
  { id: 'carrier', label: 'Carrier', width: '120px', visible: true, sortable: true, sortKey: 'carrier' },
  { id: 'last_updated', label: 'Last Updated', width: '180px', visible: true, sortable: true, sortKey: 'updated_at' },
];

// Folder Item Component - Single line per folder
function FolderItem({ folder, onClick, count, selectedFolder }) {
  const isThisFolderActive = selectedFolder === folder.id;

  return (
    <div
      onClick={() => onClick(folder.id)}
      className={`
        flex items-center justify-between px-3 py-1.5 cursor-pointer
        transition-colors text-xs
        ${isThisFolderActive ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-100'}
        ${folder.isCategory ? 'font-bold uppercase mt-2' : 'ml-4'}
      `}
    >
      <span className="truncate">{folder.label}</span>
      {count > 0 && (
        <span className={`
          text-xs px-1.5 py-0.5 rounded-full ml-2 flex-shrink-0
          ${folder.isCategory ? 'bg-blue-500 text-white' : 'bg-gray-300 text-gray-700'}
        `}>
          {count}
        </span>
      )}
    </div>
  );
}

// Draggable Column Item Component - Extracted to follow React's Rules of Hooks
function DraggableColumnItem({ column, toggleColumnVisibility }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: column.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded border"
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="w-4 h-4 text-gray-400" />
      </div>
      <Checkbox
        checked={column.visible}
        onCheckedChange={() => toggleColumnVisibility(column.id)}
      />
      <span className="text-sm">{column.label}</span>
    </div>
  );
}

export default function OrderDesk() {
  const navigate = useNavigate();
  
  // Get workflow config from BrandingContext - single source of truth
  const { workflowConfig, loading: brandingLoading } = useBranding();
  
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDebounce, setSearchDebounce] = useState('');
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [resizingColumn, setResizingColumn] = useState(null);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);
  
  // Bulk update state
  const [bulkUpdateDialogOpen, setBulkUpdateDialogOpen] = useState(false);
  const [bulkStage, setBulkStage] = useState('');
  const [bulkStatus, setBulkStatus] = useState('');
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  
  // Authentication ready state
  const [authReady, setAuthReady] = useState(false);
  
  // Retry tracking
  const retryCountRef = useRef(0);
  
  // Derive workflow stages and timer rules from context
  const workflowStages = workflowConfig?.stages || [];
  const timerRules = workflowConfig?.timers || [];
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [orderCounts, setOrderCounts] = useState({
    total: 0,
    archived: 0,
    by_stage: {},
    status_counts: {} // Dynamic status counts per stage
  });
  const ORDERS_PER_PAGE = 40;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load saved column configuration from localStorage
  useEffect(() => {
    const savedColumns = localStorage.getItem('orderdesk_columns');
    if (savedColumns) {
      setColumns(JSON.parse(savedColumns));
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) {
      navigate('/admin/login');
      return;
    }
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setAuthReady(true);
    fetchOrderCounts();
    
    // Check if we should invalidate cache (e.g., returning from order details)
    const shouldRefresh = sessionStorage.getItem('orders_cache_invalidate');
    if (shouldRefresh) {
      sessionStorage.removeItem('orders_cache_invalidate');
      // Clear all order caches
      Object.keys(sessionStorage).forEach(key => {
        if (key.startsWith('orders_cache')) {
          sessionStorage.removeItem(key);
        }
      });
    }
  }, [navigate]);

  // Fetch orders when filters change - only after auth is ready
  useEffect(() => {
    if (authReady) {
      fetchOrders();
    }
  }, [currentPage, selectedFolder, searchDebounce, authReady]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounce(searchQuery);
      setCurrentPage(1); // Reset to page 1 on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Workflow config is now provided by BrandingContext - no local fetch needed

  const fetchOrderCounts = async () => {
    try {
      const response = await fetchWithRetry(
        () => axios.get(`${API}/admin/orders/counts`, { timeout: 15000 }),
        3,
        1000
      );
      setOrderCounts(response.data);
    } catch (error) {
      console.error("Failed to load order counts:", error);
    }
  };

  const getOrderBackgroundColor = (order) => {
    if (!order.updated_at) return '';
    
    const stage = order.stage;
    const status = order[`${stage}_status`];
    const updatedAt = new Date(order.updated_at);
    const now = new Date();
    const hoursDiff = (now - updatedAt) / (1000 * 60 * 60);
    
    // Find matching timer rule
    const matchingRule = timerRules.find(rule => 
      rule.stage?.toLowerCase() === stage?.toLowerCase() &&
      rule.status?.toLowerCase().replace(/\s+/g, '_') === status?.toLowerCase()
    );
    
    if (matchingRule) {
      const thresholdHours = (matchingRule.days || 0) * 24 + (matchingRule.hours || 0);
      if (hoursDiff >= thresholdHours) {
        return matchingRule.backgroundColor || '';
      }
    }
    
    return '';
  };

  const fetchOrders = async (isRetry = false) => {
    if (!isRetry) {
      setLoading(true);
      setLoadError(null);
      retryCountRef.current = 0;
    }
    
    try {
      // Build query params for server-side filtering
      const params = new URLSearchParams();
      params.append('page', currentPage);
      params.append('limit', ORDERS_PER_PAGE);
      
      // Handle folder selection
      if (selectedFolder === 'archived') {
        params.append('archived', 'true');
      } else if (selectedFolder !== 'all') {
        params.append('archived', 'false');
        const [stage, status] = selectedFolder.split(':');
        if (stage) params.append('stage', stage);
        if (status) params.append('status', status);
      } else {
        params.append('archived', 'false');
      }
      
      // Handle search
      if (searchDebounce) {
        params.append('search', searchDebounce);
      }
      
      // Create cache key for this specific query
      const cacheKey = `orders_cache_${params.toString()}`;
      const cacheTimestampKey = `orders_cache_timestamp_${params.toString()}`;
      const CACHE_DURATION = 30 * 1000; // 30 seconds cache
      
      // Check cache first (only if not searching and not retrying)
      if (!searchDebounce && !isRetry) {
        const cachedData = sessionStorage.getItem(cacheKey);
        const cachedTimestamp = sessionStorage.getItem(cacheTimestampKey);
        
        if (cachedData && cachedTimestamp) {
          const age = Date.now() - parseInt(cachedTimestamp);
          if (age < CACHE_DURATION) {
            const data = JSON.parse(cachedData);
            setOrders(data.orders || data);
            if (data.pagination) {
              setTotalPages(data.pagination.total_pages);
              setTotalCount(data.pagination.total_count);
            }
            setLoading(false);
            // Fetch fresh data in background
            fetchOrdersBackground(params.toString(), cacheKey, cacheTimestampKey);
            return;
          }
        }
      }
      
      // Use retry logic for the API call
      const response = await fetchWithRetry(
        () => axios.get(`${API}/admin/orders?${params.toString()}`, { timeout: 30000 }),
        3,  // max retries
        1000 // delay between retries
      );
      const data = response.data;
      
      // Cache the response (only if not searching)
      if (!searchDebounce) {
        sessionStorage.setItem(cacheKey, JSON.stringify(data));
        sessionStorage.setItem(cacheTimestampKey, Date.now().toString());
      }
      
      // Handle both new paginated response and legacy array response
      if (data.orders) {
        setOrders(data.orders);
        setTotalPages(data.pagination.total_pages);
        setTotalCount(data.pagination.total_count);
      } else {
        // Legacy response - array of orders
        setOrders(data);
        setTotalCount(data.length);
        setTotalPages(Math.ceil(data.length / ORDERS_PER_PAGE));
      }
      
      setLoadError(null);
      retryCountRef.current = 0;
    } catch (error) {
      console.error("Failed to load orders:", error);
      setLoadError(error.message || "Failed to load orders. Please try again.");
      
      // Show toast only on final failure
      if (retryCountRef.current === 0) {
        toast.error("Having trouble loading orders. Retrying...");
      }
    } finally {
      setLoading(false);
    }
  };
  
  // Background fetch to update cache without blocking UI
  const fetchOrdersBackground = async (queryString, cacheKey, cacheTimestampKey) => {
    try {
      const response = await axios.get(`${API}/admin/orders?${queryString}`);
      const data = response.data;
      sessionStorage.setItem(cacheKey, JSON.stringify(data));
      sessionStorage.setItem(cacheTimestampKey, Date.now().toString());
      
      // Update UI with fresh data
      if (data.orders) {
        setOrders(data.orders);
        setTotalPages(data.pagination.total_pages);
        setTotalCount(data.pagination.total_count);
      }
    } catch (error) {
      console.error("Background fetch failed:", error);
    }
  };

  // Client-side sorting (since we have paginated data)
  const sortedOrders = [...orders].sort((a, b) => {
    if (!sortConfig.key) return 0;
    
    let aVal = a[sortConfig.key];
    let bVal = b[sortConfig.key];

    if (sortConfig.key === 'created_at' || sortConfig.key === 'updated_at') {
      aVal = new Date(aVal);
      bVal = new Date(bVal);
    }

    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (columnId) => {
    const column = columns.find(c => c.id === columnId);
    const sortKey = column?.sortKey || columnId;
    
    setSortConfig(prev => ({
      key: sortKey,
      direction: prev.key === sortKey && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleColumnDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      setColumns((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);
        const newColumns = arrayMove(items, oldIndex, newIndex);
        localStorage.setItem('orderdesk_columns', JSON.stringify(newColumns));
        return newColumns;
      });
    }
  };

  const toggleColumnVisibility = (columnId) => {
    const newColumns = columns.map(col =>
      col.id === columnId ? { ...col, visible: !col.visible } : col
    );
    setColumns(newColumns);
    localStorage.setItem('orderdesk_columns', JSON.stringify(newColumns));
  };

  const resetColumns = () => {
    setColumns(DEFAULT_COLUMNS);
    localStorage.setItem('orderdesk_columns', JSON.stringify(DEFAULT_COLUMNS));
    toast.success("Columns reset to default");
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedOrders(sortedOrders.map(o => o.id));
    } else {
      setSelectedOrders([]);
    }
  };

  const handleSelectOrder = (orderId, checked) => {
    if (checked) {
      setSelectedOrders([...selectedOrders, orderId]);
    } else {
      setSelectedOrders(selectedOrders.filter(id => id !== orderId));
    }
  };

  const isOrderSelected = (orderId) => selectedOrders.includes(orderId);
  const allSelected = sortedOrders.length > 0 && selectedOrders.length === sortedOrders.length;

  const handleMouseDown = (e, columnId) => {
    const column = columns.find(c => c.id === columnId);
    setResizingColumn(columnId);
    setStartX(e.pageX);
    setStartWidth(parseInt(column.width));
  };

  const handleMouseMove = (e) => {
    if (!resizingColumn) return;
    
    const diff = e.pageX - startX;
    const newWidth = Math.max(50, startWidth + diff);
    
    const newColumns = columns.map(col => 
      col.id === resizingColumn ? { ...col, width: `${newWidth}px` } : col
    );
    setColumns(newColumns);
    // Save immediately during drag for better persistence
    localStorage.setItem('orderdesk_columns', JSON.stringify(newColumns));
  };

  const handleMouseUp = () => {
    if (resizingColumn) {
      setResizingColumn(null);
    }
  };

  useEffect(() => {
    if (resizingColumn) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [resizingColumn, startX, startWidth]);

  const handleExport = async () => {
    // Fetch ALL orders from API (not just paginated ones)
    toast.info("Fetching all orders for export...");
    
    try {
      const token = localStorage.getItem('admin_token');
      const response = await axios.get(`${API}/admin/orders?limit=10000`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const allOrders = response.data.orders || response.data || [];
      
      if (allOrders.length === 0) {
        toast.error("No orders to export");
        return;
      }
      
      // Export ALL order data
      const headers = [
        'Order ID', 'Order Number', 'Customer Name', 'Customer Email', 
        'Stage', 'Status', 'Order Date', 'Last Updated',
        'Clay Status', 'Paint Status', 'Shipped Status',
        'Product Details', 'Special Instructions', 'Tracking Number'
      ];
      
      const csvContent = [
        headers.join(','),
        ...allOrders.map(order => {
          const status = order[`${order.stage}_status`] || '';
          const row = [
            order.id || '',
            order.order_number || '',
            order.customer_name || '',
            order.customer_email || '',
            order.stage || '',
            status,
            order.created_at || '',
            order.updated_at || '',
            order.clay_status || '',
            order.paint_status || '',
            order.shipped_status || '',
            order.product_details || '',
            order.special_instructions || '',
            order.tracking_number || ''
          ];
          return row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
        })
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `orders-full-export-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      toast.success(`Exported ${allOrders.length} orders successfully`);
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export orders");
    }
  };

  const handleSendReminderEmails = async () => {
    if (selectedOrders.length === 0) {
      toast.error("Please select at least one order");
      return;
    }

    setSendingReminders(true);
    try {
      const selectedOrdersData = sortedOrders.filter(o => selectedOrders.includes(o.id));
      const response = await axios.post(`${API}/orders/bulk-reminder-emails`, {
        order_ids: selectedOrders
      });
      
      toast.success(`Reminder emails sent to ${selectedOrders.length} customer(s)`);
      setSelectedOrders([]);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to send reminder emails");
      console.error(error);
    } finally {
      setSendingReminders(false);
    }
  };

  const handleSyncOrders = async () => {
    setSyncing(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await axios.post(`${API}/admin/sync-orders`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(response.data.message || `Synced ${response.data.synced || 0} new orders from Shopify`);
      // Refresh the orders and counts after sync
      await Promise.all([fetchOrders(), fetchOrderCounts()]);
    } catch (error) {
      const errorDetail = error.response?.data?.detail || "Failed to sync orders from Shopify";
      toast.error(errorDetail);
      console.error("Shopify sync error:", error);
    } finally {
      setSyncing(false);
    }
  };

  const handleArchiveOrders = async () => {
    if (selectedOrders.length === 0) {
      toast.error("Please select at least one order");
      return;
    }

    const isArchiving = selectedFolder !== 'archived';
    
    try {
      await axios.post(`${API}/orders/bulk-archive`, {
        order_ids: selectedOrders,
        archived: isArchiving
      });
      
      toast.success(`${selectedOrders.length} order(s) ${isArchiving ? 'archived' : 'unarchived'} successfully`);
      setSelectedOrders([]);
      // Refresh both orders and counts
      await Promise.all([fetchOrders(), fetchOrderCounts()]);
    } catch (error) {
      toast.error(error.response?.data?.detail || `Failed to ${isArchiving ? 'archive' : 'unarchive'} orders`);
      console.error(error);
    }
  };

  const handleBulkUpdateStageStatus = async () => {
    if (!bulkStage || !bulkStatus) {
      toast.error("Please select both stage and status");
      return;
    }
    if (selectedOrders.length === 0) {
      toast.error("No orders selected");
      return;
    }
    
    setIsBulkUpdating(true);
    try {
      const response = await axios.post(`${API}/admin/orders/bulk-update`, {
        order_ids: selectedOrders,
        stage: bulkStage,
        status: bulkStatus
      });
      
      toast.success(`Updated ${response.data.success_count} order(s) to ${bulkStage}/${bulkStatus}`);
      setBulkUpdateDialogOpen(false);
      setBulkStage('');
      setBulkStatus('');
      setSelectedOrders([]);
      await Promise.all([fetchOrders(), fetchOrderCounts()]);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update orders");
      console.error(error);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // Get statuses for selected bulk stage
  const getBulkStatusOptions = () => {
    if (!bulkStage) return [];
    const stage = workflowStages.find(s => s.id === bulkStage);
    return stage?.statuses || [];
  };

  // Build folder structure dynamically from workflow stages
  const folderStructure = [
    {
      id: 'all',
      label: 'All Orders',
      count: orderCounts.total - orderCounts.archived,
      isCategory: false
    },
    // Dynamic stages from workflow config (exclude archived)
    ...workflowStages
      .filter(stage => stage.id !== 'archived')
      .map(stage => ({
        id: stage.id,
        label: stage.name.toUpperCase(),
        isCategory: true,
        count: orderCounts.by_stage?.[stage.id] || 0,
        children: (stage.statuses || []).map(status => ({
          id: `${stage.id}:${status.id}`,
          label: `${stage.name} - ${status.name}`,
          count: orderCounts.status_counts?.[stage.id]?.[status.id] || 0
        }))
      })),
    // Archived folder always at the end
    {
      id: 'archived',
      label: 'ARCHIVED',
      isCategory: true,
      count: orderCounts.archived || 0
    }
  ];

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadgeColor = (status) => {
    const colors = {
      'pending': 'bg-gray-200 text-gray-700',
      'sculpting': 'bg-blue-200 text-blue-700',
      'feedback_needed': 'bg-yellow-200 text-yellow-700',
      'changes_requested': 'bg-orange-200 text-orange-700',
      'approved': 'bg-green-200 text-green-700',
    };
    return colors[status] || 'bg-gray-200 text-gray-700';
  };

  const visibleColumns = columns.filter(c => c.visible);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 overflow-y-auto">
        <div className="p-4">
          <Button
            variant="ghost"
            onClick={() => navigate('/admin')}
            className="w-full justify-start text-blue-600 hover:text-blue-700 mb-4"
          >
            <FolderOpen className="w-4 h-4 mr-2" />
            Dashboard
          </Button>

          <div className="mb-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2 px-4">FOLDERS</h3>
            <div>
              {folderStructure.map((folder) => (
                <div key={folder.id}>
                  <FolderItem
                    folder={folder}
                    onClick={(folderId) => {
                      setSelectedFolder(folderId);
                      setCurrentPage(1); // Reset to page 1 when changing folder
                      setSelectedOrders([]); // Clear selection
                    }}
                    count={folder.count}
                    selectedFolder={selectedFolder}
                  />
                  {folder.children && folder.children.map((child) => (
                    <FolderItem
                      key={child.id}
                      folder={child}
                      onClick={(folderId) => {
                        setSelectedFolder(folderId);
                        setCurrentPage(1); // Reset to page 1 when changing folder
                        setSelectedOrders([]); // Clear selection
                      }}
                      count={child.count}
                      selectedFolder={selectedFolder}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-gray-800">All Orders</h1>
            <div className="flex items-center gap-2">
              <Button 
                onClick={handleSyncOrders}
                disabled={syncing}
                variant="outline"
                size="sm"
                className="border-green-200 text-green-600 hover:bg-green-50"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync Orders'}
              </Button>
              <Button 
                onClick={() => navigate('/admin/users')}
                variant="outline"
                size="sm"
                className="border-purple-200 text-purple-600 hover:bg-purple-50"
              >
                <UserIcon className="w-4 h-4 mr-2" />
                Users
              </Button>
              <Button 
                onClick={() => navigate('/admin/settings')}
                variant="outline"
                size="sm"
                className="border-blue-200 text-blue-600 hover:bg-blue-50"
              >
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
              <Button variant="ghost" size="icon" onClick={() => window.print()}>
                <Printer className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon">
                <Info className="w-4 h-4" />
              </Button>
              <Button
                onClick={() => {
                  localStorage.removeItem('admin_token');
                  navigate('/admin/login');
                  toast.success('Logged out successfully');
                }}
                variant="outline"
                size="sm"
                className="border-red-200 text-red-600 hover:bg-red-50"
              >
                Logout
              </Button>
              <Dialog open={customizeOpen} onOpenChange={setCustomizeOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings2 className="w-4 h-4 mr-2" />
                    Customize
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Customize Columns</DialogTitle>
                    <DialogDescription>
                      Show/hide columns and drag to reorder them
                    </DialogDescription>
                  </DialogHeader>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleColumnDragEnd}
                  >
                    <SortableContext
                      items={columns.filter(c => c.id !== 'checkbox').map(c => c.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {columns.filter(c => c.id !== 'checkbox').map((column) => (
                          <DraggableColumnItem
                            key={column.id}
                            column={column}
                            toggleColumnVisibility={toggleColumnVisibility}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                  <Button onClick={resetColumns} variant="outline" className="w-full">
                    Reset to Default
                  </Button>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search orders..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
              <span className="text-sm text-gray-600">
                {totalCount} Orders Found {totalPages > 1 && `(Page ${currentPage} of ${totalPages})`}
              </span>
              {selectedOrders.length > 0 && (
                <span className="text-sm text-blue-600 font-semibold">
                  {selectedOrders.length} Selected
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selectedOrders.length > 0 && (
                <>
                  <Button 
                    onClick={() => setBulkUpdateDialogOpen(true)}
                    variant="outline"
                    size="sm"
                    className="border-blue-400 text-blue-700 hover:bg-blue-50"
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Change Stage ({selectedOrders.length})
                  </Button>
                  <Button 
                    onClick={handleArchiveOrders}
                    variant="outline"
                    size="sm"
                    className="border-gray-400 text-gray-700 hover:bg-gray-100"
                  >
                    <Archive className="w-4 h-4 mr-2" />
                    {selectedFolder === 'archived' ? `Unarchive (${selectedOrders.length})` : `Archive (${selectedOrders.length})`}
                  </Button>
                  <Button 
                    onClick={handleSendReminderEmails} 
                    disabled={sendingReminders}
                    variant="default"
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Bell className="w-4 h-4 mr-2" />
                    {sendingReminders ? 'Sending...' : `Send Reminder (${selectedOrders.length})`}
                  </Button>
                </>
              )}
              <Button onClick={handleExport} variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export All Data
              </Button>
            </div>
          </div>
        </div>

        {/* Order Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500">Loading orders...</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr>
                  {visibleColumns.map((column) => {
                    if (column.id === 'checkbox') {
                      return (
                        <th key={column.id} style={{ width: column.width }} className="p-3 text-left bg-gray-50 border-b border-gray-200">
                          <Checkbox checked={allSelected} onCheckedChange={handleSelectAll} />
                        </th>
                      );
                    }

                    const isSorted = sortConfig?.key === (column.sortKey || column.id);
                    const sortDirection = isSorted ? sortConfig.direction : null;

                    return (
                      <th
                        key={column.id}
                        style={{ width: column.width, position: 'relative' }}
                        className="p-3 text-left bg-gray-50 border-b border-gray-200"
                      >
                        <button
                          onClick={() => column.sortable && handleSort(column.id)}
                          className={`flex items-center gap-1 font-semibold text-sm ${
                            column.sortable ? 'text-gray-700 hover:text-gray-900 cursor-pointer' : 'text-gray-500 cursor-default'
                          }`}
                        >
                          {column.label}
                          {column.sortable && (
                            <span className="text-gray-400">
                              {isSorted ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅'}
                            </span>
                          )}
                        </button>
                        <div
                          onMouseDown={(e) => handleMouseDown(e, column.id)}
                          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 hover:w-1.5"
                          style={{ userSelect: 'none' }}
                        />
                      </th>
                    );

                  })}
                </tr>
              </thead>
              <tbody>
                {sortedOrders.map((order, idx) => (
                  <tr
                    key={order.id}
                    onClick={(e) => {
                      // Don't navigate if clicking checkbox
                      if (e.target.type === 'checkbox' || e.target.closest('[role="checkbox"]')) {
                        return;
                      }
                      // Store that we came from OrderDesk
                      sessionStorage.setItem('orderDetailsReturnPath', '/admin/orderdesk');
                      navigate(`/admin/orders/${order.id}`);
                    }}
                    className={`border-b border-gray-100 hover:bg-blue-50 transition-colors cursor-pointer ${
                      idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    }`}
                    style={{
                      backgroundColor: getOrderBackgroundColor(order) || undefined
                    }}
                  >
                    {visibleColumns.map((column) => (
                      <td key={column.id} className="p-3 text-sm">
                        {column.id === 'checkbox' && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <Checkbox 
                              checked={isOrderSelected(order.id)}
                              onCheckedChange={(checked) => handleSelectOrder(order.id, checked)}
                            />
                          </div>
                        )}
                        {column.id === 'order_id' && (
                          <span className="text-blue-700 font-semibold text-base">
                            {order.order_number}
                          </span>
                        )}
                        {column.id === 'order_date' && formatDate(order.created_at)}
                        {column.id === 'email' && order.customer_email}
                        {column.id === 'folder' && (
                          <span className="text-gray-600">
                            {getStageLabel(order.stage, workflowConfig)}
                          </span>
                        )}
                        {column.id === 'name' && order.customer_name}
                        {column.id === 'stage' && (
                          <span 
                            className="px-3 py-1 rounded-full text-xs font-medium capitalize inline-block"
                            style={{
                              backgroundColor: order.stage === 'clay' ? '#ffad46' : order.stage === 'paint' ? '#6d9eeb' : '#e0e0e0',
                              color: '#ffffff'
                            }}
                          >
                            {getStageLabel(order.stage, workflowConfig)}
                          </span>
                        )}
                        {column.id === 'status' && (
                          <span className={`px-2 py-1 rounded-full text-xs ${getStatusBadgeColor(order[`${order.stage}_status`])}`}>
                            {/* Display status using dynamic label from workflow config */}
                            {getStatusLabel(order[`${order.stage}_status`], workflowConfig, order.stage)}
                          </span>
                        )}
                        {column.id === 'tracking_number' && (
                          <TrackingLink 
                            trackingNumber={order.tracking_number} 
                            carrier={order.carrier || order.tracking_company}
                          />
                        )}
                        {column.id === 'carrier' && (
                          <span className="text-gray-700">{order.carrier || order.tracking_company || '-'}</span>
                        )}
                        {column.id === 'last_updated' && formatDate(order.updated_at)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading && !loadError && sortedOrders.length === 0 && (
            <div className="flex items-center justify-center h-64">
              <p className="text-gray-500">No orders found</p>
            </div>
          )}
          
          {/* Error State with Retry */}
          {!loading && loadError && (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <AlertCircle className="w-12 h-12 text-red-400" />
              <p className="text-gray-600 text-center max-w-md">{loadError}</p>
              <Button onClick={() => fetchOrders(true)} variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry Loading Orders
              </Button>
            </div>
          )}

          {/* Pagination Controls */}
          {!loading && !loadError && totalPages > 1 && (
            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Showing {((currentPage - 1) * ORDERS_PER_PAGE) + 1} - {Math.min(currentPage * ORDERS_PER_PAGE, totalCount)} of {totalCount} orders
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  First
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="px-3 py-1 text-sm font-medium">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  Last
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
