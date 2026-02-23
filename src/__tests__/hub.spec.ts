import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { CentralHub } from '../index.js';

describe('Central Hub WebSocket Server', () => {
  let hub: CentralHub;
  const PORT = 4502; // Use a different port for testing

  beforeAll(() => {
    hub = new CentralHub(PORT);
  });

  afterAll(() => {
    hub.stop();
  });

  it('should accept connections and route messages', async () => {
    const ws1 = new WebSocket(`ws://localhost:${PORT}`);
    const ws2 = new WebSocket(`ws://localhost:${PORT}`);

    // Helper to wait for open
    const waitForOpen = (ws: WebSocket) => new Promise(resolve => ws.on('open', resolve));
    await Promise.all([waitForOpen(ws1), waitForOpen(ws2)]);

    // Identify
    ws1.send(JSON.stringify({ type: 'identify', id: 'agent1' }));
    ws2.send(JSON.stringify({ type: 'identify', id: 'agent2' }));

    // Wait briefly for identification to process
    await new Promise(resolve => setTimeout(resolve, 50));

    // Send a message from agent1 to agent2
    const message = {
      from: 'agent1',
      to: 'agent2',
      eventType: 'chat',
      payload: 'Hello from agent1'
    };

    const receivedMessage = new Promise((resolve) => {
      ws2.on('message', (data) => {
        resolve(JSON.parse(data.toString()));
      });
    });

    ws1.send(JSON.stringify(message));

    const result = await receivedMessage;
    expect(result).toEqual(message);

    ws1.close();
    ws2.close();
  });

  it('should return delivery-failed hint when target is offline', async () => {
    const warnMessages: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message?: unknown, ...rest: unknown[]) => {
      warnMessages.push(String(message ?? ''));
      if (rest.length > 0) {
        warnMessages.push(rest.map((item) => String(item)).join(' '));
      }
    };

    try {
      const ws1 = new WebSocket(`ws://localhost:${PORT}`);
      await new Promise((resolve) => ws1.on('open', resolve));
      ws1.send(JSON.stringify({ type: 'identify', id: 'agent1' }));
      await new Promise((resolve) => setTimeout(resolve, 50));

      const received = new Promise<{ error: string; target: string; reason: string }>((resolve) => {
        ws1.on('message', (data) => {
          resolve(JSON.parse(data.toString()));
        });
      });

      ws1.send(
        JSON.stringify({
          from: 'agent1',
          to: 'offlineAgent',
          eventType: 'chat',
          payload: 'hello'
        })
      );

      const result = await received;
      expect(result).toEqual({
        error: 'Delivery failed',
        target: 'offlineAgent',
        reason: 'Target offline'
      });
      expect(warnMessages.join('\n')).toContain('Target offlineAgent not connected.');

      ws1.close();
    } finally {
      console.warn = originalWarn;
    }
  });
});
