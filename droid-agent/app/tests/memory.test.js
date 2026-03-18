import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs/promises before importing the module
vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  stat: vi.fn(),
}));

import { readdir, readFile, writeFile, mkdir, stat } from 'fs/promises';
import { readAllMemory, writeMemory, readMemory, getMemoryTree, getTotalMemoryBytes } from '../memory.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('writeMemory', () => {
  it('creates directory and writes file', async () => {
    mkdir.mockResolvedValue(undefined);
    writeFile.mockResolvedValue(undefined);

    const result = await writeMemory('incidents/test.md', '# Test');
    expect(result).toEqual({ path: 'incidents/test.md', bytes: 6 });
    expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('incidents'), { recursive: true });
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('incidents/test.md'),
      '# Test',
      'utf-8'
    );
  });

  it('returns correct byte count', async () => {
    mkdir.mockResolvedValue(undefined);
    writeFile.mockResolvedValue(undefined);

    const content = 'Hello, world! This is a test.';
    const result = await writeMemory('test.md', content);
    expect(result.bytes).toBe(content.length);
  });
});

describe('readMemory', () => {
  it('reads a file from memory directory', async () => {
    readFile.mockResolvedValue('# Content');
    const result = await readMemory('context.md');
    expect(result).toBe('# Content');
    expect(readFile).toHaveBeenCalledWith(expect.stringContaining('context.md'), 'utf-8');
  });

  it('returns null if file not found', async () => {
    readFile.mockRejectedValue(new Error('ENOENT'));
    const result = await readMemory('nonexistent.md');
    expect(result).toBeNull();
  });
});

describe('readAllMemory', () => {
  it('returns empty array when directory is empty', async () => {
    readdir.mockResolvedValue([]);
    const result = await readAllMemory();
    expect(result).toEqual([]);
  });

  it('returns empty array when directory does not exist', async () => {
    readdir.mockRejectedValue(new Error('ENOENT'));
    const result = await readAllMemory();
    expect(result).toEqual([]);
  });

  it('reads markdown and txt files recursively', async () => {
    const mockDirent = (name, isDir) => ({
      name,
      isDirectory: () => isDir,
      isFile: () => !isDir,
    });

    // Root dir has a file and a subdir
    readdir.mockImplementation(async (dir) => {
      if (dir.endsWith('memory')) {
        return [mockDirent('context.md', false), mockDirent('infra', true)];
      }
      if (dir.endsWith('infra')) {
        return [mockDirent('summary.md', false), mockDirent('image.png', false)];
      }
      return [];
    });

    readFile.mockResolvedValue('content');
    stat.mockResolvedValue({ size: 7, mtime: new Date('2024-01-01') });

    const result = await readAllMemory();
    // Should include .md files but not .png
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.path)).toContain('context.md');
    expect(result.map((f) => f.path)).toContain('infra/summary.md');
  });
});

describe('getMemoryTree', () => {
  it('returns empty object for empty memory', async () => {
    readdir.mockRejectedValue(new Error('ENOENT'));
    const result = await getMemoryTree();
    expect(result).toEqual({});
  });
});

describe('getTotalMemoryBytes', () => {
  it('returns 0 for empty memory', async () => {
    readdir.mockRejectedValue(new Error('ENOENT'));
    const result = await getTotalMemoryBytes();
    expect(result).toBe(0);
  });
});
