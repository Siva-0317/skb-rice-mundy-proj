import { describe, it, expect } from 'vitest';

describe('4. Input Validation & Sanitization Suite', () => {
  it('validates 10-digit Indian mobile numbers accurately', () => {
    const isValidPhone = (phone) => /^[6-9]\d{9}$/.test(phone);

    expect(isValidPhone('9876543210')).toBe(true);
    expect(isValidPhone('6123456789')).toBe(true);
    expect(isValidPhone('12345')).toBe(false); // too short
    expect(isValidPhone('98765432101')).toBe(false); // too long
    expect(isValidPhone('987654321a')).toBe(false); // non-numeric
    expect(isValidPhone('5123456789')).toBe(false); // doesn't start with 6-9
  });

  it('rejects negative stock or negative rates', () => {
    const validateStockInput = (val) => {
      const num = Number(val);
      if (isNaN(num) || num < 0) return { valid: false, error: 'Stock cannot be negative' };
      return { valid: true };
    };

    expect(validateStockInput('-10').valid).toBe(false);
    expect(validateStockInput('-0.5').valid).toBe(false);
    expect(validateStockInput('50').valid).toBe(true);
    expect(validateStockInput('0').valid).toBe(true);
  });

  it('handles malformed dates gracefully without application crash', () => {
    const safeFormatDate = (dateVal) => {
      try {
        if (!dateVal) return 'N/A';
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return 'Invalid Date';
        return d.toLocaleDateString('en-IN');
      } catch (e) {
        return 'Invalid Date';
      }
    };

    expect(safeFormatDate('2026-06-29')).not.toBe('Invalid Date');
    expect(safeFormatDate('not-a-date')).toBe('Invalid Date');
    expect(safeFormatDate(null)).toBe('N/A');
    expect(safeFormatDate({ malformed: true })).toBe('Invalid Date');
  });

  it('sanitizes text input against SQL/NoSQL injection and XSS tags', () => {
    const sanitizeInput = (str) => {
      if (typeof str !== 'string') return '';
      // Strip script tags and NoSQL operators ($gt, $ne, etc.)
      return str
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/[$\{\}]/g, '')
        .replace(/['";]/g, '')
        .trim();
    };

    const injectionPayload1 = `<script>alert('xss')</script>Normal Name`;
    const injectionPayload2 = `{"$gt": ""}`;
    const sqlInjection = `Admin'; DROP TABLE users; --`;

    expect(sanitizeInput(injectionPayload1)).toBe('Normal Name');
    expect(sanitizeInput(injectionPayload2)).toBe('gt:');
    expect(sanitizeInput(sqlInjection)).toBe('Admin DROP TABLE users --');
  });
});
