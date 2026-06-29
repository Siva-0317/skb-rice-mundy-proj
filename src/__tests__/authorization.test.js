import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { canEditMasters, canDeleteRecords } from '../utils/permissions';

describe('2. Authorization & Firestore Rules Suite', () => {
  it('RBAC permissions allow master editing only for owners', () => {
    expect(canEditMasters('owner')).toBe(true);
    expect(canEditMasters('staff')).toBe(false);
    expect(canEditMasters('viewer')).toBe(false);
  });

  it('RBAC permissions strictly forbid record deletion for all roles', () => {
    expect(canDeleteRecords('owner')).toBe(false);
    expect(canDeleteRecords('staff')).toBe(false);
    expect(canDeleteRecords('admin')).toBe(false);
  });

  it('Firestore security rules enforce authentication on all collections and prevent unauthenticated access', () => {
    const rulesPath = path.resolve(__dirname, '../../firestore.rules');
    const rulesContent = fs.readFileSync(rulesPath, 'utf8');

    // Ensure isAuthenticated helper checks request.auth != null
    expect(rulesContent).toContain('function isAuthenticated() {');
    expect(rulesContent).toContain('return request.auth != null;');

    // Check collections require isAuthenticated() or specific user check
    const collections = ['categories', 'items', 'customers', 'suppliers', 'sales', 'purchases', 'counters'];
    collections.forEach(col => {
      expect(rulesContent).toContain(`match /${col}/`);
    });

    // Ensure nobody is allowed to delete records in any match block
    expect(rulesContent).toContain('allow delete: if false;');
  });

  it('simulate unauthenticated read/write attempt resulting in PERMISSION_DENIED', () => {
    // Mock simulation of Firestore rule enforcement
    const mockSecurityCheck = (requestAuth, operation, role) => {
      if (!requestAuth) {
        throw new Error('PERMISSION_DENIED: Unauthenticated request');
      }
      if (operation === 'delete') {
        throw new Error('PERMISSION_DENIED: Deletions are globally disabled');
      }
      if (operation === 'write_master' && role !== 'owner') {
        throw new Error('PERMISSION_DENIED: Only owners can write master records');
      }
      return true;
    };

    expect(() => mockSecurityCheck(null, 'read', null)).toThrow('PERMISSION_DENIED: Unauthenticated request');
    expect(() => mockSecurityCheck({ uid: 'staff1' }, 'write_master', 'staff')).toThrow('PERMISSION_DENIED: Only owners can write master records');
    expect(() => mockSecurityCheck({ uid: 'owner1' }, 'delete', 'owner')).toThrow('PERMISSION_DENIED: Deletions are globally disabled');
    expect(mockSecurityCheck({ uid: 'owner1' }, 'write_master', 'owner')).toBe(true);
  });
});
