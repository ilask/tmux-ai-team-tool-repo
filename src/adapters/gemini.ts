import { spawn, ChildProcess } from 'child_process';
import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

type ExistsSyncFn = (path: string) => boolean;
type ReadFileSyncFn = (path: string) => string;
const AUTONOMOUS_MODE_DISABLED_VALUES = new Set(['0', 'false', 'off', 'no']);
const ENABLED_VALUES = new Set(['1', 'true', 'on', 'yes']);
const DEFAULT_GEMINI_GENERATE_MAX_ATTEMPTS = 3;
const DEFAULT_GEMINI_PROCESS_TIMEOUT_MS = 180000;
const DEFAULT_GEMINI_NON_GENERATE_TIMEOUT_MS = 90000;
const ANSI_ESCAPE_REGEX = /\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export function isGeminiAutonomousModeEnabled(rawValue: string | undefined): boolean {
  if (!rawValue) return true;
  return !AUTONOMOUS_MODE_DISABLED_VALUES.has(rawValue.trim().toLowerCase());
}

export function buildGeminiAutonomousPrompt(agentId: string, originalPrompt: string): string {
  return [
    `[aiteam autonomy mode: ${agentId}]`,
    'Prefer agent-to-agent collaboration before replying to lead.',
    'Delegate tasks with exactly one line: @<agent> <task>.',
    'Send progress updates only when blocked; otherwise send final synthesized result.',
    '',
    'Task:',
    originalPrompt
  ].join('\n');
}

export function extractGeminiDelegationFromText(textContent: string): {
  to: string;
  task: string;
} | null {
  const lines = textContent.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const match = line.match(/^@(\w+)\s+(.+)$/);
    if (!match) {
      continue;
    }
    const task = match[2].trim();
    if (!task) {
      continue;
    }
    return {
      to: match[1],
      task
    };
  }
  return null;
}

function isGeminiStderrLoggingEnabled(rawValue: string | undefined): boolean {
  if (!rawValue) {
    return false;
  }
  return ENABLED_VALUES.has(rawValue.trim().toLowerCase());
}

function normalizeGeminiOutputText(text: string): string {
  return text
    .replace(ANSI_ESCAPE_REGEX, '')
    .replace(/\r/g, '')
    .trim();
}

function stripGeminiApiKeyPrefix(value: string): string {
  return value.startsWith('GEMINI_API_KEY=')
    ? value.slice('GEMINI_API_KEY='.length)
    : value;
}

function trimOuterQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

export function normalizeGeminiApiKey(rawValue: string): string {
  let value = rawValue.trim();
  value = stripGeminiApiKeyPrefix(value);
  value = trimOuterQuotes(value);
  return value.trim();
}

export function resolveGeminiApiKeyFromEnv(
  env: NodeJS.ProcessEnv,
  deps?: {
    existsSync?: ExistsSyncFn;
    readFileSync?: ReadFileSyncFn;
  }
): string | undefined {
  const existsSync = deps?.existsSync ?? fs.existsSync;
  const readFileSync =
    deps?.readFileSync ??
    ((path: string) => fs.readFileSync(path, { encoding: 'utf8' }));

  const readKeyFromPath = (pathCandidate: string): string | undefined => {
    const trimmedPath = pathCandidate.trim();
    if (!trimmedPath || !existsSync(trimmedPath)) {
      return undefined;
    }
    const fileContent = readFileSync(trimmedPath);
    const normalized = normalizeGeminiApiKey(fileContent);
    return normalized.length > 0 ? normalized : undefined;
  };

  const fileEnv = env.GEMINI_API_KEY_FILE ?? '';
  const normalizedFileEnv = normalizeGeminiApiKey(fileEnv);
  const keyFromExplicitFile =
    readKeyFromPath(fileEnv) ?? readKeyFromPath(normalizedFileEnv);
  if (keyFromExplicitFile) {
    return keyFromExplicitFile;
  }

  const keyEnv = env.GEMINI_API_KEY ?? '';
  const normalizedKeyEnv = normalizeGeminiApiKey(keyEnv);
  const keyFromPathValue =
    readKeyFromPath(keyEnv) ?? readKeyFromPath(normalizedKeyEnv);
  if (keyFromPathValue) {
    return keyFromPathValue;
  }

  return normalizedKeyEnv.length > 0 ? normalizedKeyEnv : undefined;
}

export function buildGeminiPromptArgs(
  promptText: string,
  resumeSessionId?: string | null,
  approvalMode?: string | null
): string[] {
  const resolvedApprovalMode =
    approvalMode?.trim() ||
    process.env.AITEAM_GEMINI_APPROVAL_MODE?.trim() ||
    'yolo';
  const args = ['-o', 'stream-json'];
  if (resolvedApprovalMode.length > 0) {
    args.push('--approval-mode', resolvedApprovalMode);
  }
  if (resumeSessionId && resumeSessionId.trim().length > 0) {
    args.push('--resume', resumeSessionId.trim());
  }
  args.push('-p', promptText);
  return args;
}

