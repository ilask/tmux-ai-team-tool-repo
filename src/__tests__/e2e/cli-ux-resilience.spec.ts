import { describe, it, expect } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as url from 'url';
import * as net from 'net';
import { setTimeout as sleep } from 'timers/promises';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const CLI_PATH = path.resolve(__dirname, '../../../dist/cli.js');

type CliHarness = {
  process: ChildProcess;
  getOutput: () => string;
  sendLine: (line: string) => void;
  waitForText: (needle: string, timeoutMs?: number) => Promise<void>;
  stop: () => Promise<void>;
};

async function getFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate free port')));
        return;
      }
      const selected = address.port;
      server.close((closeErr) => {
        if (closeErr) {
          reject(closeErr);
          return;
        }
        resolve(selected);
      });
    });
  });
}

async function startCliHarness(): Promise<CliHarness> {
  const port = await getFreePort();
  const cliProcess = spawn('node', [CLI_PATH], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  if (!cliProcess.stdin || !cliProcess.stdout || !cliProcess.stderr) {
    throw new Error('Failed to attach CLI stdio');
  }

  let outputBuffer = '';
  cliProcess.stdout.on('data', (data) => {
    outputBuffer += data.toString();
  });
  cliProcess.stderr.on('data', (data) => {
    outputBuffer += data.toString();
  });

  const waitForText = async (needle: string, timeoutMs = 15000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (outputBuffer.includes(needle)) {
        return;
      }
      await sleep(100);
    }
    throw new Error(`Timeout waiting for "${needle}"\nOutput tail:\n${outputBuffer.slice(-1200)}`);
  };

  await waitForText('--- aiteam CLI ---');
  await waitForText('Available agents: codex, claude, gemini');

  const sendLine = (line: string) => {
    cliProcess.stdin!.write(`${line}${String.fromCharCode(10)}`);
  };

  const stop = async () => {
    if (!cliProcess.killed && cliProcess.exitCode === null) {
      sendLine('exit');
      await Promise.race([
        new Promise<void>((resolve) => cliProcess.once('exit', () => resolve())),
        sleep(6000).then(() => {
          cliProcess.kill();
        })
      ]);
    }
  };

  return {
    process: cliProcess,
    getOutput: () => outputBuffer,
    sendLine,
    waitForText,
    stop
  };
}

describe('E2E: CLI UX and input resilience', () => {
  it('shows startup help-oriented guidance', async () => {
    const harness = await startCliHarness();
    try {
      const output = harness.getOutput();
      expect(output).toContain('--- aiteam CLI ---');
      expect(output).toContain('Available agents: codex, claude, gemini');
      expect(output).toContain('Type "@agent_name message" to send a prompt.');
      expect(output.toLowerCase()).not.toContain('tmux helper');
    } finally {
      await harness.stop();
    }
  }, 30000);

  it('prints a clear hint for invalid input', async () => {
    const harness = await startCliHarness();
    try {
      harness.sendLine('hello');
      await harness.waitForText('Invalid format. Use "@agent message".');
      expect(harness.getOutput()).toContain('Invalid format. Use "@agent message".');
    } finally {
      await harness.stop();
    }
  }, 30000);

  it('keeps running after malformed inputs and still exits cleanly', async () => {
    const harness = await startCliHarness();
    try {
      harness.sendLine('@codex');
      await harness.waitForText('Invalid format. Use "@agent message".');

      harness.sendLine('');
      await harness.waitForText('Invalid format. Use "@agent message".');

      harness.sendLine('   ');
      await harness.waitForText('Invalid format. Use "@agent message".');
    } finally {
      await harness.stop();
    }

    expect(harness.process.killed || harness.process.exitCode !== null).toBe(true);
  }, 30000);
});
