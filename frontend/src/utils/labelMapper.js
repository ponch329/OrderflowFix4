/**
 * Label Mapping Utility
 * Maps internal stage/status values to custom user-defined labels from workflow config
 * 
 * REFACTORED: Now uses workflow_config from database as single source of truth
 * instead of hardcoded STAGE_INDEX_MAP and STATUS_INDEX_MAP
 */

/**
 * Get custom stage label for display
 * @param {string} internalStage - Internal stage value (e.g., 'clay', 'paint', 'shipped')
 * @param {object} workflowConfig - Workflow configuration object with stages array
 * @returns {string} Custom label or formatted default
 */
export const getStageLabel = (internalStage, workflowConfig) => {
  if (!internalStage) return '';
  
  const stageLower = internalStage.toLowerCase();
  
  // Look up stage in workflow config stages array
  const stages = workflowConfig?.stages || [];
  const stageConfig = stages.find(s => s.id?.toLowerCase() === stageLower);
  
  if (stageConfig?.name) {
    return stageConfig.name;
  }
  
  // Fallback: Capitalize first letter
  return internalStage.charAt(0).toUpperCase() + internalStage.slice(1);
};

/**
 * Get custom status label for display
 * @param {string} internalStatus - Internal status value (e.g., 'sculpting', 'feedback_needed')
 * @param {object} workflowConfig - Workflow configuration object with stages array
 * @param {string} stageId - Optional stage ID to scope the status lookup
 * @returns {string} Custom label or formatted default
 */
export const getStatusLabel = (internalStatus, workflowConfig, stageId = null) => {
  if (!internalStatus) return '';
  
  const statusLower = internalStatus.toLowerCase();
  const stages = workflowConfig?.stages || [];
  
  // If stageId provided, look in that stage first
  if (stageId) {
    const stage = stages.find(s => s.id?.toLowerCase() === stageId.toLowerCase());
    const statusInStage = stage?.statuses?.find(st => st.id?.toLowerCase() === statusLower);
    if (statusInStage?.name) {
      return statusInStage.name;
    }
  }
  
  // Search across all stages for the status
  for (const stage of stages) {
    const statusConfig = stage.statuses?.find(st => st.id?.toLowerCase() === statusLower);
    if (statusConfig?.name) {
      return statusConfig.name;
    }
  }
  
  // Fallback: Format status ID (replace underscores with spaces, capitalize)
  return internalStatus
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Get all active stages from workflow config
 * @param {object} workflowConfig - Workflow configuration object with stages array
 * @returns {array} Array of {value, label, statuses} objects
 */
export const getActiveStages = (workflowConfig) => {
  const stages = workflowConfig?.stages || [];
  
  return stages
    .filter(stage => stage.id !== 'archived') // Exclude archived from active stages
    .map(stage => ({
      value: stage.id,
      label: stage.name || stage.id,
      statuses: stage.statuses || []
    }));
};

/**
 * Get all active statuses for a specific stage
 * @param {object} workflowConfig - Workflow configuration object
 * @param {string} stageId - Stage ID to get statuses for
 * @returns {array} Array of {value, label} objects
 */
export const getStatusesForStage = (workflowConfig, stageId) => {
  const stages = workflowConfig?.stages || [];
  const stage = stages.find(s => s.id?.toLowerCase() === stageId?.toLowerCase());
  
  if (!stage?.statuses) return [];
  
  return stage.statuses.map(status => ({
    value: status.id,
    label: status.name || status.id
  }));
};

/**
 * Get all unique statuses across all stages
 * @param {object} workflowConfig - Workflow configuration object
 * @returns {array} Array of {value, label} objects with unique statuses
 */
export const getAllStatuses = (workflowConfig) => {
  const stages = workflowConfig?.stages || [];
  const statusMap = new Map();
  
  for (const stage of stages) {
    for (const status of (stage.statuses || [])) {
      if (!statusMap.has(status.id)) {
        statusMap.set(status.id, {
          value: status.id,
          label: status.name || status.id
        });
      }
    }
  }
  
  return Array.from(statusMap.values());
};

/**
 * Check if a stage exists in the workflow config
 * @param {string} stageId - Stage ID to check
 * @param {object} workflowConfig - Workflow configuration object
 * @returns {boolean}
 */
export const isValidStage = (stageId, workflowConfig) => {
  if (!stageId) return false;
  const stages = workflowConfig?.stages || [];
  return stages.some(s => s.id?.toLowerCase() === stageId.toLowerCase());
};

/**
 * Check if a status exists for a given stage in the workflow config
 * @param {string} statusId - Status ID to check
 * @param {string} stageId - Stage ID to scope the check
 * @param {object} workflowConfig - Workflow configuration object
 * @returns {boolean}
 */
export const isValidStatus = (statusId, stageId, workflowConfig) => {
  if (!statusId || !stageId) return false;
  const stages = workflowConfig?.stages || [];
  const stage = stages.find(s => s.id?.toLowerCase() === stageId.toLowerCase());
  if (!stage?.statuses) return false;
  return stage.statuses.some(st => st.id?.toLowerCase() === statusId.toLowerCase());
};

/**
 * Get the next stage in the workflow
 * @param {string} currentStageId - Current stage ID
 * @param {object} workflowConfig - Workflow configuration object
 * @returns {object|null} Next stage object or null if at end
 */
export const getNextStage = (currentStageId, workflowConfig) => {
  const stages = workflowConfig?.stages || [];
  const currentIndex = stages.findIndex(s => s.id?.toLowerCase() === currentStageId?.toLowerCase());
  
  if (currentIndex === -1 || currentIndex >= stages.length - 1) {
    return null;
  }
  
  return stages[currentIndex + 1];
};

export default {
  getStageLabel,
  getStatusLabel,
  getActiveStages,
  getStatusesForStage,
  getAllStatuses,
  isValidStage,
  isValidStatus,
  getNextStage
};