function buildGeminiTextPromptArgs(
  promptText: string,
  resumeSessionId?: string | null,
  approvalMode?: string | null
): string[] {
  const resolvedApprovalMode =
    approvalMode?.trim() ||
    process.env.AITEAM_GEMINI_APPROVAL_MODE?.trim() ||
    'yolo';
  const args = ['-o', 'text'];
  if (resolvedApprovalMode.length > 0) {
    args.push('--approval-mode', resolvedApprovalMode);
  }
  if (resumeSessionId && resumeSessionId.trim().length > 0) {
    args.push('--resume', resumeSessionId.trim());
  }
  args.push('-p', promptText);
  return args;
}

function isGeminiGeneratePrompt(promptText: string): boolean {
  return /^\/generate(\s|$)/.test(promptText.trimStart());
}

function parsePositiveInt(rawValue: string | undefined, fallbackValue: number): number {
  const parsed = Number.parseInt(rawValue?.trim() ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallbackValue;
  }
  return parsed;
}

function extractPrimaryGenerateCommand(promptText: string): string {
  const match = promptText.match(/^\s*\/generate[^\r\n]*/m);
  if (!match) {
    return promptText.trim();
  }
  return match[0].trim();
}

type GeminiGenerateRequest = {
  originalCommand: string;
  prompt: string;
  count: number;
};

function parseGenerateRequest(command: string): GeminiGenerateRequest | null {
  const trimmed = command.trim();
  const match = trimmed.match(/^\/generate\s+(.+?)(?:\s+--count(?:=|\s)(\d+))?\s*$/i);
  if (!match) {
    return null;
  }

  let promptPart = match[1].trim();
  if (
    (promptPart.startsWith('"') && promptPart.endsWith('"')) ||
    (promptPart.startsWith("'") && promptPart.endsWith("'"))
  ) {
    promptPart = promptPart.slice(1, -1).trim();
  }
  if (!promptPart) {
    return null;
  }

  const parsedCount = Number.parseInt(match[2] ?? '1', 10);
  const count = Number.isFinite(parsedCount) && parsedCount >= 1 ? parsedCount : 1;
  return {
    originalCommand: trimmed,
    prompt: promptPart,
    count
  };
}

function buildGenerateExecutionPrompt(request: GeminiGenerateRequest): string {
  return [
    'Use the nanobanana image-generation extension.',
    `Generate exactly ${request.count} PNG image(s) for this visual prompt:`,
    request.prompt,
    'Save the image(s) to the default workspace output directory.',
    'Return only absolute saved file path(s), one path per line.',
    `Requested command: ${request.originalCommand}`
  ].join('\n');
}

