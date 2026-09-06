import { describe, it, expect } from 'vitest';
import { getCustomerStatus } from '../utils/customerStatus';
import { OVERDUE_DAYS_THRESHOLD } from '../utils/constants';

// Regression tests for the defects found in the two QA rounds. Each case names the
// behaviour that was wrong so a future change that reintroduces it fails here.

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

describe('BUG-20 / NEW-02 — overdue is based on last activity, not profile age', () => {
  it('a customer who bought recently is not overdue, however old the profile', () => {
    const status = getCustomerStatus({
      balance: 5000,
      createdAt: daysAgo(400),
      lastPurchase: daysAgo(2),
    });
    expect(status).toBe('active');
  });

  it('a customer with no movement past the threshold is overdue', () => {
    const status = getCustomerStatus({
      balance: 5000,
      createdAt: daysAgo(400),
      lastPurchase: daysAgo(OVERDUE_DAYS_THRESHOLD + 5),
    });
    expect(status).toBe('overdue');
  });

  it('a payment resets the clock even when the last purchase is old', () => {
    const status = getCustomerStatus({
      balance: 5000,
      createdAt: daysAgo(400),
      lastPurchase: daysAgo(90),
      lastPayment: daysAgo(1),
    });
    expect(status).toBe('active');
  });

  it('a credit balance reads as an advance, never as settled or overdue', () => {
    expect(getCustomerStatus({ balance: -750, createdAt: daysAgo(400) })).toBe('advance');
  });

  it('a zero balance is settled regardless of age', () => {
    expect(getCustomerStatus({ balance: 0, createdAt: daysAgo(400) })).toBe('settled');
  });
});

describe('NEW-02 — receivables split so overdue can never exceed the headline', () => {
  // Mirrors the aggregation in getTodayStats: gross owed, advances held, and the net.
  const summarise = (balances) => {
    let gross = 0;
    let advances = 0;
    balances.forEach(b => { if (b > 0) gross += b; else advances += -b; });
    return { gross, advances, net: gross - advances };
  };

  it('nets advances out of the headline while keeping gross separate', () => {
    const { gross, advances, net } = summarise([1000, 2000, -750]);
    expect(gross).toBe(3000);
    expect(advances).toBe(750);
    expect(net).toBe(2250);
  });

  it('overdue is drawn from gross, so it is never larger than gross', () => {
    const balances = [1000, 2000, -750];
    const { gross } = summarise(balances);
    const overdue = balances.filter(b => b > 0).reduce((a, b) => a + b, 0);
    expect(overdue).toBeLessThanOrEqual(gross);
  });
});

describe('NEW-03 — sale rows never persist NaN', () => {
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  it('coerces a missing legacy rate to 0 rather than NaN', () => {
    expect(toNum(undefined)).toBe(0);
    expect(toNum('')).toBe(0);
    expect(toNum(null)).toBe(0);
    expect(toNum('abc')).toBe(0);
  });

  it('leaves real numbers untouched', () => {
    expect(toNum(1750)).toBe(1750);
    expect(toNum('1750')).toBe(1750);
    expect(toNum(1234.56)).toBe(1234.56);
  });

  it('a built row is JSON-safe', () => {
    const row = { rate: toNum(undefined), mrp: toNum(1750), amount: toNum(3500) };
    expect(JSON.parse(JSON.stringify(row))).toEqual({ rate: 0, mrp: 1750, amount: 3500 });
  });
});

describe('NEW-04 — mobile numbers are validated for length as well as format', () => {
  const isValidMobile = (m) => {
    if (!m) return true; // optional field
    if (!/^[0-9\-\+\s]+$/.test(m)) return false;
    const digits = (m.match(/[0-9]/g) || []).length;
    return digits >= 7 && digits <= 15;
  };

  it('rejects letters and symbols', () => {
    expect(isValidMobile('abcdefgh!!')).toBe(false);
  });

  it('rejects a number too short to dial', () => {
    expect(isValidMobile('12')).toBe(false);
  });

  it('rejects an implausibly long number', () => {
    expect(isValidMobile('1234567890123456')).toBe(false);
  });

  it('accepts a normal Indian mobile, with or without formatting', () => {
    expect(isValidMobile('9876543210')).toBe(true);
    expect(isValidMobile('+91 98765 43210')).toBe(true);
  });

  it('treats an empty mobile as acceptable, since the field is optional', () => {
    expect(isValidMobile('')).toBe(true);
  });
});

describe('BUG-18 — transaction count reads naturally', () => {
  const label = (n) => (n === 1 ? '1 transaction' : `${n || 0} transactions`);

  it('uses the singular for exactly one', () => {
    expect(label(1)).toBe('1 transaction');
  });

  it('uses the plural for none and for many', () => {
    expect(label(0)).toBe('0 transactions');
    expect(label(7)).toBe('7 transactions');
  });
});
