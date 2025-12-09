import { useState, useEffect } from "react";
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
  Search
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

const BACKEND_URL = window.location.origin;
const API = `${BACKEND_URL}/api`;

// Default columns configuration
const DEFAULT_COLUMNS = [
  { id: 'checkbox', label: '', width: '40px', visible: true, sortable: false },
  { id: 'order_id', label: 'Order ID', width: '120px', visible: true, sortable: true },
  { id: 'order_date', label: 'Order Date', width: '180px', visible: true, sortable: true },
  { id: 'email', label: 'Email', width: '200px', visible: true, sortable: true },
  { id: 'folder', label: 'Folder', width: '150px', visible: true, sortable: false },
  { id: 'name', label: 'Name', width: '150px', visible: true, sortable: true },
  { id: 'stage', label: 'Stage', width: '120px', visible: true, sortable: true },
  { id: 'status', label: 'Status', width: '150px', visible: true, sortable: true },
  { id: 'last_updated', label: 'Last Updated', width: '180px', visible: true, sortable: true },
];

// Sortable Column Header Component
function SortableColumnHeader({ column, onSort, sortConfig }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id, disabled: !column.sortable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    width: column.width,
  };

  if (column.id === 'checkbox') {
    return (
      <th style={{ width: column.width }} className="p-3 text-left">
        <Checkbox />
      </th>
    );
  }

  const isSorted = sortConfig?.key === column.id;
  const sortDirection = isSorted ? sortConfig.direction : null;

  return (
    <th
      ref={setNodeRef}
      style={style}
      className="p-3 text-left bg-gray-50 border-b border-gray-200 group"
    >
      <div className="flex items-center gap-2">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
          <GripVertical className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100" />
        </div>
        <button
          onClick={() => column.sortable && onSort(column.id)}
          className="flex items-center gap-1 font-semibold text-sm text-gray-700 hover:text-gray-900"
        >
          {column.label}
          {column.sortable && isSorted && (
            <span className="ml-1">{sortDirection === 'asc' ? '▲' : '▼'}</span>
          )}
        </button>
      </div>
    </th>
  );
}

