import { spawn, ChildProcess } from 'child_process';
import * as readline from 'readline';
import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';

export class CodexAdapter {
  private codexProcess: ChildProcess | null = null;
  private hubWs: WebSocket | null = null;
  private rl: readline.Interface | null = null;
  private agentId: string;
  private hubUrl: string;

  constructor(hubUrl: string, agentId: string = 'codex') {
    this.hubUrl = hubUrl;
    this.agentId = agentId;
  }

  public async start() {
    return new Promise<void>((resolve, reject) => {
      this.hubWs = new WebSocket(this.hubUrl);

      this.hubWs.on('open', () => {
        console.log(`[CodexAdapter] Connected to Hub at ${this.hubUrl}`);
        this.hubWs?.send(JSON.stringify({ type: 'identify', id: this.agentId }));
        this.startCodexProcess();
        resolve();
      });

      this.hubWs.on('message', (data) => {
        this.handleHubMessage(data.toString());
      });

      this.hubWs.on('error', (err) => {
        console.error(`[CodexAdapter] Hub WS error:`, err);
        reject(err);
      });

      this.hubWs.on('close', () => {
        console.log(`[CodexAdapter] Hub WS closed`);
        this.stop();
      });
    });
  }

  private startCodexProcess() {
    console.log('[CodexAdapter] Starting codex app-server (stdio)');
    this.codexProcess = spawn('codex', ['app-server'], {
      stdio: ['pipe', 'pipe', 'inherit'],
      shell: process.platform === 'win32'
    });

    if (!this.codexProcess.stdout || !this.codexProcess.stdin) {
      throw new Error('Failed to attach to Codex stdio');
    }

    this.rl = readline.createInterface({
      input: this.codexProcess.stdout,
      terminal: false
    });

    this.rl.on('line', (line) => {
      this.handleCodexMessage(line);
    });

    this.codexProcess.on('exit', (code) => {
      console.log(`[CodexAdapter] Codex process exited with code ${code}`);
      this.stop();
    });

    // Send initialize request immediately
    this.sendToCodex({
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "initialize",
      params: { clientInfo: { name: "aiteam", version: "2.0.0" }, capabilities: {} }
    });
  }

  private handleHubMessage(data: string) {
    try {
      const msg = JSON.parse(data);
      if (msg.eventType === 'rpc') {
        // Forward the payload directly to Codex
        this.sendToCodex(msg.payload);
      }
    } catch (e) {
      console.error('[CodexAdapter] Failed to parse hub message:', e);
    }
  }

  private handleCodexMessage(line: string) {
    try {
      const parsed = JSON.parse(line);
      
      // If it's the initialize result, we should probably send initialized, but for now we just forward everything.
      // Wait, let's forward everything to the hub so the lead agent can see it.
      
      const hubMsg = {
        id: randomUUID(),
        from: this.agentId,
        to: 'lead', // Route to lead agent for now
        eventType: 'rpc_response',
        timestamp: Date.now(),
        payload: parsed
      };

      if (this.hubWs && this.hubWs.readyState === WebSocket.OPEN) {
        this.hubWs.send(JSON.stringify(hubMsg));
      }
    } catch (e) {
      console.error('[CodexAdapter] Invalid JSON from Codex:', line);
    }
  }

  private sendToCodex(payload: any) {
    if (this.codexProcess && this.codexProcess.stdin) {
      this.codexProcess.stdin.write(JSON.stringify(payload) + "\n");
    }
  }

  public stop() {
    if (this.rl) this.rl.close();
    if (this.codexProcess) this.codexProcess.kill();
    if (this.hubWs) this.hubWs.close();
  }
}
