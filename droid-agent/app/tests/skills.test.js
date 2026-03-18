import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  stat: vi.fn(),
}));

import { readdir, readFile, writeFile, stat } from 'fs/promises';
import { loadSkills, writeSkill, loadSkill } from '../skills.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadSkills', () => {
  it('returns empty array when directory does not exist', async () => {
    readdir.mockRejectedValue(new Error('ENOENT'));
    const result = await loadSkills();
    expect(result).toEqual([]);
  });

  it('loads .md files excluding README.md', async () => {
    readdir.mockResolvedValue(['kubernetes.md', 'README.md', 'docker.md', 'notes.txt']);
    readFile.mockResolvedValue('# Skill content');
    stat.mockResolvedValue({ size: 15 });

    const result = await loadSkills();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('kubernetes');
    expect(result[1].name).toBe('docker');
    expect(result[0].content).toBe('# Skill content');
    expect(result[0].size).toBe(15);
  });

  it('skips unreadable files', async () => {
    readdir.mockResolvedValue(['good.md', 'bad.md']);
    readFile
      .mockResolvedValueOnce('good content')
      .mockRejectedValueOnce(new Error('permission denied'));
    stat
      .mockResolvedValueOnce({ size: 12 })
      .mockRejectedValueOnce(new Error('permission denied'));

    const result = await loadSkills();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('good');
  });
});

describe('writeSkill', () => {
  it('writes skill file and returns metadata', async () => {
    writeFile.mockResolvedValue(undefined);

    const result = await writeSkill('test-skill', '# Test skill content');
    expect(result).toEqual({ name: 'test-skill', bytes: 20 });
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('test-skill.md'),
      '# Test skill content',
      'utf-8'
    );
  });
});

describe('loadSkill', () => {
  it('loads a specific skill by name', async () => {
    readFile.mockResolvedValue('# Kubernetes debugging');
    const result = await loadSkill('kubernetes');
    expect(result).toBe('# Kubernetes debugging');
    expect(readFile).toHaveBeenCalledWith(expect.stringContaining('kubernetes.md'), 'utf-8');
  });

  it('returns null if skill not found', async () => {
    readFile.mockRejectedValue(new Error('ENOENT'));
    const result = await loadSkill('nonexistent');
    expect(result).toBeNull();
  });
});
