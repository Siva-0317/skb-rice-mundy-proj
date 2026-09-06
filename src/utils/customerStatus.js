import { OVERDUE_DAYS_THRESHOLD } from './constants';
import { toDateObj as toDateObject } from './dateIST';

export const getCustomerStatus = (customer) => {
  if (!customer) return 'settled';
  const balance = Number(customer.balance) || 0;
  if (balance < 0) return 'advance';
  if (balance === 0) return 'settled';

  // The overdue clock runs from the customer's last activity, not from the day their
  // profile was created. Using createdAt alone meant every customer who had ever
  // carried a balance for longer than the threshold was permanently flagged overdue —
  // including one who bought yesterday — which made the flag meaningless. Falling back
  // through lastPayment -> lastPurchase -> createdAt means a fresh transaction resets
  // the clock, so "overdue" reads as "nothing has moved on this account in N days".
  const refDateVal = customer.lastPayment || customer.lastPurchase || customer.createdAt;
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
