import { spawn, ChildProcess } from 'child_process';
import * as readline from 'readline';
import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';

export class ClaudeAdapter {
  private claudeProcess: ChildProcess | null = null;
  private hubWs: WebSocket | null = null;
  private rl: readline.Interface | null = null;
  private agentId: string;
  private hubUrl: string;
  private isStopping: boolean = false;
  
  // Track requests for routing responses back
  private currentRequester: string = 'lead';

  constructor(hubUrl: string, agentId: string = 'claude') {
    this.hubUrl = hubUrl;
    this.agentId = agentId;
  }

  public async start() {
    return new Promise<void>((resolve, reject) => {
      this.hubWs = new WebSocket(this.hubUrl);

      this.hubWs.on('open', () => {
        console.log(`[ClaudeAdapter] Connected to Hub at ${this.hubUrl}`);
        this.hubWs?.send(JSON.stringify({ type: 'identify', id: this.agentId }));
        
        try {
          this.startClaudeProcess();
          resolve();
        } catch (e) {
          reject(e);
        }
      });

      this.hubWs.on('message', (data) => {
        this.handleHubMessage(data.toString());
      });

      this.hubWs.on('error', (err) => {
        console.error(`[ClaudeAdapter] Hub WS error:`, err);
        if (!this.isStopping) reject(err);
      });

      this.hubWs.on('close', () => {
        console.log(`[ClaudeAdapter] Hub WS closed`);
        this.stop();
      });
    });
  }

  private startClaudeProcess() {
    console.log('[ClaudeAdapter] Starting claude process (stdio streaming)');
    
    const cmd = 'claude';
    
    this.claudeProcess = spawn(cmd, ['--print', '--verbose', '--input-format=stream-json', '--output-format=stream-json'], {
      stdio: ['pipe', 'pipe', 'inherit'],
      shell: process.platform === 'win32' // Required for some windows environments to find global npm binaries
    });

    this.claudeProcess.on('error', (err) => {
      console.error('[ClaudeAdapter] Failed to spawn Claude:', err);
      this.stop();
    });

    if (!this.claudeProcess.stdout || !this.claudeProcess.stdin) {
      throw new Error('Failed to attach to Claude stdio');
    }

    this.claudeProcess.stdin.on('error', (err) => {
       console.error('[ClaudeAdapter] Claude stdin error:', err);
    });

    this.rl = readline.createInterface({
      input: this.claudeProcess.stdout,
      terminal: false
    });

    this.rl.on('line', (line) => {
      this.handleClaudeMessage(line);
    });

    this.claudeProcess.on('exit', (code) => {
      console.log(`[ClaudeAdapter] Claude process exited with code ${code}`);
      if (!this.isStopping) {
        // Claude --print might exit after one interaction. We might need to handle respawning here for a long-lived agent.
        // For Phase 2, we just let it stop.
      }
      this.stop();
    });
  }

  private handleHubMessage(data: string) {
    try {
      const msg = JSON.parse(data);
      if (msg.eventType === 'prompt' && msg.payload) {
        this.currentRequester = msg.from; // Remember who asked
        this.sendToClaude({
            type: "user",
            message: {
                role: "user",
                content: msg.payload
            }
        });
      } else if (msg.eventType === 'raw' && msg.payload) {
        this.currentRequester = msg.from;
        this.sendToClaude(msg.payload);
      }
    } catch (e) {
      console.error('[ClaudeAdapter] Failed to parse hub message:', e);
    }
  }

  private handleClaudeMessage(line: string) {
    try {
      const parsed = JSON.parse(line);
      
      const hubMsg = {
        id: randomUUID(),
        from: this.agentId,
        to: this.currentRequester, 
        eventType: parsed.type || 'claude_event',
        timestamp: Date.now(),
        payload: parsed
      };

      if (this.hubWs && this.hubWs.readyState === WebSocket.OPEN) {
        this.hubWs.send(JSON.stringify(hubMsg));
      }
    } catch (e) {
      console.error('[ClaudeAdapter] Invalid JSON from Claude:', line);
    }
  }

  private sendToClaude(payload: any) {
    if (this.claudeProcess && this.claudeProcess.stdin && !this.claudeProcess.stdin.destroyed) {
      this.claudeProcess.stdin.write(JSON.stringify(payload) + "\n");
    }
  }

  public stop() {
    if (this.isStopping) return;
    this.isStopping = true;
    
    if (this.rl) {
        this.rl.close();
        this.rl = null;
    }
    if (this.claudeProcess) {
        this.claudeProcess.kill();
        this.claudeProcess = null;
    }
    if (this.hubWs) {
        this.hubWs.close();
        this.hubWs = null;
    }
  }
}