function hasImageOutputEvidence(text: string): boolean {
  return /[^\s"'`]+\.(png|jpg|jpeg|webp)\b/i.test(text);
}

function shouldRetryGenerateResult(
  output: string,
  stderr: string,
  exitCode: number | null
): boolean {
  if (exitCode !== 0) {
    return true;
  }
  const combined = `${output}\n${stderr}`.toLowerCase();
  if (combined.includes('no image data found')) {
    return true;
  }
  return !hasImageOutputEvidence(output);
}

function resolveGeminiCliEntrypoint(): string | null {
  if (process.platform !== 'win32') {
    return null;
  }
  const appData = process.env.APPDATA;
  if (!appData) {
    return null;
  }
  const candidate = path.join(
    appData,
    'npm',
    'node_modules',
    '@google',
    'gemini-cli',
    'dist',
    'index.js'
  );
  return fs.existsSync(candidate) ? candidate : null;
}

export class GeminiAdapter {
  private hubWs: WebSocket | null = null;
  private agentId: string;
  private hubUrl: string;
  private isStopping: boolean = false;
  private activeGeminiProcesses: Set<ChildProcess> = new Set();
  private resolvedGeminiApiKey: string | undefined;
  private geminiSessionId: string | null = null;
  private queuedPrompts: Array<{ promptText: string; returnTo: string }> = [];
  private isQueueProcessing = false;
  private autonomousModeEnabled: boolean;
  private readonly generateMaxAttempts: number;
  private readonly processTimeoutMs: number;
  private readonly nonGenerateTimeoutMs: number;
  private readonly logStderr: boolean;

  constructor(hubUrl: string, agentId: string = 'gemini') {
    this.hubUrl = hubUrl;
    this.agentId = agentId;
    this.autonomousModeEnabled = isGeminiAutonomousModeEnabled(
      process.env.AITEAM_AUTONOMOUS_MODE
    );
    this.generateMaxAttempts = parsePositiveInt(
      process.env.AITEAM_GEMINI_GENERATE_MAX_ATTEMPTS,
      DEFAULT_GEMINI_GENERATE_MAX_ATTEMPTS
    );
    this.processTimeoutMs = parsePositiveInt(
      process.env.AITEAM_GEMINI_PROCESS_TIMEOUT_MS,
      DEFAULT_GEMINI_PROCESS_TIMEOUT_MS
    );
    this.nonGenerateTimeoutMs = parsePositiveInt(
      process.env.AITEAM_GEMINI_NON_GENERATE_TIMEOUT_MS,
      DEFAULT_GEMINI_NON_GENERATE_TIMEOUT_MS
    );
    this.logStderr = isGeminiStderrLoggingEnabled(process.env.AITEAM_GEMINI_LOG_STDERR);
  }

  public async start() {
    return new Promise<void>((resolve, reject) => {
      this.hubWs = new WebSocket(this.hubUrl);

      this.hubWs.on('open', () => {
        // console.debug(`[GeminiAdapter] Connected to Hub at ${this.hubUrl}`);
        this.hubWs?.send(JSON.stringify({ type: 'identify', id: this.agentId }));
        this.resolvedGeminiApiKey = resolveGeminiApiKeyFromEnv(process.env);

        if (
          !this.resolvedGeminiApiKey &&
          !process.env.GOOGLE_GENAI_USE_VERTEXAI &&
          !process.env.GOOGLE_GENAI_USE_GCA
        ) {
          console.warn(
            '[GeminiAdapter] GEMINI_API_KEY is not set. Gemini authentication may fail.'
          );
        }

        resolve();
      });

      this.hubWs.on('message', (data) => {
        this.handleHubMessage(data.toString());
      });

      this.hubWs.on('error', (err) => {
        console.error(`[GeminiAdapter] Hub WS error:`, err);
        if (!this.isStopping) reject(err);
      });

      this.hubWs.on('close', () => {
        // console.debug(`[GeminiAdapter] Hub WS closed`);
        this.stop();
      });
    });
  }

  private getChildEnv(): NodeJS.ProcessEnv {
    if (!this.resolvedGeminiApiKey) {
      return process.env;
    }
    return {
      ...process.env,
      GEMINI_API_KEY: this.resolvedGeminiApiKey
    };
  }

  private enqueueGeminiPrompt(promptText: string, returnTo: string) {
    this.queuedPrompts.push({ promptText, returnTo });
    void this.processQueuedPrompts();
  }

  private async processQueuedPrompts() {
    if (this.isQueueProcessing || this.isStopping) {
      return;
    }

    this.isQueueProcessing = true;
    while (!this.isStopping && this.queuedPrompts.length > 0) {
      const nextPrompt = this.queuedPrompts.shift();
      if (!nextPrompt) {
        continue;
      }
      await this.runGeminiPrompt(nextPrompt.promptText, nextPrompt.returnTo);
    }
    this.isQueueProcessing = false;
  }

  private runGeminiPrompt(
    promptText: string,
    returnTo: string,
    attemptNumber = 1
  ): Promise<void> {
    return new Promise((resolve) => {
      const generateMode = isGeminiGeneratePrompt(promptText);
      const generateCommand = generateMode ? extractPrimaryGenerateCommand(promptText) : '';
      const generateRequest = generateMode ? parseGenerateRequest(generateCommand) : null;
      const promptToSend = generateMode
        ? generateRequest
          ? buildGenerateExecutionPrompt(generateRequest)
          : generateCommand
        : promptText;
      const timeoutMs = generateMode
        ? this.processTimeoutMs
        : Math.min(this.processTimeoutMs, this.nonGenerateTimeoutMs);
      const args = buildGeminiTextPromptArgs(
        promptToSend,
        generateMode ? this.geminiSessionId : null
      );
      const geminiCliEntrypoint = resolveGeminiCliEntrypoint();
      const command = geminiCliEntrypoint ? process.execPath : 'gemini';
      const spawnArgs = geminiCliEntrypoint ? [geminiCliEntrypoint, ...args] : args;
      const useShell = process.platform === 'win32' && !geminiCliEntrypoint;
      let geminiProcess: ChildProcess;
      try {
        geminiProcess = spawn(command, spawnArgs, {
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: useShell,
          env: this.getChildEnv()
        });
      } catch (err) {
        this.sendHubMessage(returnTo, 'gemini_error', {
          error: 'Failed to spawn Gemini process',
          details: String(err)
        });
        resolve();
        return;
      }

      this.activeGeminiProcesses.add(geminiProcess);
      let didTimeout = false;
      const timeoutHandle = setTimeout(() => {
        didTimeout = true;
        try {
          geminiProcess.kill();
        } catch {
          // Ignore timeout kill failures.
        }
      }, timeoutMs);

      let bufferedStdout = '';
      let bufferedStderr = '';
      geminiProcess.stdout?.on('data', (chunk) => {
        bufferedStdout += chunk.toString();
      });
      geminiProcess.stderr?.on('data', (chunk) => {
        const text = chunk.toString();
        bufferedStderr += text;
        if (this.logStderr && text.trim().length > 0) {
          console.error('[GeminiAdapter] Gemini stderr:', text.trimEnd());
        }
      });

      geminiProcess.on('error', (err) => {
        clearTimeout(timeoutHandle);
        console.error('[GeminiAdapter] Failed to spawn Gemini:', err);
        this.sendHubMessage(returnTo, 'gemini_error', {
          error: 'Failed to start Gemini process',
          details: String(err)
        });
      });

      geminiProcess.on('exit', (code) => {
        clearTimeout(timeoutHandle);
        const trimmedOutput = normalizeGeminiOutputText(bufferedStdout);
        const trimmedStderr = bufferedStderr.trim();
        if (generateMode) {
          const shouldRetry =
            attemptNumber < this.generateMaxAttempts &&
            shouldRetryGenerateResult(trimmedOutput, bufferedStderr, code);
          if (shouldRetry) {
            console.warn(
              `[GeminiAdapter] Generate attempt ${attemptNumber} did not produce image output. Retrying (${attemptNumber + 1}/${this.generateMaxAttempts}).`
            );
            this.activeGeminiProcesses.delete(geminiProcess);
            void this.runGeminiPrompt(promptText, returnTo, attemptNumber + 1).then(resolve);
            return;
          }

          if (trimmedOutput.length > 0) {
            this.sendHubMessage(returnTo, 'gemini_text', trimmedOutput);
          }

          if (!hasImageOutputEvidence(trimmedOutput)) {
            this.sendHubMessage(returnTo, 'gemini_error', {
              error: 'Gemini generate output missing image evidence',
              attempt: attemptNumber,
              maxAttempts: this.generateMaxAttempts,
              exitCode: code,
              timedOut: didTimeout,
              stdout: trimmedOutput.slice(-4000),
              stderr: trimmedStderr.slice(-2000)
            });
          }
        } else if (trimmedOutput.length > 0) {
          const delegation = extractGeminiDelegationFromText(trimmedOutput);
          if (delegation) {
            this.sendHubMessage(delegation.to, 'delegate', delegation.task);
          } else {
            this.sendHubMessage(returnTo, 'gemini_text', trimmedOutput);
          }
        }
        if (code !== 0) {
          const looksLikeAttachConsoleError =
            /attachconsole failed/i.test(trimmedStderr) ||
            /conpty_console_list_agent/i.test(trimmedStderr);
          this.sendHubMessage(returnTo, 'gemini_error', {
            error: looksLikeAttachConsoleError
              ? 'Gemini CLI failed to attach console'
              : 'Gemini process exited with non-zero status',
            attempt: attemptNumber,
            exitCode: code,
            timedOut: didTimeout,
            stderr: trimmedStderr.slice(-4000)
          });
        }
        this.activeGeminiProcesses.delete(geminiProcess);
        resolve();
      });
    });
  }

  private handleHubMessage(data: string) {
    try {
      const msg = JSON.parse(data);
      if (
        (msg.eventType === 'prompt' ||
          msg.eventType === 'delegate' ||
          msg.eventType === 'raw') &&
        msg.payload !== undefined
      ) {
        const promptText =
          typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload);
        if (!promptText || promptText.trim().length === 0) {
          return;
        }
        const returnTo =
          typeof msg.returnTo === 'string'
            ? msg.returnTo
            : typeof msg.from === 'string'
              ? msg.from
              : 'lead';
        const effectivePromptText =
          this.autonomousModeEnabled && msg.from === 'lead'
            ? buildGeminiAutonomousPrompt(this.agentId, promptText)
            : promptText;
        this.enqueueGeminiPrompt(effectivePromptText, returnTo);
      }
    } catch (e) {
      console.error('[GeminiAdapter] Failed to parse hub message:', e);
    }
  }

  private sendHubMessage(to: string, eventType: string, payload: unknown) {
    if (this.hubWs && this.hubWs.readyState === WebSocket.OPEN) {
      this.hubWs.send(
        JSON.stringify({
          id: randomUUID(),
          from: this.agentId,
          to,
          eventType,
          returnTo: this.agentId,
          timestamp: Date.now(),
          payload
        })
      );
    }
  }

  public stop() {
    if (this.isStopping) return;
    this.isStopping = true;

    this.queuedPrompts = [];
    for (const activeProcess of this.activeGeminiProcesses) {
      activeProcess.kill();
    }
    this.activeGeminiProcesses.clear();
    if (this.hubWs) {
        this.hubWs.close();
        this.hubWs = null;
    }
  }
}
