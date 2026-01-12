import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Save, Clock, Layers, GitBranch, AlertTriangle, Mail } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

// Predefined triggers that users can select from
const PREDEFINED_TRIGGERS = [
  { id: 'order_created', label: 'Order Created', description: 'When a new order enters the system' },
  { id: 'proof_uploaded', label: 'Proof Uploaded', description: 'When admin uploads proofs for review' },
  { id: 'proof_approved', label: 'Proof Approved', description: 'When customer approves their proofs' },
  { id: 'changes_requested', label: 'Changes Requested', description: 'When customer requests changes to proofs' },
  { id: 'all_proofs_approved', label: 'All Proofs Approved in Stage', description: 'When all proofs in a stage are approved' },
  { id: 'tracking_added', label: 'Tracking Number Added', description: 'When tracking information is added to order' },
  { id: 'order_shipped', label: 'Order Shipped', description: 'When order is marked as shipped' },
  { id: 'manual_change', label: 'Manual Status Change', description: 'When admin manually changes status' },
  { id: 'time_delay', label: '⏱️ After Time Delay', description: 'Automatically trigger after specified time in this status', hasTimeDelay: true },
];

// Email templates that can be sent as actions
const EMAIL_TEMPLATES = [
  { id: 'none', label: 'No Email', description: 'Do not send any email' },
  { id: 'proof_ready', label: 'Proof Ready for Review', description: 'Notify customer that proofs are ready' },
  { id: 'approval_received', label: 'Approval Confirmation', description: 'Confirm to admin that approval was received' },
  { id: 'changes_received', label: 'Changes Request Received', description: 'Confirm changes request was received' },
  { id: 'stage_complete', label: 'Stage Complete', description: 'Notify that a stage has been completed' },
  { id: 'order_shipped', label: 'Order Shipped', description: 'Notify customer their order has shipped' },
  { id: 'tracking_update', label: 'Tracking Update', description: 'Send tracking information to customer' },
  { id: 'reminder', label: 'Reminder Email', description: 'Remind customer to review proofs' },
  { id: 'order_complete', label: 'Order Complete', description: 'Notify customer their order is complete' },
  { id: 'sla_warning', label: 'SLA Warning', description: 'Internal alert for overdue orders' },
  { id: 'custom', label: 'Custom Email', description: 'Use custom email template' },
];

