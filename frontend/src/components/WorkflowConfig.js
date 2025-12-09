import { useState, useEffect } from "react";
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
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Save, 
  Download, 
  Upload, 
  Trash2, 
  Plus, 
  GripVertical, 
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  Clock,
  History
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = window.location.origin;
const API = `${BACKEND_URL}/api`;

// Sortable Stage Item Component
function SortableStageItem({ stage, index, onUpdate, onDelete, stagesInUse }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isInUse = stagesInUse[stage.name] > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white border rounded-lg p-4 mb-2 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex items-center gap-3">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
          <GripVertical className="w-5 h-5 text-gray-400" />
        </div>
        
        <div className="flex-1 grid grid-cols-3 gap-4">
          <div>
            <Label className="text-xs text-gray-500">Stage Name</Label>
            <Input
              value={stage.name}
              onChange={(e) => onUpdate(index, { ...stage, name: e.target.value })}
              placeholder="clay"
              className="mt-1"
            />
          </div>
          
          <div>
            <Label className="text-xs text-gray-500">Display Label</Label>
            <Input
              value={stage.label}
              onChange={(e) => onUpdate(index, { ...stage, label: e.target.value })}
              placeholder="Clay Stage"
              className="mt-1"
            />
          </div>
          
          <div>
            <Label className="text-xs text-gray-500">Next Stage</Label>
            <Input
              value={stage.nextStage || ""}
              onChange={(e) => onUpdate(index, { ...stage, nextStage: e.target.value })}
              placeholder="paint (or leave empty)"
              className="mt-1"
            />
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-center">
            <Label className="text-xs text-gray-500 mb-1">Requires Approval</Label>
            <Switch
              checked={stage.requiresApproval}
              onCheckedChange={(checked) => onUpdate(index, { ...stage, requiresApproval: checked })}
            />
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(index)}
            disabled={isInUse}
            title={isInUse ? `Cannot delete: ${stagesInUse[stage.name]} orders in this stage` : "Delete stage"}
          >
            <Trash2 className={`w-4 h-4 ${isInUse ? 'text-gray-300' : 'text-red-500'}`} />
          </Button>
        </div>
      </div>
      
      {isInUse && (
        <div className="mt-2 flex items-center gap-2 text-xs text-amber-600">
          <AlertTriangle className="w-3 h-3" />
          <span>{stagesInUse[stage.name]} active orders in this stage</span>
        </div>
      )}
    </div>
  );
}

