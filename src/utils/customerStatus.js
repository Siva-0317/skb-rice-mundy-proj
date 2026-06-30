import { OVERDUE_DAYS_THRESHOLD } from './constants';

const toDateObject = (dateVal) => {
  if (!dateVal) return null;
  if (typeof dateVal.toDate === 'function') {
    return dateVal.toDate();
  }
  if (dateVal instanceof Date) {
    return dateVal;
  }
  if (typeof dateVal.seconds === 'number') {
    return new Date(dateVal.seconds * 1000);
  }
  const parsed = new Date(dateVal);
  return isNaN(parsed.getTime()) ? null : parsed;
};

export const getCustomerStatus = (customer) => {
  if (!customer) return 'settled';
  const balance = Number(customer.balance) || 0;
  if (balance <= 0) return 'settled';

  const refDateVal = customer.lastPayment || customer.createdAt;
  const referenceDate = toDateObject(refDateVal);

  if (!referenceDate) {
    return 'active';
  }

  const now = new Date();
  const diffTime = now.getTime() - referenceDate.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);

  if (diffDays > OVERDUE_DAYS_THRESHOLD) {
    return 'overdue';
  }
  return 'active';
};