// Default stages and statuses
const DEFAULT_STAGES = [
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

const DEFAULT_WORKFLOW_RULES = [
  { id: 1, fromStage: 'clay', fromStatus: 'sculpting', trigger: 'proof_uploaded', toStage: 'clay', toStatus: 'feedback_needed', emailAction: 'proof_ready' },
  { id: 2, fromStage: 'clay', fromStatus: 'feedback_needed', trigger: 'proof_approved', toStage: 'clay', toStatus: 'approved', emailAction: 'approval_received' },
  { id: 3, fromStage: 'clay', fromStatus: 'feedback_needed', trigger: 'changes_requested', toStage: 'clay', toStatus: 'changes_requested', emailAction: 'changes_received' },
  { id: 4, fromStage: 'clay', fromStatus: 'changes_requested', trigger: 'proof_uploaded', toStage: 'clay', toStatus: 'feedback_needed', emailAction: 'proof_ready' },
  { id: 5, fromStage: 'clay', fromStatus: 'approved', trigger: 'manual_change', toStage: 'paint', toStatus: 'painting', emailAction: 'stage_complete' },
  { id: 6, fromStage: 'paint', fromStatus: 'painting', trigger: 'proof_uploaded', toStage: 'paint', toStatus: 'feedback_needed', emailAction: 'proof_ready' },
  { id: 7, fromStage: 'paint', fromStatus: 'feedback_needed', trigger: 'proof_approved', toStage: 'paint', toStatus: 'approved', emailAction: 'approval_received' },
  { id: 8, fromStage: 'paint', fromStatus: 'feedback_needed', trigger: 'changes_requested', toStage: 'paint', toStatus: 'changes_requested', emailAction: 'changes_received' },
  { id: 9, fromStage: 'paint', fromStatus: 'changes_requested', trigger: 'proof_uploaded', toStage: 'paint', toStatus: 'feedback_needed', emailAction: 'proof_ready' },
  { id: 10, fromStage: 'paint', fromStatus: 'approved', trigger: 'tracking_added', toStage: 'shipped', toStatus: 'in_transit', emailAction: 'order_shipped' },
];

const DEFAULT_TIMER_RULES = [
  { id: 1, stage: 'clay', status: 'sculpting', days: 2, hours: 0, backgroundColor: '#ffebcc', description: 'Clay stage taking longer than expected' },
  { id: 2, stage: 'clay', status: 'feedback_needed', days: 1, hours: 0, backgroundColor: '#ffe0e0', description: 'Customer hasn\'t reviewed clay proofs' },
  { id: 3, stage: 'paint', status: 'painting', days: 2, hours: 0, backgroundColor: '#ffebcc', description: 'Paint stage taking longer than expected' },
  { id: 4, stage: 'paint', status: 'feedback_needed', days: 1, hours: 0, backgroundColor: '#ffe0e0', description: 'Customer hasn\'t reviewed paint proofs' },
];

export default function WorkflowTableEditor() {
  const [stages, setStages] = useState([]);
  const [workflowRules, setWorkflowRules] = useState([]);
  const [timerRules, setTimerRules] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, type: null, item: null, usedIn: [] });
  
  // New stage/status form
  const [newStageName, setNewStageName] = useState('');
  const [newStatusName, setNewStatusName] = useState('');
  const [selectedStageForStatus, setSelectedStageForStatus] = useState('');
  
  // Custom email templates
  const [customTemplates, setCustomTemplates] = useState([]);
  const [newTemplate, setNewTemplate] = useState({ name: '', subject: '', body: '', description: '' });
  const [editingTemplate, setEditingTemplate] = useState(null);

  useEffect(() => {
    loadWorkflowConfig();
    loadCustomTemplates();
  }, []);

  const loadWorkflowConfig = async () => {
    try {
      const response = await axios.get(`${API}/settings/tenant`);
      const settings = response.data.settings || {};
      const workflowConfig = settings.workflow_config || {};
      
      // Load stages or use defaults
      setStages(workflowConfig.stages || DEFAULT_STAGES);
      setWorkflowRules(workflowConfig.rules || DEFAULT_WORKFLOW_RULES);
      setTimerRules(workflowConfig.timers || DEFAULT_TIMER_RULES);
    } catch (error) {
      console.error("Failed to load workflow config:", error);
      // Use defaults
      setStages(DEFAULT_STAGES);
      setWorkflowRules(DEFAULT_WORKFLOW_RULES);
      setTimerRules(DEFAULT_TIMER_RULES);
    }
  };
  
  const loadCustomTemplates = async () => {
    try {
      const response = await axios.get(`${API}/settings/custom-email-templates`);
      setCustomTemplates(response.data.templates || []);
    } catch (error) {
      console.error("Failed to load custom templates:", error);
    }
  };

  // Get all statuses for a specific stage
  const getStatusesForStage = (stageId) => {
    const stage = stages.find(s => s.id === stageId);
    return stage?.statuses || [];
  };

  // Get stage name by ID
  const getStageName = (stageId) => {
    const stage = stages.find(s => s.id === stageId);
    return stage?.name || stageId;
  };

  // Get status name by ID within a stage
  const getStatusName = (stageId, statusId) => {
    const stage = stages.find(s => s.id === stageId);
    const status = stage?.statuses?.find(st => st.id === statusId);
    return status?.name || statusId;
  };

  // Get trigger label
  const getTriggerLabel = (triggerId) => {
    const trigger = PREDEFINED_TRIGGERS.find(t => t.id === triggerId);
    return trigger?.label || triggerId;
  };

  // Check if stage is used in rules
  const isStageUsedInRules = (stageId) => {
    const rulesUsing = workflowRules.filter(r => r.fromStage === stageId || r.toStage === stageId);
    const timersUsing = timerRules.filter(t => t.stage === stageId);
    return [...rulesUsing.map(r => ({ type: 'rule', item: r })), ...timersUsing.map(t => ({ type: 'timer', item: t }))];
  };

  // Check if status is used in rules
  const isStatusUsedInRules = (stageId, statusId) => {
    const rulesUsing = workflowRules.filter(r => 
      (r.fromStage === stageId && r.fromStatus === statusId) ||
      (r.toStage === stageId && r.toStatus === statusId)
    );
    const timersUsing = timerRules.filter(t => t.stage === stageId && t.status === statusId);
    return [...rulesUsing.map(r => ({ type: 'rule', item: r })), ...timersUsing.map(t => ({ type: 'timer', item: t }))];
  };

  // ==================== STAGE MANAGEMENT ====================
  const handleAddStage = () => {
    if (!newStageName.trim()) {
      toast.error("Please enter a stage name");
      return;
    }
    
    const stageId = newStageName.toLowerCase().replace(/\s+/g, '_');
    if (stages.find(s => s.id === stageId)) {
      toast.error("A stage with this name already exists");
      return;
    }

    const newStage = {
      id: stageId,
      name: newStageName.trim(),
      order: stages.length + 1,
      statuses: [
        { id: 'in_progress', name: 'In Progress' },
        { id: 'completed', name: 'Completed' },
      ]
    };
    
    setStages([...stages, newStage]);
    setNewStageName('');
    toast.success(`Stage "${newStageName}" added`);
  };

  const handleDeleteStage = (stageId) => {
    const usedIn = isStageUsedInRules(stageId);
    if (usedIn.length > 0) {
      setDeleteDialog({
        open: true,
        type: 'stage',
        item: stages.find(s => s.id === stageId),
        usedIn
      });
      return;
    }
    
    setStages(stages.filter(s => s.id !== stageId));
    toast.success("Stage deleted");
  };

  const confirmDelete = () => {
    if (deleteDialog.type === 'stage') {
      // Remove stage and all rules/timers using it
      const stageId = deleteDialog.item.id;
      setStages(stages.filter(s => s.id !== stageId));
      setWorkflowRules(workflowRules.filter(r => r.fromStage !== stageId && r.toStage !== stageId));
      setTimerRules(timerRules.filter(t => t.stage !== stageId));
      toast.success("Stage and related rules deleted");
    } else if (deleteDialog.type === 'status') {
      // Remove status and all rules/timers using it
      const { stageId, statusId } = deleteDialog.item;
      setStages(stages.map(s => 
        s.id === stageId 
          ? { ...s, statuses: s.statuses.filter(st => st.id !== statusId) }
          : s
      ));
      setWorkflowRules(workflowRules.filter(r => 
        !((r.fromStage === stageId && r.fromStatus === statusId) ||
          (r.toStage === stageId && r.toStatus === statusId))
      ));
      setTimerRules(timerRules.filter(t => !(t.stage === stageId && t.status === statusId)));
      toast.success("Status and related rules deleted");
    }
    setDeleteDialog({ open: false, type: null, item: null, usedIn: [] });
  };

  const handleUpdateStageName = (stageId, newName) => {
    setStages(stages.map(s => 
      s.id === stageId ? { ...s, name: newName } : s
    ));
  };

  // ==================== STATUS MANAGEMENT ====================
  const handleAddStatus = () => {
    if (!selectedStageForStatus) {
      toast.error("Please select a stage first");
      return;
    }
    if (!newStatusName.trim()) {
      toast.error("Please enter a status name");
      return;
    }

    const statusId = newStatusName.toLowerCase().replace(/\s+/g, '_');
    const stage = stages.find(s => s.id === selectedStageForStatus);
    
    if (stage?.statuses?.find(st => st.id === statusId)) {
      toast.error("This status already exists in the selected stage");
      return;
    }

    setStages(stages.map(s => 
      s.id === selectedStageForStatus
        ? { ...s, statuses: [...(s.statuses || []), { id: statusId, name: newStatusName.trim() }] }
        : s
    ));
    
    setNewStatusName('');
    toast.success(`Status "${newStatusName}" added to ${stage?.name}`);
  };

  const handleDeleteStatus = (stageId, statusId) => {
    const usedIn = isStatusUsedInRules(stageId, statusId);
    if (usedIn.length > 0) {
      setDeleteDialog({
        open: true,
        type: 'status',
        item: { stageId, statusId, name: getStatusName(stageId, statusId) },
        usedIn
      });
      return;
    }

    setStages(stages.map(s => 
      s.id === stageId 
        ? { ...s, statuses: s.statuses.filter(st => st.id !== statusId) }
        : s
    ));
    toast.success("Status deleted");
  };

  const handleUpdateStatusName = (stageId, statusId, newName) => {
    setStages(stages.map(s => 
      s.id === stageId 
        ? { 
            ...s, 
            statuses: s.statuses.map(st => 
              st.id === statusId ? { ...st, name: newName } : st
            ) 
          }
        : s
    ));
  };

  // ==================== WORKFLOW RULES ====================
  const handleAddRule = () => {
    const newRule = {
      id: Date.now(),
      fromStage: stages[0]?.id || '',
      fromStatus: stages[0]?.statuses?.[0]?.id || '',
      trigger: 'manual_change',
      toStage: stages[0]?.id || '',
      toStatus: stages[0]?.statuses?.[0]?.id || '',
      emailAction: 'none',
      // Time delay fields (used when trigger is 'time_delay')
      delayDays: 0,
      delayHours: 0,
    };
    setWorkflowRules([...workflowRules, newRule]);
  };

  const handleUpdateRule = (id, field, value) => {
    setWorkflowRules(rules => 
      rules.map(rule => {
        if (rule.id !== id) return rule;
        
        const updated = { ...rule, [field]: value };
        
        // Auto-update status when stage changes
        if (field === 'fromStage') {
          const stageStatuses = getStatusesForStage(value);
          updated.fromStatus = stageStatuses[0]?.id || '';
        }
        if (field === 'toStage') {
          const stageStatuses = getStatusesForStage(value);
          updated.toStatus = stageStatuses[0]?.id || '';
        }
        
        return updated;
      })
    );
  };

  const handleDeleteRule = (id) => {
    setWorkflowRules(rules => rules.filter(rule => rule.id !== id));
  };

  // ==================== TIMER RULES ====================
  const handleAddTimerRule = () => {
    const newRule = {
      id: Date.now(),
      stage: stages[0]?.id || '',
      status: stages[0]?.statuses?.[0]?.id || '',
      days: 1,
      hours: 0,
      backgroundColor: '#ffebcc',
      description: ''
    };
    setTimerRules([...timerRules, newRule]);
  };

  const handleUpdateTimerRule = (id, field, value) => {
    setTimerRules(rules => 
      rules.map(rule => {
        if (rule.id !== id) return rule;
        
        const updated = { ...rule, [field]: value };
        
        // Auto-update status when stage changes
        if (field === 'stage') {
          const stageStatuses = getStatusesForStage(value);
          updated.status = stageStatuses[0]?.id || '';
        }
        
        return updated;
      })
    );
  };

  const handleDeleteTimerRule = (id) => {
    setTimerRules(rules => rules.filter(rule => rule.id !== id));
  };

  // ==================== SAVE ====================
  const handleSave = async () => {
    setSaving(true);
    try {
      const workflowConfig = {
        stages,
        rules: workflowRules,
        timers: timerRules,
        // Legacy format for backwards compatibility
        stage_labels: Object.fromEntries(stages.map(s => [s.id, s.name])),
        status_labels: Object.fromEntries(
          stages.flatMap(s => s.statuses.map(st => [st.id, st.name]))
        ),
      };
      
      const token = localStorage.getItem('admin_token');
      await axios.patch(`${API}/settings/tenant`, {
        settings: { workflow_config: workflowConfig }
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success("Workflow configuration saved successfully!");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save workflow configuration");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  // ==================== CUSTOM EMAIL TEMPLATES ====================
  const handleCreateTemplate = async () => {
    if (!newTemplate.name || !newTemplate.subject) {
      toast.error("Please fill in template name and subject");
      return;
    }
    
    try {
      const token = localStorage.getItem('admin_token');
      const response = await axios.post(`${API}/settings/custom-email-templates`, newTemplate, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCustomTemplates([...customTemplates, response.data.template]);
      setNewTemplate({ name: '', subject: '', body: '', description: '' });
      toast.success("Email template created!");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to create template");
    }
  };
  
  const handleUpdateTemplate = async () => {
    if (!editingTemplate) return;
    
    try {
      const token = localStorage.getItem('admin_token');
      await axios.patch(`${API}/settings/custom-email-templates/${editingTemplate.id}`, editingTemplate, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCustomTemplates(customTemplates.map(t => 
        t.id === editingTemplate.id ? editingTemplate : t
      ));
      setEditingTemplate(null);
      toast.success("Template updated!");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update template");
    }
  };
  
  const handleDeleteTemplate = async (templateId) => {
    if (!confirm("Are you sure you want to delete this template?")) return;
    
    try {
      const token = localStorage.getItem('admin_token');
      await axios.delete(`${API}/settings/custom-email-templates/${templateId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCustomTemplates(customTemplates.filter(t => t.id !== templateId));
      toast.success("Template deleted!");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete template");
    }
  };
  
  // Get all available email templates (predefined + custom)
  const getAllEmailTemplates = () => {
    const allTemplates = [...EMAIL_TEMPLATES];
    customTemplates.forEach(ct => {
      allTemplates.push({
        id: `custom_${ct.id}`,
        label: `📝 ${ct.name}`,
        description: ct.description || 'Custom template'
      });
    });
    return allTemplates;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="w-5 h-5" />
          Workflow Configuration
        </CardTitle>
        <CardDescription>
          Define your workflow stages, statuses, and automation rules
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="stages" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="stages" className="flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Stages & Statuses
            </TabsTrigger>
            <TabsTrigger value="rules" className="flex items-center gap-2">
              <GitBranch className="w-4 h-4" />
              Workflow Rules
            </TabsTrigger>
            <TabsTrigger value="timers" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Timer Alerts
            </TabsTrigger>
            <TabsTrigger value="emails" className="flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Email Templates
            </TabsTrigger>
          </TabsList>

          {/* ==================== TAB 1: STAGES & STATUSES ==================== */}
          <TabsContent value="stages" className="space-y-6 mt-4">
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save All Changes'}
              </Button>
            </div>

            {/* Add New Stage */}
            <div className="border rounded-lg p-4 bg-gray-50">
              <h3 className="font-semibold mb-3">Add New Stage</h3>
              <div className="flex gap-2">
                <Input
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  placeholder="Enter stage name (e.g., Quality Check)"
                  className="flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddStage()}
                />
                <Button onClick={handleAddStage}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Stage
                </Button>
              </div>
            </div>

            {/* Add New Status - moved up per user request */}
            <div className="border rounded-lg p-4 bg-gray-50">
              <h3 className="font-semibold mb-3">Add New Status</h3>
              <div className="flex gap-2">
                <Select value={selectedStageForStatus} onValueChange={setSelectedStageForStatus}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select Stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map(stage => (
                      <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={newStatusName}
                  onChange={(e) => setNewStatusName(e.target.value)}
                  placeholder="Enter status name"
                  className="flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddStatus()}
                />
                <Button onClick={handleAddStatus}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Status
                </Button>
              </div>
            </div>

            {/* Stages List */}
            <div className="space-y-4">
              {stages.map((stage, stageIdx) => (
                <div key={stage.id} className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-100 p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-500">#{stageIdx + 1}</span>
                      <Input
                        value={stage.name}
                        onChange={(e) => handleUpdateStageName(stage.id, e.target.value)}
                        className="font-semibold w-48 bg-white"
                      />
                      <span className="text-xs text-gray-400">ID: {stage.id}</span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleDeleteStage(stage.id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  <div className="p-4">
                    <h4 className="text-sm font-medium text-gray-600 mb-2">Statuses in {stage.name}:</h4>
                    <div className="space-y-2">
                      {stage.statuses?.map((status) => (
                        <div key={status.id} className="flex items-center gap-2 pl-4">
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          <Input
                            value={status.name}
                            onChange={(e) => handleUpdateStatusName(stage.id, status.id, e.target.value)}
                            className="flex-1 max-w-xs"
                          />
                          <span className="text-xs text-gray-400">ID: {status.id}</span>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleDeleteStatus(stage.id, status.id)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ==================== TAB 2: WORKFLOW RULES ==================== */}
          <TabsContent value="rules" className="space-y-4 mt-4">
            <div className="flex justify-between items-center">
              <Button onClick={handleAddRule} variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Rule
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save All Changes'}
              </Button>
            </div>

            <Alert>
              <AlertDescription>
                Workflow rules define what happens when triggers occur. Each rule can move an order to a new stage/status AND optionally send an email notification.
              </AlertDescription>
            </Alert>

            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="p-3 text-left text-sm font-semibold text-gray-700">From Stage</th>
                    <th className="p-3 text-left text-sm font-semibold text-gray-700">From Status</th>
                    <th className="p-3 text-left text-sm font-semibold text-gray-700">When (Trigger)</th>
                    <th className="p-3 text-left text-sm font-semibold text-gray-700">⏱️ Time Delay</th>
                    <th className="p-3 text-left text-sm font-semibold text-gray-700">To Stage</th>
                    <th className="p-3 text-left text-sm font-semibold text-gray-700">To Status</th>
                    <th className="p-3 text-left text-sm font-semibold text-gray-700">📧 Email Action</th>
                    <th className="p-3 text-left text-sm font-semibold text-gray-700 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {workflowRules.map((rule, idx) => (
                    <tr key={rule.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="p-2">
                        <Select 
                          value={rule.fromStage} 
                          onValueChange={(v) => handleUpdateRule(rule.id, 'fromStage', v)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select Stage" />
                          </SelectTrigger>
                          <SelectContent>
                            {stages.map(stage => (
                              <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Select 
                          value={rule.fromStatus} 
                          onValueChange={(v) => handleUpdateRule(rule.id, 'fromStatus', v)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select Status" />
                          </SelectTrigger>
                          <SelectContent>
                            {getStatusesForStage(rule.fromStage).map(status => (
                              <SelectItem key={status.id} value={status.id}>{status.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Select 
                          value={rule.trigger} 
                          onValueChange={(v) => handleUpdateRule(rule.id, 'trigger', v)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select Trigger" />
                          </SelectTrigger>
                          <SelectContent>
                            {PREDEFINED_TRIGGERS.map(trigger => (
                              <SelectItem key={trigger.id} value={trigger.id}>
                                <div className="flex flex-col">
                                  <span>{trigger.label}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        {rule.trigger === 'time_delay' ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min="0"
                              value={rule.delayDays || 0}
                              onChange={(e) => handleUpdateRule(rule.id, 'delayDays', parseInt(e.target.value) || 0)}
                              className="w-14 text-center"
                            />
                            <span className="text-xs text-gray-500">d</span>
                            <Input
                              type="number"
                              min="0"
                              max="23"
                              value={rule.delayHours || 0}
                              onChange={(e) => handleUpdateRule(rule.id, 'delayHours', parseInt(e.target.value) || 0)}
                              className="w-14 text-center"
                            />
                            <span className="text-xs text-gray-500">h</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </td>
                      <td className="p-2">
                        <Select 
                          value={rule.toStage} 
                          onValueChange={(v) => handleUpdateRule(rule.id, 'toStage', v)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select Stage" />
                          </SelectTrigger>
                          <SelectContent>
                            {stages.map(stage => (
                              <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Select 
                          value={rule.toStatus} 
                          onValueChange={(v) => handleUpdateRule(rule.id, 'toStatus', v)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select Status" />
                          </SelectTrigger>
                          <SelectContent>
                            {getStatusesForStage(rule.toStage).map(status => (
                              <SelectItem key={status.id} value={status.id}>{status.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Select 
                          value={rule.emailAction || 'none'} 
                          onValueChange={(v) => handleUpdateRule(rule.id, 'emailAction', v)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select Email" />
                          </SelectTrigger>
                          <SelectContent>
                            {getAllEmailTemplates().map(template => (
                              <SelectItem key={template.id} value={template.id}>
                                {template.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleDeleteRule(rule.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {workflowRules.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No workflow rules defined. Click &quot;Add Rule&quot; to create one.
                </div>
              )}
            </div>
          </TabsContent>

          {/* ==================== TAB 3: TIMER ALERTS ==================== */}
          <TabsContent value="timers" className="space-y-4 mt-4">
            <div className="flex justify-between items-center">
              <Button onClick={handleAddTimerRule} variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Timer Rule
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save All Changes'}
              </Button>
            </div>

            <Alert>
              <AlertDescription>
                Timer rules highlight orders that have been in a specific status for too long. The background color will appear on the OrderDesk dashboard.
              </AlertDescription>
            </Alert>

            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="p-3 text-left text-sm font-semibold text-gray-700">Stage</th>
                    <th className="p-3 text-left text-sm font-semibold text-gray-700">Status</th>
                    <th className="p-3 text-left text-sm font-semibold text-gray-700 w-24">Days</th>
                    <th className="p-3 text-left text-sm font-semibold text-gray-700 w-24">Hours</th>
                    <th className="p-3 text-left text-sm font-semibold text-gray-700 w-32">Highlight Color</th>
                    <th className="p-3 text-left text-sm font-semibold text-gray-700">Description</th>
                    <th className="p-3 text-left text-sm font-semibold text-gray-700 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {timerRules.map((rule, idx) => (
                    <tr key={rule.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="p-2">
                        <Select 
                          value={rule.stage} 
                          onValueChange={(v) => handleUpdateTimerRule(rule.id, 'stage', v)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select Stage" />
                          </SelectTrigger>
                          <SelectContent>
                            {stages.map(stage => (
                              <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Select 
                          value={rule.status} 
                          onValueChange={(v) => handleUpdateTimerRule(rule.id, 'status', v)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select Status" />
                          </SelectTrigger>
                          <SelectContent>
                            {getStatusesForStage(rule.stage).map(status => (
                              <SelectItem key={status.id} value={status.id}>{status.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          min="0"
                          value={rule.days}
                          onChange={(e) => handleUpdateTimerRule(rule.id, 'days', parseInt(e.target.value) || 0)}
                          className="w-full"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          min="0"
                          max="23"
                          value={rule.hours}
                          onChange={(e) => handleUpdateTimerRule(rule.id, 'hours', parseInt(e.target.value) || 0)}
                          className="w-full"
                        />
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={rule.backgroundColor}
                            onChange={(e) => handleUpdateTimerRule(rule.id, 'backgroundColor', e.target.value)}
                            className="w-10 h-8 cursor-pointer border rounded"
                          />
                          <Input
                            value={rule.backgroundColor}
                            onChange={(e) => handleUpdateTimerRule(rule.id, 'backgroundColor', e.target.value)}
                            className="w-24 text-xs"
                          />
                        </div>
                      </td>
                      <td className="p-2">
                        <Input
                          value={rule.description}
                          onChange={(e) => handleUpdateTimerRule(rule.id, 'description', e.target.value)}
                          placeholder="Optional description"
                          className="w-full"
                        />
                      </td>
                      <td className="p-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleDeleteTimerRule(rule.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {timerRules.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No timer rules defined. Click &quot;Add Timer Rule&quot; to create one.
                </div>
              )}
            </div>
          </TabsContent>

          {/* ==================== TAB 4: EMAIL TEMPLATES ==================== */}
          <TabsContent value="emails" className="space-y-4 mt-4">
            <Alert>
              <Mail className="h-4 w-4" />
              <AlertDescription>
                Create custom email templates to use in workflow rules. Templates can include variables like {'{customer_name}'}, {'{order_number}'}, {'{stage}'}, and {'{status}'}.
              </AlertDescription>
            </Alert>

            {/* Create New Template */}
            <div className="border rounded-lg p-4 bg-gray-50">
              <h3 className="font-semibold mb-3">Create New Email Template</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm">Template Name</Label>
                    <Input
                      value={newTemplate.name}
                      onChange={(e) => setNewTemplate({...newTemplate, name: e.target.value})}
                      placeholder="e.g., Production Update"
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Description</Label>
                    <Input
                      value={newTemplate.description}
                      onChange={(e) => setNewTemplate({...newTemplate, description: e.target.value})}
                      placeholder="Brief description of when to use this template"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-sm">Email Subject</Label>
                  <Input
                    value={newTemplate.subject}
                    onChange={(e) => setNewTemplate({...newTemplate, subject: e.target.value})}
                    placeholder="e.g., Order #{order_number} - Production Update"
                  />
                </div>
                <div>
                  <Label className="text-sm">Email Body (HTML supported)</Label>
                  <textarea
                    value={newTemplate.body}
                    onChange={(e) => setNewTemplate({...newTemplate, body: e.target.value})}
                    placeholder="Hi {customer_name},&#10;&#10;Your order #{order_number} has been updated...&#10;&#10;Best regards"
                    className="w-full h-32 p-2 border rounded-md text-sm font-mono"
                  />
                </div>
                <div className="text-xs text-gray-500 bg-white p-2 rounded border">
                  <strong>Available variables:</strong> {'{customer_name}'}, {'{customer_email}'}, {'{order_number}'}, {'{stage}'}, {'{status}'}, {'{company_name}'}
                </div>
                <Button onClick={handleCreateTemplate}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Template
                </Button>
              </div>
            </div>

            {/* Existing Templates */}
            <div className="space-y-3">
              <h3 className="font-semibold">Your Custom Templates ({customTemplates.length})</h3>
              
              {customTemplates.length === 0 ? (
                <div className="text-center py-8 text-gray-500 border rounded-lg">
                  No custom templates yet. Create one above to use in workflow rules.
                </div>
              ) : (
                <div className="grid gap-3">
                  {customTemplates.map(template => (
                    <div key={template.id} className="border rounded-lg p-4 bg-white">
                      {editingTemplate?.id === template.id ? (
                        // Edit mode
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-sm">Template Name</Label>
                              <Input
                                value={editingTemplate.name}
                                onChange={(e) => setEditingTemplate({...editingTemplate, name: e.target.value})}
                              />
                            </div>
                            <div>
                              <Label className="text-sm">Description</Label>
                              <Input
                                value={editingTemplate.description}
                                onChange={(e) => setEditingTemplate({...editingTemplate, description: e.target.value})}
                              />
                            </div>
                          </div>
                          <div>
                            <Label className="text-sm">Subject</Label>
                            <Input
                              value={editingTemplate.subject}
                              onChange={(e) => setEditingTemplate({...editingTemplate, subject: e.target.value})}
                            />
                          </div>
                          <div>
                            <Label className="text-sm">Body</Label>
                            <textarea
                              value={editingTemplate.body}
                              onChange={(e) => setEditingTemplate({...editingTemplate, body: e.target.value})}
                              className="w-full h-32 p-2 border rounded-md text-sm font-mono"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button onClick={handleUpdateTemplate} size="sm">
                              <Save className="w-4 h-4 mr-2" />
                              Save Changes
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setEditingTemplate(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        // View mode
                        <div>
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-medium">{template.name}</h4>
                              <p className="text-sm text-gray-500">{template.description}</p>
                            </div>
                            <div className="flex gap-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => setEditingTemplate(template)}
                              >
                                Edit
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleDeleteTemplate(template.id)}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
                            <span className="text-gray-500">Subject:</span> {template.subject}
                          </div>
                          <div className="mt-2 p-2 bg-gray-50 rounded text-sm font-mono text-xs max-h-20 overflow-y-auto whitespace-pre-wrap">
                            {template.body || '(No body content)'}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Predefined Templates Reference */}
            <div className="border rounded-lg p-4 bg-blue-50">
              <h3 className="font-semibold mb-2 text-blue-800">Built-in Templates</h3>
              <p className="text-sm text-blue-700 mb-2">These templates are always available in workflow rules:</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {EMAIL_TEMPLATES.filter(t => t.id !== 'none' && t.id !== 'custom').map(template => (
                  <div key={template.id} className="flex items-center gap-2 text-blue-600">
                    <Mail className="w-3 h-3" />
                    {template.label}
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ ...deleteDialog, open: false })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="w-5 h-5" />
              Warning: Item In Use
            </DialogTitle>
            <DialogDescription>
              {deleteDialog.type === 'stage' && (
                <>The stage &quot;{deleteDialog.item?.name}&quot; is used in {deleteDialog.usedIn.length} rule(s)/timer(s).</>
              )}
              {deleteDialog.type === 'status' && (
                <>The status &quot;{deleteDialog.item?.name}&quot; is used in {deleteDialog.usedIn.length} rule(s)/timer(s).</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600 mb-2">Deleting this will also remove:</p>
            <ul className="text-sm list-disc pl-5 space-y-1">
              {deleteDialog.usedIn.map((usage, idx) => (
                <li key={idx} className="text-gray-500">
                  {usage.type === 'rule' ? 'Workflow Rule' : 'Timer Rule'}: {getStageName(usage.item.fromStage || usage.item.stage)} → {getStatusName(usage.item.fromStage || usage.item.stage, usage.item.fromStatus || usage.item.status)}
                </li>
              ))}
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ ...deleteDialog, open: false })}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
