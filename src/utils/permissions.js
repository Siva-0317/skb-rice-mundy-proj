/**
 * Role-Based Access Control (RBAC)
 */

export const canEditMasters = (role) => {
  return role === 'owner';
};

export const canDeleteRecords = (role) => {
  // Hard requirement: nobody can delete records, only compensate/adjust
  return false;
};
