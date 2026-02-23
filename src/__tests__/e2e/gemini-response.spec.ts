import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync, ChildProcess } from 'child_process';
import * as net from 'net';
import * as path from 'path';
import * as url from 'url';
import { setTimeout as sleep } from 'timers/promises';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const CLI_PATH = path.resolve(__dirname, '../../../dist/cli.js');

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

function canRunGeminiResponseE2E(): boolean {
  if (process.env.AITEAM_RUN_REAL_GEMINI_E2E !== '1') {
    return false;
  }
  const hasKey = (process.env.GEMINI_API_KEY ?? '').trim().length > 0;
  if (!hasKey) {
    return false;
  }

  const probe = spawnSync('gemini', ['--help'], {
    shell: process.platform === 'win32',
    stdio: 'ignore'
  });
  return probe.status === 0;
}

const describeRealGemini = canRunGeminiResponseE2E() ? describe : describe.skip;

describeRealGemini('E2E: Gemini direct response', () => {
  let cliProcess: ChildProcess;
  let outputBuffer = '';

  const waitForText = async (needle: string, timeoutMs = 120000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (outputBuffer.includes(needle)) {
        return;
      }
      await sleep(200);
    }
    throw new Error(`Timeout waiting for "${needle}"\nOutput tail:\n${outputBuffer.slice(-2000)}`);
  };

  beforeAll(async () => {
    const port = await getFreePort();
    cliProcess = spawn('node', [CLI_PATH, 'codex'], {
      env: { ...process.env, PORT: String(port) },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    if (!cliProcess.stdin || !cliProcess.stdout || !cliProcess.stderr) {
      throw new Error('Failed to attach CLI stdio');
    }

    cliProcess.stdout.on('data', (data) => {
      outputBuffer += data.toString();
    });
    cliProcess.stderr.on('data', (data) => {
      outputBuffer += data.toString();
    });

    await waitForText('Main agent: codex (default: codex)', 45000);
  }, 120000);

  afterAll(async () => {
    if (!cliProcess || cliProcess.killed || cliProcess.exitCode !== null) {
      return;
    }
    cliProcess.stdin!.write(`exit${String.fromCharCode(10)}`);
    await Promise.race([
      new Promise<void>((resolve) => cliProcess.once('exit', () => resolve())),
      sleep(8000).then(() => {
        cliProcess.kill();
      })
    ]);
  }, 30000);

  it('returns a visible gemini response for direct routing', async () => {
    cliProcess.stdin!.write(`/status${String.fromCharCode(10)}`);
    await waitForText('- gemini: connected', 60000);

    const token = `E2E_GEMINI_OK_${Date.now()}`;
    cliProcess.stdin!.write(
      `@gemini Reply with this token exactly once and nothing else: ${token}${String.fromCharCode(10)}`
    );

    await waitForText('[gemini]', 180000);
    await waitForText(token, 180000);

    expect(outputBuffer).toContain('[gemini]');
    expect(outputBuffer).toContain(token);
  }, 240000);
});
