import { describe, it, expect } from 'vitest';
import { DANGEROUS_PATTERNS, truncate } from '../tools.js';

describe('DANGEROUS_PATTERNS', () => {
  const testPattern = (command) =>
    DANGEROUS_PATTERNS.some((p) => p.test(command));

  it('blocks rm -rf /', () => {
    expect(testPattern('rm -rf /')).toBe(true);
  });

  it('blocks DROP TABLE', () => {
    expect(testPattern('DROP TABLE users')).toBe(true);
    expect(testPattern('drop table users')).toBe(true);
  });

  it('blocks DELETE FROM with semicolon', () => {
    expect(testPattern('DELETE FROM users;')).toBe(true);
  });

  it('blocks mkfs', () => {
    expect(testPattern('mkfs /dev/sda1')).toBe(true);
  });

  it('blocks dd if=', () => {
    expect(testPattern('dd if=/dev/zero of=/dev/sda')).toBe(true);
  });

  it('blocks shutdown', () => {
    expect(testPattern('shutdown -h now')).toBe(true);
  });

  it('blocks reboot', () => {
    expect(testPattern('reboot')).toBe(true);
  });

  it('blocks fork bomb pattern', () => {
    expect(testPattern(':() { :| :& }; :')).toBe(true);
  });

  it('allows safe commands', () => {
    expect(testPattern('kubectl get pods')).toBe(false);
    expect(testPattern('ls -la')).toBe(false);
    expect(testPattern('docker ps')).toBe(false);
    expect(testPattern('cat /etc/hostname')).toBe(false);
    expect(testPattern('curl http://localhost:8080')).toBe(false);
  });

  it('allows rm without -rf /', () => {
    expect(testPattern('rm /tmp/test.txt')).toBe(false);
  });

  it('allows DELETE FROM without trailing semicolon', () => {
    expect(testPattern('DELETE FROM users WHERE id=1')).toBe(false);
  });
});

describe('truncate', () => {
  it('returns text unchanged if under limit', () => {
    expect(truncate('hello', 100)).toBe('hello');
  });

  it('returns text unchanged if exactly at limit', () => {
    const text = 'a'.repeat(100);
    expect(truncate(text, 100)).toBe(text);
  });

  it('truncates text over limit with message', () => {
    const text = 'a'.repeat(200);
    const result = truncate(text, 100);
    expect(result.length).toBeLessThan(200);
    expect(result).toContain('[output truncated');
    expect(result).toContain('showing first 100 of 200 chars');
  });

  it('uses default maxLen of 32000', () => {
    const shortText = 'a'.repeat(100);
    expect(truncate(shortText)).toBe(shortText);

    const longText = 'a'.repeat(33000);
    const result = truncate(longText);
    expect(result).toContain('[output truncated');
    expect(result).toContain('showing first 32000 of 33000 chars');
  });
});
