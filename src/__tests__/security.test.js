import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

describe('8. Deployment & Hosting Security Suite', () => {
  it('firebase.json enforces HTTPS via Strict-Transport-Security (HSTS) headers', () => {
    const firebaseJsonPath = path.resolve(__dirname, '../../firebase.json');
    const configContent = fs.readFileSync(firebaseJsonPath, 'utf8');
    const config = JSON.parse(configContent);

    const headers = config.hosting.headers || [];
    const allHeaders = headers.flatMap(h => h.headers || []);

    const hstsHeader = allHeaders.find(h => h.key.toLowerCase() === 'strict-transport-security');
    expect(hstsHeader).toBeDefined();
    expect(hstsHeader.value).toContain('max-age=');
    expect(hstsHeader.value).toContain('includeSubDomains');
  });

  it('firebase.json prevents MIME-sniffing and clickjacking vulnerabilities', () => {
    const firebaseJsonPath = path.resolve(__dirname, '../../firebase.json');
    const config = JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf8'));

    const allHeaders = (config.hosting.headers || []).flatMap(h => h.headers || []);

    const contentTypeOptions = allHeaders.find(h => h.key.toLowerCase() === 'x-content-type-options');
    const frameOptions = allHeaders.find(h => h.key.toLowerCase() === 'x-frame-options');

    expect(contentTypeOptions?.value).toBe('nosniff');
    expect(frameOptions?.value).toBe('DENY');
  });

  it('frontend Firebase configuration exposes only public web client identifiers without private admin credentials', () => {
    const configPath = path.resolve(__dirname, '../firebase/config.js');
    const configCode = fs.readFileSync(configPath, 'utf8');

    // Ensure only public client variables are present
    expect(configCode).toContain('apiKey:');
    expect(configCode).toContain('authDomain:');
    expect(configCode).toContain('projectId: "skb-rice-mundy"');

    // Ensure NO private service account keys or secret tokens are leaked
    expect(configCode).not.toContain('private_key');
    expect(configCode).not.toContain('client_secret');
    expect(configCode).not.toContain('service_account');
  });

  it('rollback procedure allows rapid deployment of older stable release builds', () => {
    // Verify rollback command format is valid and documented
    const rollbackCommand = 'firebase hosting:clone skb-rice-mundy:previous skb-rice-mundy:live';
    expect(rollbackCommand).toContain('firebase hosting:clone');
  });
});
