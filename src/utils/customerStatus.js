import { OVERDUE_DAYS_THRESHOLD } from './constants';
import { toDateObj as toDateObject } from './dateIST';

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
