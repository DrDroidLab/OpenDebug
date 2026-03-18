import { describe, it, expect, vi } from 'vitest';

// Mock all external dependencies that agent.js imports
vi.mock('../provider.js', () => ({
  createCompletion: vi.fn(),
  buildImageContent: vi.fn((msg) => msg),
  getProviderName: vi.fn(() => 'test'),
  getModelId: vi.fn(() => 'test-model'),
}));
vi.mock('../redis.js', () => ({
  getConversation: vi.fn(() => []),
  saveConversation: vi.fn(),
}));
vi.mock('../db.js', () => ({
  logToolExecution: vi.fn(),
  logIncident: vi.fn(),
  upsertConversation: vi.fn(),
  saveMessage: vi.fn(),
  getRecentFeedback: vi.fn(() => []),
}));
vi.mock('../agent-md.js', () => ({
  regenerateAgentMd: vi.fn(),
}));
vi.mock('fs/promises', () => ({
  readFile: vi.fn(() => Promise.reject(new Error('not found'))),
}));

import {
  parseToolCalls,
  parseMemoryWrites,
  stripToolCalls,
  stripMemoryWrites,
  extractField,
  tryParseJson,
  isValidJson,
} from '../agent.js';

describe('tryParseJson', () => {
  it('parses valid JSON', () => {
    expect(tryParseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('returns null for invalid JSON', () => {
    expect(tryParseJson('not json')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(tryParseJson('')).toBeNull();
  });
});

describe('isValidJson', () => {
  it('returns true for valid JSON', () => {
    expect(isValidJson('{"a":1}')).toBe(true);
  });

  it('returns false for invalid JSON', () => {
    expect(isValidJson('{bad}')).toBe(false);
  });
});

describe('parseToolCalls', () => {
  it('parses a single tool call', () => {
    const text = `Some text before
<tool_call>
{"tool": "run_shell", "args": {"command": "kubectl get pods"}}
</tool_call>
Some text after`;
    const result = parseToolCalls(text);
    expect(result).toHaveLength(1);
    expect(result[0].tool).toBe('run_shell');
    expect(result[0].args.command).toBe('kubectl get pods');
  });

  it('parses multiple tool calls', () => {
    const text = `
<tool_call>
{"tool": "run_shell", "args": {"command": "ls"}}
</tool_call>
middle text
<tool_call>
{"tool": "read_file", "args": {"path": "/tmp/test.txt"}}
</tool_call>`;
    const result = parseToolCalls(text);
    expect(result).toHaveLength(2);
    expect(result[0].tool).toBe('run_shell');
    expect(result[1].tool).toBe('read_file');
  });

  it('returns empty array when no tool calls', () => {
    expect(parseToolCalls('just plain text')).toEqual([]);
  });

  it('handles tool call with no args', () => {
    const text = `<tool_call>
{"tool": "run_shell"}
</tool_call>`;
    const result = parseToolCalls(text);
    expect(result).toHaveLength(1);
    expect(result[0].args).toEqual({});
  });

  it('handles extra trailing brace (common LLM mistake)', () => {
    const text = `<tool_call>
{"tool": "run_shell", "args": {"command": "ls"}}}
</tool_call>`;
    const result = parseToolCalls(text);
    expect(result).toHaveLength(1);
    expect(result[0].tool).toBe('run_shell');
  });

  it('does not parse tool call with non-JSON text before the JSON', () => {
    // The parser's regex extracts raw content, tries JSON parse, then
    // tries extracting {..} — but the greedy match picks up the wrong range
    const text = `<tool_call>
Here is the command:
{"tool": "run_shell", "args": {"command": "pwd"}}
</tool_call>`;
    const result = parseToolCalls(text);
    expect(result).toEqual([]);
  });

  it('skips unparseable tool calls', () => {
    const text = `<tool_call>
completely broken content
</tool_call>`;
    const result = parseToolCalls(text);
    expect(result).toEqual([]);
  });
});

describe('parseMemoryWrites', () => {
  it('parses a memory write block', () => {
    const text = `Some text
<memory_write path='incidents/2024-01-01-test.md'>
## Incident: Test
**Service**: api
</memory_write>
More text`;
    const result = parseMemoryWrites(text);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('incidents/2024-01-01-test.md');
    expect(result[0].content).toContain('## Incident: Test');
    expect(result[0].content).toContain('**Service**: api');
  });

  it('parses double-quoted paths', () => {
    const text = `<memory_write path="infra/test.md">content here</memory_write>`;
    const result = parseMemoryWrites(text);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('infra/test.md');
  });

  it('parses multiple memory writes', () => {
    const text = `
<memory_write path='a.md'>content a</memory_write>
<memory_write path='b.md'>content b</memory_write>`;
    const result = parseMemoryWrites(text);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no memory writes', () => {
    expect(parseMemoryWrites('no writes here')).toEqual([]);
  });
});

describe('stripToolCalls', () => {
  it('removes tool call blocks from text', () => {
    const text = `Before
<tool_call>
{"tool": "run_shell", "args": {"command": "ls"}}
</tool_call>
After`;
    const result = stripToolCalls(text);
    expect(result).toBe('Before\n\nAfter');
  });

  it('returns text unchanged if no tool calls', () => {
    expect(stripToolCalls('plain text')).toBe('plain text');
  });
});

describe('stripMemoryWrites', () => {
  it('removes memory write blocks from text', () => {
    const text = `Before
<memory_write path='test.md'>content</memory_write>
After`;
    const result = stripMemoryWrites(text);
    expect(result).toBe('Before\n\nAfter');
  });

  it('returns text unchanged if no memory writes', () => {
    expect(stripMemoryWrites('plain text')).toBe('plain text');
  });
});

describe('extractField', () => {
  it('extracts a markdown bold field', () => {
    const content = `## Incident
**Service**: payments-api
**Symptom**: high latency`;
    expect(extractField(content, 'Service')).toBe('payments-api');
    expect(extractField(content, 'Symptom')).toBe('high latency');
  });

  it('returns null for missing field', () => {
    expect(extractField('no fields here', 'Service')).toBeNull();
  });

  it('is case-insensitive', () => {
    const content = '**service**: my-service';
    expect(extractField(content, 'Service')).toBe('my-service');
  });
});