export default function WorkflowConfig({ initialSettings, onSave }) {
  const [workflowSettings, setWorkflowSettings] = useState(initialSettings || {});
  const [stages, setStages] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [validationIssues, setValidationIssues] = useState([]);
  const [stagesInUse, setStagesInUse] = useState({});
  const [auditLogs, setAuditLogs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    // Convert workflow settings to stage/status arrays
    if (initialSettings) {
      setWorkflowSettings(initialSettings);
      loadStagesFromSettings();
      loadStatusesFromSettings();
      fetchStagesInUse();
    }
  }, [initialSettings]);

  const loadStagesFromSettings = () => {
    const stageList = initialSettings?.stage_labels || [];
    const stageTrans = initialSettings?.stage_transitions || {};
    const stageApproval = initialSettings?.stage_requires_customer_approval || {};
    
    // Convert to array format for editing
    const stagesArray = [];
    const stageNames = ["clay", "paint", "shipped", "fulfilled", "canceled"];
    
    stageNames.forEach((name, idx) => {
      const label = Array.isArray(stageList) ? stageList[idx] : (stageList[name] || "");
      if (label && label.trim()) {
        stagesArray.push({
          id: `stage-${idx}`,
          name: name,
          label: label,
          nextStage: stageTrans[name] || "",
          requiresApproval: stageApproval[name] ?? true,
          order: idx
        });
      }
    });
    
    setStages(stagesArray);
  };

  const loadStatusesFromSettings = () => {
    const statusList = workflowSettings.status_labels || [];
    const statusArray = [];
    const statusNames = ["pending", "sculpting", "feedback_needed", "changes_requested", "approved"];
    
    statusNames.forEach((name, idx) => {
      const label = Array.isArray(statusList) ? statusList[idx] : (statusList[name] || "");
      if (label && label.trim()) {
        statusArray.push({
          id: `status-${idx}`,
          name: name,
          label: label,
          description: getStatusDescription(name)
        });
      }
    });
    
    setStatuses(statusArray);
  };

  const getStatusDescription = (statusName) => {
    const descriptions = {
      "pending": "Order received, awaiting work to begin",
      "sculpting": "Work in progress",
      "feedback_needed": "Awaiting customer review",
      "changes_requested": "Customer requested modifications",
      "approved": "Customer approved this stage"
    };
    return descriptions[statusName] || "";
  };

  const fetchStagesInUse = async () => {
    try {
      const response = await axios.get(`${API}/workflow/stages-in-use`);
      setStagesInUse(response.data.stages_in_use || {});
    } catch (error) {
      console.error("Failed to fetch stages in use:", error);
    }
  };

  const fetchAuditLogs = async () => {
    setLoadingAudit(true);
    try {
      const response = await axios.get(`${API}/workflow/audit-logs?limit=50`);
      setAuditLogs(response.data.logs || []);
    } catch (error) {
      toast.error("Failed to load audit logs");
      console.error(error);
    } finally {
      setLoadingAudit(false);
    }
  };

  const validateConfiguration = async () => {
    try {
      const config = buildConfigFromStages();
      const response = await axios.post(`${API}/workflow/validate`, config);
      setValidationIssues(response.data.issues || []);
      return response.data.valid;
    } catch (error) {
      console.error("Validation failed:", error);
      return false;
    }
  };

  const buildConfigFromStages = () => {
    const stageTransitions = {};
    const stageApproval = {};
    const stageLabels = {};
    const stageNames = [];

    stages.forEach(stage => {
      stageNames.push(stage.name);
      stageLabels[stage.name] = stage.label;
      stageTransitions[stage.name] = stage.nextStage || null;
      stageApproval[stage.name] = stage.requiresApproval;
    });

    const statusLabels = {};
    statuses.forEach(status => {
      statusLabels[status.name] = status.label;
    });

    return {
      stages: stageNames,
      stage_labels: stageLabels,
      stage_transitions: stageTransitions,
      stage_requires_customer_approval: stageApproval,
      status_labels: statusLabels,
      auto_advance_on_approval: workflowSettings.auto_advance_on_approval ?? true,
      require_admin_confirmation_for_stage_change: workflowSettings.require_admin_confirmation_for_stage_change ?? false,
      status_after_upload: workflowSettings.status_after_upload || "feedback_needed",
      notify_customer_on_upload: workflowSettings.notify_customer_on_upload ?? true,
      notify_admin_on_customer_response: workflowSettings.notify_admin_on_customer_response ?? true
    };
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setStages((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleAddStage = () => {
    const newStage = {
      id: `stage-${Date.now()}`,
      name: "",
      label: "",
      nextStage: "",
      requiresApproval: true,
      order: stages.length
    };
    setStages([...stages, newStage]);
  };

  const handleUpdateStage = (index, updatedStage) => {
    const newStages = [...stages];
    newStages[index] = updatedStage;
    setStages(newStages);
  };

  const handleDeleteStage = (index) => {
    if (stagesInUse[stages[index].name] > 0) {
      toast.error(`Cannot delete stage with active orders`);
      return;
    }
    setStages(stages.filter((_, idx) => idx !== index));
  };

  const handleAddStatus = () => {
    const newStatus = {
      id: `status-${Date.now()}`,
      name: "",
      label: "",
      description: ""
    };
    setStatuses([...statuses, newStatus]);
  };

  const handleUpdateStatus = (index, updatedStatus) => {
    const newStatuses = [...statuses];
    newStatuses[index] = updatedStatus;
    setStatuses(newStatuses);
  };

  const handleDeleteStatus = (index) => {
    setStatuses(statuses.filter((_, idx) => idx !== index));
  };

  const handleSaveWorkflow = async () => {
    setSaving(true);
    try {
      // Validate first
      const isValid = await validateConfiguration();
      if (!isValid) {
        toast.error("Please fix validation errors before saving");
        setSaving(false);
        return;
      }

      const config = buildConfigFromStages();
      
      // Save configuration
      await axios.patch(`${API}/settings/tenant`, {
        settings: { workflow: config }
      });

      // Log the change
      await axios.post(`${API}/workflow/log-change`, {
        action: "workflow_updated",
        section: "workflow",
        changes: { stages: stages.length, statuses: statuses.length }
      });

      toast.success("Workflow configuration saved successfully!");
      if (onSave) onSave();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save workflow configuration");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    try {
      const response = await axios.post(`${API}/workflow/export`);
      const dataStr = JSON.stringify(response.data, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `workflow-config-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      toast.success("Configuration exported successfully!");
    } catch (error) {
      toast.error("Failed to export configuration");
      console.error(error);
    }
  };

  const handleImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      const response = await axios.post(`${API}/workflow/import`, data);
      toast.success("Configuration imported successfully!");
      window.location.reload();
    } catch (error) {
      toast.error("Failed to import configuration");
      console.error(error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enhanced Workflow Configuration</CardTitle>
        <CardDescription>
          Manage stages, statuses, and workflow rules with drag-and-drop, validation, and audit logging
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="stages" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="stages">Stages</TabsTrigger>
            <TabsTrigger value="statuses">Statuses</TabsTrigger>
            <TabsTrigger value="rules">Rules</TabsTrigger>
            <TabsTrigger value="logic">Business Logic</TabsTrigger>
            <TabsTrigger value="audit" onClick={fetchAuditLogs}>Audit Log</TabsTrigger>
          </TabsList>

          {/* Stages Tab */}
          <TabsContent value="stages" className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold">Stage Configuration</h3>
                <p className="text-sm text-gray-500">Drag to reorder, define transitions, and set approval requirements</p>
              </div>
              <Button onClick={handleAddStage} size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Stage
              </Button>
            </div>

            {validationIssues.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h4 className="font-semibold text-amber-800 mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Validation Issues
                </h4>
                <ul className="space-y-1">
                  {validationIssues.map((issue, idx) => (
                    <li key={idx} className="text-sm text-amber-700">
                      • {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                <ArrowRight className="w-4 h-4" />
                Visual Workflow Flow
              </h4>
              <div className="flex items-center gap-2 flex-wrap">
                {stages.map((stage, idx) => (
                  <div key={stage.id} className="flex items-center gap-2">
                    <div className="bg-white px-4 py-2 rounded-lg border-2 border-blue-300 shadow-sm">
                      <span className="font-semibold text-blue-900">{stage.label || stage.name}</span>
                    </div>
                    {idx < stages.length - 1 && stage.nextStage && (
                      <ArrowRight className="w-5 h-5 text-blue-400" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={stages.map(s => s.id)}
                strategy={verticalListSortingStrategy}
              >
                {stages.map((stage, index) => (
                  <SortableStageItem
                    key={stage.id}
                    stage={stage}
                    index={index}
                    onUpdate={handleUpdateStage}
                    onDelete={handleDeleteStage}
                    stagesInUse={stagesInUse}
                  />
                ))}
              </SortableContext>
            </DndContext>

            {stages.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <p>No stages configured. Click "Add Stage" to get started.</p>
              </div>
            )}
          </TabsContent>

          {/* Statuses Tab */}
          <TabsContent value="statuses" className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold">Status Configuration</h3>
                <p className="text-sm text-gray-500">Define statuses that can be applied to any stage</p>
              </div>
              <Button onClick={handleAddStatus} size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Status
              </Button>
            </div>

            <div className="space-y-2">
              {statuses.map((status, index) => (
                <div key={status.id} className="bg-white border rounded-lg p-4 shadow-sm">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs text-gray-500">Status Name</Label>
                      <Input
                        value={status.name}
                        onChange={(e) => handleUpdateStatus(index, { ...status, name: e.target.value })}
                        placeholder="feedback_needed"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Display Label</Label>
                      <Input
                        value={status.label}
                        onChange={(e) => handleUpdateStatus(index, { ...status, label: e.target.value })}
                        placeholder="Feedback Needed"
                        className="mt-1"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteStatus(index)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2">
                    <Label className="text-xs text-gray-500">Description</Label>
                    <Input
                      value={status.description}
                      onChange={(e) => handleUpdateStatus(index, { ...status, description: e.target.value })}
                      placeholder="Description of what this status means"
                      className="mt-1"
                    />
                  </div>
                </div>
              ))}
            </div>

            {statuses.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <p>No statuses configured. Click "Add Status" to get started.</p>
              </div>
            )}
          </TabsContent>

          {/* Rules Tab */}
          <TabsContent value="rules" className="space-y-4">
            <h3 className="text-lg font-semibold">Workflow Rules & Behavior</h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="space-y-0.5">
                  <Label>Auto-Advance on Customer Approval</Label>
                  <p className="text-sm text-gray-500">
                    Automatically move order to next stage when customer approves
                  </p>
                </div>
                <Switch
                  checked={workflowSettings.auto_advance_on_approval ?? true}
                  onCheckedChange={(checked) => setWorkflowSettings({ ...workflowSettings, auto_advance_on_approval: checked })}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="space-y-0.5">
                  <Label>Require Admin Confirmation for Stage Changes</Label>
                  <p className="text-sm text-gray-500">
                    Admin must manually move order even after customer approval
                  </p>
                </div>
                <Switch
                  checked={workflowSettings.require_admin_confirmation_for_stage_change ?? false}
                  onCheckedChange={(checked) => setWorkflowSettings({ ...workflowSettings, require_admin_confirmation_for_stage_change: checked })}
                  disabled={!workflowSettings.auto_advance_on_approval}
                />
              </div>

              <div className="space-y-2">
                <Label>Status After Admin Uploads Proofs</Label>
                <select
                  className="w-full p-2 border rounded-md"
                  value={workflowSettings.status_after_upload || "feedback_needed"}
                  onChange={(e) => setWorkflowSettings({ ...workflowSettings, status_after_upload: e.target.value })}
                >
                  <option value="feedback_needed">Customer Feedback Needed</option>
                  <option value="sculpting">In Progress</option>
                  <option value="pending">Pending</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Notify Customer on Proof Upload</Label>
                  <p className="text-sm text-gray-500">
                    Send email when new proofs are uploaded
                  </p>
                </div>
                <Switch
                  checked={workflowSettings.notify_customer_on_upload ?? true}
                  onCheckedChange={(checked) => setWorkflowSettings({ ...workflowSettings, notify_customer_on_upload: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Notify Admin on Customer Response</Label>
                  <p className="text-sm text-gray-500">
                    Send email when customer approves or requests changes
                  </p>
                </div>
                <Switch
                  checked={workflowSettings.notify_admin_on_customer_response ?? true}
                  onCheckedChange={(checked) => setWorkflowSettings({ ...workflowSettings, notify_admin_on_customer_response: checked })}
                />
              </div>
            </div>
          </TabsContent>

          {/* Business Logic Tab */}
          <TabsContent value="logic" className="space-y-4">
            <h3 className="text-lg font-semibold">Business Logic Rules (Read-Only)</h3>
            <p className="text-sm text-gray-600">
              These are the if-then rules that govern how your workflow engine processes orders
            </p>

            <div className="space-y-2">
              <div className="bg-white border rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="bg-green-100 p-2 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold">When Customer Approves</h4>
                    <p className="text-sm text-gray-600 mt-1">
                      • Set status to "approved" for current stage<br />
                      {workflowSettings.auto_advance_on_approval && "• Automatically advance to next stage (if configured)"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white border rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="bg-amber-100 p-2 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold">When Customer Requests Changes</h4>
                    <p className="text-sm text-gray-600 mt-1">
                      • Set status to "changes_requested"<br />
                      • Stage remains the same<br />
                      • Notify admin if notifications enabled
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white border rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="bg-blue-100 p-2 rounded-lg">
                    <Upload className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold">When Admin Uploads Proofs</h4>
                    <p className="text-sm text-gray-600 mt-1">
                      • Set status to "{workflowSettings.status_after_upload || 'feedback_needed'}"<br />
                      {workflowSettings.notify_customer_on_upload && "• Send email notification to customer"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white border rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="bg-purple-100 p-2 rounded-lg">
                    <ArrowRight className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold">Stage Transitions</h4>
                    <p className="text-sm text-gray-600 mt-1">
                      • Stages can only transition forward or backward<br />
                      • Transitions follow configured "next stage" rules<br />
                      • Cannot skip stages in the flow
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Audit Log Tab */}
          <TabsContent value="audit" className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold">Audit Log</h3>
                <p className="text-sm text-gray-500">Track all workflow configuration changes</p>
              </div>
              <Button onClick={fetchAuditLogs} variant="outline" size="sm">
                <History className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>

            {loadingAudit ? (
              <div className="text-center py-8 text-gray-500">
                <p>Loading audit logs...</p>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No audit logs found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {auditLogs.map((log) => (
                  <div key={log.id} className="bg-white border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <Clock className="w-5 h-5 text-gray-400 mt-1" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{log.action.replace(/_/g, ' ')}</span>
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                              {log.section}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            By {log.user_email}
                          </p>
                          {log.changes && Object.keys(log.changes).length > 0 && (
                            <div className="text-xs text-gray-500 mt-1">
                              Changes: {JSON.stringify(log.changes)}
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-gray-400">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-6">
          <Button onClick={handleSaveWorkflow} disabled={saving} className="flex-1">
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save Workflow Configuration"}
          </Button>
          
          <Button onClick={handleExport} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          
          <Button variant="outline" onClick={() => document.getElementById('import-file').click()}>
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          <input
            id="import-file"
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
        </div>
      </CardContent>
    </Card>
  );
}
