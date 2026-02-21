import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CentralHub } from '../../index.js';
import { CodexAdapter } from '../../adapters/codex.js';
import { WebSocket } from 'ws';

describe('Codex Adapter', () => {
  let hub: CentralHub;
  const PORT = 4503;
  let adapter: CodexAdapter;

  beforeAll(async () => {
    hub = new CentralHub(PORT);
    adapter = new CodexAdapter(`ws://localhost:${PORT}`, 'codex');
    await adapter.start();
  });

  afterAll(() => {
    adapter.stop();
    hub.stop();
  });

  it('should connect to hub and initialize codex', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise(resolve => ws.on('open', resolve));

    ws.send(JSON.stringify({ type: 'identify', id: 'lead' }));
    
    // Wait a bit for Codex to send its initialize response
    const initResponse = await new Promise<any>((resolve) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.from === 'codex' && msg.eventType === 'rpc_response') {
          resolve(msg.payload);
        }
      });
    });

    expect(initResponse.id).toBeDefined();
    expect(initResponse.result).toBeDefined();
    expect(initResponse.result.userAgent).toContain('aiteam');

    ws.close();
  });
});
