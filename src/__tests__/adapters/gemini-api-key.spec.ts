import { describe, expect, it } from 'vitest';
import {
  normalizeGeminiApiKey,
  resolveGeminiApiKeyFromEnv
} from '../../adapters/gemini.js';

describe('Gemini API key resolution', () => {
  it('normalizes prefixed and quoted values', () => {
    expect(normalizeGeminiApiKey('GEMINI_API_KEY="abc123"')).toBe('abc123');
    expect(normalizeGeminiApiKey(" 'def456' ")).toBe('def456');
  });

  it('resolves from GEMINI_API_KEY only', () => {
    const key = resolveGeminiApiKeyFromEnv({
      GEMINI_API_KEY: ' "xyz789" ',
      GEMINI_API_KEY_FILE: 'C:\\tmp\\should_not_be_used.txt'
    });
    expect(key).toBe('xyz789');
  });

  it('returns undefined when GEMINI_API_KEY is empty', () => {
    const key = resolveGeminiApiKeyFromEnv({
      GEMINI_API_KEY: '   ',
      GEMINI_API_KEY_FILE: 'C:\\tmp\\ignored.txt'
    });
    expect(key).toBeUndefined();
  });
});
