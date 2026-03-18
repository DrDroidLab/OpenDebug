import { describe, it, expect, vi, beforeAll } from 'vitest';

// Set env vars before importing provider (it initializes at import time)
process.env.AI_PROVIDER = 'openai';
process.env.OPENAI_API_KEY = 'test-key-for-unit-tests';

const { buildImageContent } = await import('../provider.js');

describe('buildImageContent', () => {
  it('returns plain message when no images', () => {
    expect(buildImageContent('hello', [])).toBe('hello');
    expect(buildImageContent('hello', null)).toBe('hello');
    expect(buildImageContent('hello', undefined)).toBe('hello');
  });

  it('builds content array with images', () => {
    const images = [
      { mediaType: 'image/png', base64: 'abc123' },
    ];
    const result = buildImageContent('describe this', images);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,abc123' },
    });
    expect(result[1]).toEqual({ type: 'text', text: 'describe this' });
  });

  it('handles multiple images', () => {
    const images = [
      { mediaType: 'image/png', base64: 'img1' },
      { mediaType: 'image/jpeg', base64: 'img2' },
    ];
    const result = buildImageContent('check these', images);
    expect(result).toHaveLength(3);
    expect(result[0].image_url.url).toBe('data:image/png;base64,img1');
    expect(result[1].image_url.url).toBe('data:image/jpeg;base64,img2');
    expect(result[2].text).toBe('check these');
  });
});
