// Helper functions for order status management

export const getStatusInfo = (status, stage = null) => {
  const statusMap = {
    sculpting: {
      label: "Sculpting",
      color: "bg-gray-500",
      customerLabel: stage === "paint" ? "Painting in Progress" : "Sculpting in Progress",
      adminLabel: stage === "paint" ? "Painting" : "Sculpting"
    },
    feedback_needed: {
      label: "Feedback Needed",
      color: "bg-blue-500",
      customerLabel: "Customer Feedback Needed",
      adminLabel: "Awaiting Customer Approval"
    },
    approved: {
      label: "Approved",
      color: "bg-green-500",
      customerLabel: "Approved",
      adminLabel: "Approved"
    },
    changes_requested: {
      label: "Changes Requested",
      color: "bg-orange-500",
      customerLabel: "Changes Requested",
      adminLabel: "Revisions Needed"
    },
    pending: {
      label: "Pending",
      color: "bg-gray-400",
      customerLabel: "Not Started",
      adminLabel: "Pending"
    }
  };

  return statusMap[status] || statusMap.pending;
};

export const getStageInfo = (stage) => {
  const stageMap = {
    clay: {
      label: "Clay",
      color: "bg-yellow-500"
    },
    paint: {
      label: "Paint",
      color: "bg-blue-500"
    },
    shipped: {
      label: "Shipped",
      color: "bg-green-500"
    }
  };

  return stageMap[stage] || stageMap.clay;
};

export const canCustomerInteract = (order, stage) => {
  const statusField = `${stage}_status`;
  const status = order[statusField];
  
  // Customer can only interact when feedback is needed
  return status === "feedback_needed" && order.stage === stage;
};

export const shouldShowPingButton = (order, stage) => {
  // Always show ping button for admin - they may need to remind customer anytime
  return true;
};
