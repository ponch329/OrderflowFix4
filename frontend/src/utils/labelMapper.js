/**
 * Label Mapping Utility
 * Maps internal stage/status values to custom user-defined labels
 */

// Internal stage to index mapping
const STAGE_INDEX_MAP = {
  'clay': 0,
  'paint': 1,
  'shipped': 2,
  'fulfilled': 2, // Alias for shipped
  'quality_check': 3,
  'packaging': 4,
  'stage5': 5,
  'stage6': 6,
  'stage7': 7
};

// Internal status to index mapping
const STATUS_INDEX_MAP = {
  'pending': 0,
  'sculpting': 1,
  'feedback_needed': 2,
  'changes_requested': 3,
  'approved': 4,
  'status6': 5,
  'status7': 6,
  'status8': 7
};

// Default labels (fallback)
const DEFAULT_STAGE_LABELS = [
  'Clay Stage',
  'Paint Stage',
  'Shipped',
  'Stage 4',
  'Stage 5',
  'Stage 6',
  'Stage 7',
  'Stage 8'
];

const DEFAULT_STATUS_LABELS = [
  'Pending',
  'In Progress',
  'Customer Feedback Needed',
  'Changes Requested',
  'Approved',
  'Status 6',
  'Status 7',
  'Status 8'
];

/**
 * Get custom stage label for display
 * @param {string} internalStage - Internal stage value (clay, paint, shipped)
 * @param {object} workflowConfig - Workflow configuration object
 * @returns {string} Custom label or default
 */
export const getStageLabel = (internalStage, workflowConfig) => {
  if (!internalStage) return '';
  
  const stageIndex = STAGE_INDEX_MAP[internalStage.toLowerCase()];
  
  if (stageIndex === undefined) {
    // If not found in map, capitalize and return
    return internalStage.charAt(0).toUpperCase() + internalStage.slice(1);
  }
  
  const customLabel = workflowConfig?.stage_labels?.[stageIndex];
  
  // Return custom label if exists and not empty, otherwise return default
  if (customLabel && customLabel.trim()) {
    return customLabel;
  }
  
  return DEFAULT_STAGE_LABELS[stageIndex] || internalStage;
};

/**
 * Get custom status label for display
 * @param {string} internalStatus - Internal status value (sculpting, feedback_needed, etc.)
 * @param {object} workflowConfig - Workflow configuration object
 * @returns {string} Custom label or default
 */
export const getStatusLabel = (internalStatus, workflowConfig) => {
  if (!internalStatus) return '';
  
  const statusIndex = STATUS_INDEX_MAP[internalStatus.toLowerCase()];
  
  if (statusIndex === undefined) {
    // If not found in map, format and return
    return internalStatus.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }
  
  const customLabel = workflowConfig?.status_labels?.[statusIndex];
  
  // Return custom label if exists and not empty, otherwise return default
  if (customLabel && customLabel.trim()) {
    return customLabel;
  }
  
  return DEFAULT_STATUS_LABELS[statusIndex] || internalStatus;
};

/**
 * Get all active stage labels (non-empty)
 * @param {object} workflowConfig - Workflow configuration object
 * @returns {array} Array of {value, label} objects
 */
export const getActiveStages = (workflowConfig) => {
  const stages = [
    { value: 'clay', index: 0 },
    { value: 'paint', index: 1 },
    { value: 'shipped', index: 2 }
  ];
  
  return stages.map(stage => ({
    value: stage.value,
    label: getStageLabel(stage.value, workflowConfig)
  }));
};

/**
 * Get all active status labels (non-empty)
 * @param {object} workflowConfig - Workflow configuration object
 * @returns {array} Array of {value, label} objects
 */
export const getActiveStatuses = (workflowConfig) => {
  const statuses = [
    { value: 'pending', index: 0 },
    { value: 'sculpting', index: 1 },
    { value: 'feedback_needed', index: 2 },
    { value: 'changes_requested', index: 3 },
    { value: 'approved', index: 4 }
  ];
  
  return statuses.map(status => ({
    value: status.value,
    label: getStatusLabel(status.value, workflowConfig)
  }));
};

export default {
  getStageLabel,
  getStatusLabel,
  getActiveStages,
  getActiveStatuses
};
