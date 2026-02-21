import { describe, it, expect } from 'vitest';
import { extractConversationalText, formatCliMessage } from '../cli.js';

describe('CLI output filter', () => {
  it('prints conversational assistant content', () => {
    const formatted = formatCliMessage({
      from: 'claude',
      payload: {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Hello from Claude.' }]
        }
      }
    });

    expect(formatted).toEqual({
      from: 'claude',
      text: 'Hello from Claude.'
    });
  });

  it('ignores codex status notifications like turn/started', () => {
    const formatted = formatCliMessage({
      from: 'codex',
      payload: {
        jsonrpc: '2.0',
        method: 'turn/started',
        params: {
          turn: { id: 'turn_123', status: 'started' }
        }
      }
    });

    expect(formatted).toBeNull();
  });

  it('ignores codex token_count notifications', () => {
    const formatted = formatCliMessage({
      from: 'codex',
      payload: {
        jsonrpc: '2.0',
        method: 'token_count',
        params: {
          input_tokens: 10,
          output_tokens: 20
        }
      }
    });

    expect(formatted).toBeNull();
  });

  it('ignores codex thread/started notifications', () => {
    const formatted = formatCliMessage({
      from: 'codex',
      payload: {
        jsonrpc: '2.0',
        method: 'thread/started',
        params: {
          thread: { id: 'thread_123' }
        }
      }
    });

    expect(formatted).toBeNull();
  });

  it('extracts assistant text from codex turn output', () => {
    const text = extractConversationalText({
      jsonrpc: '2.0',
      method: 'turn/completed',
      params: {
        turn: {
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Codex final answer.' }]
            }
          ]
        }
      }
    });

    expect(text).toBe('Codex final answer.');
  });
});