// Folder Item Component
function FolderItem({ folder, isActive, onClick, count }) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="mb-1">
      <div
        onClick={() => {
          if (folder.children) {
            setIsExpanded(!isExpanded);
          } else {
            onClick();
          }
        }}
        className={`
          flex items-center justify-between px-4 py-2 cursor-pointer rounded-md
          transition-colors
          ${isActive ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-100'}
          ${folder.isCategory ? 'font-bold text-sm uppercase' : 'text-sm ml-2'}
        `}
      >
        <div className="flex items-center gap-2">
          {folder.children && (
            isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
          )}
          {!folder.children && !folder.isCategory && <div className="w-4" />}
          <span>{folder.label}</span>
        </div>
        {count > 0 && (
          <span className={`
            text-xs px-2 py-0.5 rounded-full
            ${folder.isCategory ? 'bg-blue-500 text-white' : 'bg-gray-300 text-gray-700'}
          `}>
            {count}
          </span>
        )}
      </div>
      
      {folder.children && isExpanded && (
        <div className="ml-2 mt-1">
          {folder.children.map((child) => (
            <FolderItem
              key={child.id}
              folder={child}
              isActive={isActive}
              onClick={onClick}
              count={child.count || 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrderDesk() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [sortConfig, setSortConfig] = useState({ key: 'order_date', direction: 'desc' });
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [customizeOpen, setCustomizeOpen] = useState(false);

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
    fetchOrders();
  }, [navigate]);

  useEffect(() => {
    filterOrders();
  }, [selectedFolder, orders, searchQuery]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/admin/orders`);
      setOrders(response.data || []);
    } catch (error) {
      toast.error("Failed to load orders");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filterOrders = () => {
    let filtered = [...orders];

    // Filter by folder
    if (selectedFolder !== 'all') {
      const [stage, status] = selectedFolder.split(':');
      filtered = filtered.filter(order => {
        if (status) {
          return order.stage === stage && order[`${stage}_status`] === status;
        } else {
          return order.stage === stage;
        }
      });
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(order =>
        order.order_number?.toLowerCase().includes(query) ||
        order.customer_email?.toLowerCase().includes(query) ||
        order.customer_name?.toLowerCase().includes(query)
      );
    }

    // Sort
    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];

        if (sortConfig.key === 'order_date' || sortConfig.key === 'last_updated') {
          aVal = new Date(aVal);
          bVal = new Date(bVal);
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    setFilteredOrders(filtered);
  };

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
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

  const handleExport = () => {
    const csvContent = [
      columns.filter(c => c.visible && c.id !== 'checkbox').map(c => c.label).join(','),
      ...filteredOrders.map(order => 
        columns.filter(c => c.visible && c.id !== 'checkbox').map(c => {
          const value = order[c.id] || '';
          return `"${value}"`;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `orders-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success("Orders exported successfully");
  };

  // Build folder structure with counts
  const folderStructure = [
    {
      id: 'all',
      label: 'All Orders',
      count: orders.length,
      isCategory: false
    },
    {
      id: 'clay',
      label: 'CLAY',
      isCategory: true,
      count: orders.filter(o => o.stage === 'clay').length,
      children: [
        { id: 'clay:sculpting', label: 'Clay - In Progress', count: orders.filter(o => o.stage === 'clay' && o.clay_status === 'sculpting').length },
        { id: 'clay:feedback_needed', label: 'Clay - Feedback Needed', count: orders.filter(o => o.stage === 'clay' && o.clay_status === 'feedback_needed').length },
        { id: 'clay:changes_requested', label: 'Clay - Changes Requested', count: orders.filter(o => o.stage === 'clay' && o.clay_status === 'changes_requested').length },
        { id: 'clay:approved', label: 'Clay - Approved', count: orders.filter(o => o.stage === 'clay' && o.clay_status === 'approved').length },
      ]
    },
    {
      id: 'paint',
      label: 'PAINT',
      isCategory: true,
      count: orders.filter(o => o.stage === 'paint').length,
      children: [
        { id: 'paint:sculpting', label: 'Paint - In Progress', count: orders.filter(o => o.stage === 'paint' && o.paint_status === 'sculpting').length },
        { id: 'paint:feedback_needed', label: 'Paint - Feedback Needed', count: orders.filter(o => o.stage === 'paint' && o.paint_status === 'feedback_needed').length },
        { id: 'paint:changes_requested', label: 'Paint - Changes Requested', count: orders.filter(o => o.stage === 'paint' && o.paint_status === 'changes_requested').length },
        { id: 'paint:approved', label: 'Paint - Approved', count: orders.filter(o => o.stage === 'paint' && o.paint_status === 'approved').length },
      ]
    },
    {
      id: 'shipped',
      label: 'SHIPPED',
      isCategory: true,
      count: orders.filter(o => o.stage === 'shipped').length
    },
    {
      id: 'fulfilled',
      label: 'FULFILLED',
      isCategory: true,
      count: orders.filter(o => o.stage === 'fulfilled').length
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
            <div className="space-y-1">
              {folderStructure.map((folder) => (
                <FolderItem
                  key={folder.id}
                  folder={folder}
                  isActive={selectedFolder === folder.id}
                  onClick={() => setSelectedFolder(folder.id)}
                  count={folder.count}
                />
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
            <h1 className="text-2xl font-bold text-gray-800">'All Orders'</h1>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => window.print()}>
                <Printer className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon">
                <Info className="w-4 h-4" />
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
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {columns.filter(c => c.id !== 'checkbox').map((column) => (
                      <div key={column.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded">
                        <Checkbox
                          checked={column.visible}
                          onCheckedChange={() => toggleColumnVisibility(column.id)}
                        />
                        <span className="text-sm">{column.label}</span>
                      </div>
                    ))}
                  </div>
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
                {filteredOrders.length} Orders Found
              </span>
            </div>
            <Button onClick={handleExport} variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Export All Pages
            </Button>
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
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleColumnDragEnd}
                >
                  <SortableContext
                    items={visibleColumns.map(c => c.id)}
                    strategy={horizontalListSortingStrategy}
                  >
                    <tr>
                      {visibleColumns.map((column) => (
                        <SortableColumnHeader
                          key={column.id}
                          column={column}
                          onSort={handleSort}
                          sortConfig={sortConfig}
                        />
                      ))}
                    </tr>
                  </SortableContext>
                </DndContext>
              </thead>
              <tbody>
                {filteredOrders.map((order, idx) => (
                  <tr
                    key={order.id}
                    onClick={(e) => {
                      // Don't navigate if clicking checkbox
                      if (e.target.type === 'checkbox' || e.target.closest('[role="checkbox"]')) {
                        return;
                      }
                      navigate(`/admin/orders/${order.id}`);
                    }}
                    className={`border-b border-gray-100 hover:bg-blue-50 transition-colors cursor-pointer ${
                      idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    }`}
                  >
                    {visibleColumns.map((column) => (
                      <td key={column.id} className="p-3 text-sm">
                        {column.id === 'checkbox' && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <Checkbox />
                          </div>
                        )}
                        {column.id === 'order_id' && (
                          <span className="text-green-600 font-mono flex items-center gap-1">
                            <span className="text-green-500">$</span>
                            {order.order_number}
                          </span>
                        )}
                        {column.id === 'order_date' && formatDate(order.created_at)}
                        {column.id === 'email' && order.customer_email}
                        {column.id === 'folder' && (
                          <span className="text-gray-600">
                            {order.stage?.charAt(0).toUpperCase() + order.stage?.slice(1)}
                          </span>
                        )}
                        {column.id === 'name' && order.customer_name}
                        {column.id === 'stage' && (
                          <span className="capitalize">{order.stage}</span>
                        )}
                        {column.id === 'status' && (
                          <span className={`px-2 py-1 rounded-full text-xs ${getStatusBadgeColor(order[`${order.stage}_status`])}`}>
                            {order[`${order.stage}_status`]?.replace(/_/g, ' ')}
                          </span>
                        )}
                        {column.id === 'last_updated' && formatDate(order.updated_at)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading && filteredOrders.length === 0 && (
            <div className="flex items-center justify-center h-64">
              <p className="text-gray-500">No orders found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
