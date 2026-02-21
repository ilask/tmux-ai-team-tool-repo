import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CentralHub } from '../../index.js';
import { ClaudeAdapter } from '../../adapters/claude.js';
import { WebSocket } from 'ws';

describe('Claude Adapter', () => {
  let hub: CentralHub;
  const PORT = 4504;
  let adapter: ClaudeAdapter;

  beforeAll(async () => {
    hub = new CentralHub(PORT);
    adapter = new ClaudeAdapter(`ws://localhost:${PORT}`, 'claude');
    await adapter.start();
  });

  afterAll(() => {
    adapter.stop();
    hub.stop();
  });

  it('should connect to hub and route a prompt to claude', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise(resolve => ws.on('open', resolve));

    ws.send(JSON.stringify({ type: 'identify', id: 'lead' }));
    
    // Wait for identify to register
    await new Promise(resolve => setTimeout(resolve, 100));

    // Send a prompt to claude
    ws.send(JSON.stringify({
        from: 'lead',
        to: 'claude',
        eventType: 'prompt',
        payload: "Just reply 'TEST_OK' and nothing else."
    }));

    // Wait for the final result from Claude
    const resultPayload = await new Promise<any>((resolve) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.from === 'claude' && msg.eventType === 'result') {
          resolve(msg.payload);
        }
      });
    });

    expect(resultPayload).toBeDefined();
    expect(resultPayload.result).toContain('TEST_OK');

    ws.close();
  }, 15000); // 15 seconds timeout since Claude calls an actual LLM API
});
