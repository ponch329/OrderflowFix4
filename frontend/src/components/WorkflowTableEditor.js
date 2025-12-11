import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Save, Clock } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const BACKEND_URL = window.location.origin;
const API = `${BACKEND_URL}/api`;

export default function WorkflowTableEditor() {
  const [workflowRules, setWorkflowRules] = useState([]);
  const [timerRules, setTimerRules] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadWorkflowRules();
  }, []);

  const loadWorkflowRules = async () => {
    try {
      const response = await axios.get(`${API}/settings/tenant`);
      const settings = response.data.settings || {};
      
      // Convert existing workflow config to table format
      const rules = convertWorkflowToRules(settings.workflow || {});
      setWorkflowRules(rules);
    } catch (error) {
      console.error("Failed to load workflow rules:", error);
      // Set default rules
      setWorkflowRules(getDefaultRules());
    }
  };

  const getDefaultRules = () => [
    { id: 1, stage: 'Clay', status: 'In Progress', triggeredBy: 'A new order enters the system', nextStage: 'Clay', nextStatus: 'Feedback Needed' },
    { id: 2, stage: 'Clay', status: 'Feedback Needed', triggeredBy: 'Admin uploads Clay proofs', nextStage: 'Clay', nextStatus: 'Either Changes Requested or Approved' },
    { id: 3, stage: 'Clay', status: 'Changes Requested', triggeredBy: 'Customer Requests Changes to their Clay proofs', nextStage: 'Clay', nextStatus: 'Feedback Needed' },
    { id: 4, stage: 'Clay', status: 'Approved', triggeredBy: 'Customer Approves their Clay proofs', nextStage: 'Paint', nextStatus: 'In Progress' },
    { id: 5, stage: 'Paint', status: 'In Progress', triggeredBy: 'An order has been in Clay Approved for 24 hours', nextStage: 'Paint', nextStatus: 'Feedback Needed' },
    { id: 6, stage: 'Paint', status: 'Feedback Needed', triggeredBy: 'Admin uploads Paint proofs', nextStage: 'Paint', nextStatus: 'Either Changes Requested or Approved' },
    { id: 7, stage: 'Paint', status: 'Changes Requested', triggeredBy: 'Customer Requests Changes to their Paint proofs', nextStage: 'Paint', nextStatus: 'Feedback Needed' },
    { id: 8, stage: 'Paint', status: 'Approved', triggeredBy: 'Customer Approves their Paint Proofs', nextStage: 'Paint', nextStatus: 'Approved' },
  ];

  const convertWorkflowToRules = (workflow) => {
    // For now, return default rules - this can be enhanced to parse existing config
    return getDefaultRules();
  };

  const handleAddRule = () => {
    const newRule = {
      id: Date.now(),
      stage: '',
      status: '',
      triggeredBy: '',
      nextStage: '',
      nextStatus: ''
    };
    setWorkflowRules([...workflowRules, newRule]);
  };

  const handleUpdateRule = (id, field, value) => {
    setWorkflowRules(rules => 
      rules.map(rule => 
        rule.id === id ? { ...rule, [field]: value } : rule
      )
    );
  };

  const handleDeleteRule = (id) => {
    setWorkflowRules(rules => rules.filter(rule => rule.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Convert rules back to workflow config format
      const workflowConfig = convertRulesToWorkflow(workflowRules);
      
      await axios.patch(`${API}/settings/tenant`, {
        settings: { workflow: workflowConfig }
      });

      toast.success("Workflow rules saved successfully!");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save workflow rules");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const convertRulesToWorkflow = (rules) => {
    // Extract unique stages
    const stages = [...new Set(rules.map(r => r.stage?.toLowerCase()).filter(Boolean))];
    
    // Build stage labels, transitions, etc.
    const stageLabels = {};
    const stageTransitions = {};
    const stageRequiresApproval = {};
    
    stages.forEach(stage => {
      stageLabels[stage] = stage.charAt(0).toUpperCase() + stage.slice(1);
      stageRequiresApproval[stage] = true;
      
      // Find transition rules for this stage
      const approvalRule = rules.find(r => 
        r.stage?.toLowerCase() === stage && 
        r.status?.toLowerCase().includes('approved') &&
        r.nextStage?.toLowerCase() !== stage
      );
      
      if (approvalRule && approvalRule.nextStage) {
        stageTransitions[stage] = approvalRule.nextStage.toLowerCase();
      }
    });

    return {
      stages,
      stage_labels: stageLabels,
      stage_transitions: stageTransitions,
      stage_requires_customer_approval: stageRequiresApproval,
      status_labels: {
        pending: 'Pending',
        sculpting: 'In Progress',
        painting: 'Painting',
        feedback_needed: 'Feedback Needed',
        changes_requested: 'Changes Requested',
        approved: 'Approved'
      },
      auto_advance_on_approval: true,
      status_after_upload: 'feedback_needed',
      notify_customer_on_upload: true,
      notify_admin_on_customer_response: true,
      workflow_rules: rules // Store the raw rules for future editing
    };
  };

  const getDefaultTimerRules = () => [
    { id: 1, stage: 'Clay', status: 'In Progress', days: 2, hours: 0, backgroundColor: '#ffebcc', description: 'Clay stage taking longer than expected' },
    { id: 2, stage: 'Clay', status: 'Feedback Needed', days: 1, hours: 0, backgroundColor: '#ffe0e0', description: 'Customer hasn\'t reviewed clay proofs' },
    { id: 3, stage: 'Paint', status: 'In Progress', days: 2, hours: 0, backgroundColor: '#ffebcc', description: 'Paint stage taking longer than expected' },
    { id: 4, stage: 'Paint', status: 'Feedback Needed', days: 1, hours: 0, backgroundColor: '#ffe0e0', description: 'Customer hasn\'t reviewed paint proofs' },
  ];

  const handleAddTimerRule = () => {
    const newRule = {
      id: Date.now(),
      stage: '',
      status: '',
      days: 0,
      hours: 0,
      backgroundColor: '#ffebcc',
      description: ''
    };
    setTimerRules([...timerRules, newRule]);
  };

  const handleUpdateTimerRule = (id, field, value) => {
    setTimerRules(rules => 
      rules.map(rule => 
        rule.id === id ? { ...rule, [field]: value } : rule
      )
    );
  };

  const handleDeleteTimerRule = (id) => {
    setTimerRules(rules => rules.filter(rule => rule.id !== id));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workflow Configuration</CardTitle>
        <CardDescription>
          Manage workflow rules and timing alerts
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="rules" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="rules">Workflow Rules</TabsTrigger>
            <TabsTrigger value="timers">
              <Clock className="w-4 h-4 mr-2" />
              Timer Alerts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rules" className="space-y-4 mt-4">
        <div className="mb-4 flex justify-between items-center">
          <Button onClick={handleAddRule} variant="outline" size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add Rule
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Workflow'}
          </Button>
        </div>

        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-3 text-left text-sm font-semibold text-gray-700 w-32">Stage</th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700 w-40">Status</th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700 flex-1">Triggered by</th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700 w-32">Next Stage</th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700 w-40">Next Status</th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {workflowRules.map((rule, idx) => (
                <tr key={rule.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="p-2">
                    <Input
                      value={rule.stage}
                      onChange={(e) => handleUpdateRule(rule.id, 'stage', e.target.value)}
                      placeholder="Clay"
                      className="text-sm"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={rule.status}
                      onChange={(e) => handleUpdateRule(rule.id, 'status', e.target.value)}
                      placeholder="In Progress"
                      className="text-sm"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={rule.triggeredBy}
                      onChange={(e) => handleUpdateRule(rule.id, 'triggeredBy', e.target.value)}
                      placeholder="Admin uploads proofs"
                      className="text-sm"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={rule.nextStage}
                      onChange={(e) => handleUpdateRule(rule.id, 'nextStage', e.target.value)}
                      placeholder="Clay"
                      className="text-sm"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={rule.nextStatus}
                      onChange={(e) => handleUpdateRule(rule.id, 'nextStatus', e.target.value)}
                      placeholder="Feedback Needed"
                      className="text-sm"
                    />
                  </td>
                  <td className="p-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteRule(rule.id)}
                      className="h-8 w-8"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {workflowRules.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>No workflow rules defined. Click "Add Rule" to get started.</p>
          </div>
        )}

        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-semibold text-blue-900 mb-2">How to Use</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Each row represents a transition rule in your workflow</li>
            <li>• <strong>Stage</strong> and <strong>Status</strong> define the current state of an order</li>
            <li>• <strong>Triggered by</strong> describes what action causes the transition</li>
            <li>• <strong>Next Stage</strong> and <strong>Next Status</strong> define where the order moves to</li>
            <li>• Click "Add Rule" to create new workflow transitions</li>
            <li>• Click the trash icon to delete a rule</li>
          </ul>
        </div>
      </TabsContent>

      <TabsContent value="timers" className="space-y-4 mt-4">
        <div className="mb-4 flex justify-between items-center">
          <Button onClick={handleAddTimerRule} variant="outline" size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add Timer Rule
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Timers'}
          </Button>
        </div>

        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-3 text-left text-sm font-semibold text-gray-700 w-32">Stage</th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700 w-40">Status</th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700 w-24">Days</th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700 w-24">Hours</th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700 w-40">Background Color</th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700 flex-1">Description</th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {(timerRules.length > 0 ? timerRules : getDefaultTimerRules()).map((rule, idx) => (
                <tr key={rule.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="p-2">
                    <Input
                      value={rule.stage}
                      onChange={(e) => handleUpdateTimerRule(rule.id, 'stage', e.target.value)}
                      placeholder="Clay"
                      className="text-sm"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={rule.status}
                      onChange={(e) => handleUpdateTimerRule(rule.id, 'status', e.target.value)}
                      placeholder="In Progress"
                      className="text-sm"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      min="0"
                      value={rule.days}
                      onChange={(e) => handleUpdateTimerRule(rule.id, 'days', parseInt(e.target.value) || 0)}
                      className="text-sm"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      min="0"
                      max="23"
                      value={rule.hours}
                      onChange={(e) => handleUpdateTimerRule(rule.id, 'hours', parseInt(e.target.value) || 0)}
                      className="text-sm"
                    />
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={rule.backgroundColor}
                        onChange={(e) => handleUpdateTimerRule(rule.id, 'backgroundColor', e.target.value)}
                        className="w-10 h-8 rounded cursor-pointer"
                      />
                      <Input
                        value={rule.backgroundColor}
                        onChange={(e) => handleUpdateTimerRule(rule.id, 'backgroundColor', e.target.value)}
                        placeholder="#ffebcc"
                        className="text-sm flex-1"
                      />
                    </div>
                  </td>
                  <td className="p-2">
                    <Input
                      value={rule.description}
                      onChange={(e) => handleUpdateTimerRule(rule.id, 'description', e.target.value)}
                      placeholder="Order taking too long"
                      className="text-sm"
                    />
                  </td>
                  <td className="p-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteTimerRule(rule.id)}
                      className="h-8 w-8"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <h4 className="font-semibold text-amber-900 mb-2">How Timer Alerts Work</h4>
          <ul className="text-sm text-amber-800 space-y-1">
            <li>• Set time thresholds for each Stage/Status combination</li>
            <li>• When an order exceeds the time limit, the background color will change on the dashboard</li>
            <li>• <strong>Days</strong> and <strong>Hours</strong> define how long before the alert triggers</li>
            <li>• <strong>Background Color</strong> is the highlight color applied to overdue orders</li>
            <li>• Use different colors for different urgency levels (yellow=warning, red=urgent)</li>
            <li>• This helps you quickly identify orders that need immediate attention</li>
          </ul>
        </div>
      </TabsContent>
    </Tabs>
      </CardContent>
    </Card>
  );
}
