# WORKLOG (Summary)

このファイルは要約版です。詳細ログは `docs/20260224_WORKLOG_0004.md` を参照。

## 主要マイルストーン（要約）
- 2026-02-21〜2026-02-22:
  - aiteam v2 (Node.js/TypeScript) 基盤を整備。
  - Central Hub (WebSocket/JSON-RPC) と `codex`/`claude`/`gemini` 各アダプターを実装。
  - tmux依存の旧運用からヘッドレス密結合アーキテクチャへ移行。
- 2026-02-22:
  - Inter-Agent Router の挙動改善。
  - Windows経路 (`PowerShell -> wezterm cli -> aiteam`) のE2E再現性を強化。
  - `docs/RUNBOOK.md` 整備。
- 2026-02-23:
  - CLI UX改善（`/status`、待機表示、重複表示抑制、Hub配信エラー表示）。
  - Codex起動既定値を最適化（`approval_policy="never"`, `model_reasoning_effort="medium"`）。
  - Claude/GeminiアダプターのWindows挙動を調整し、関連テストを更新。
  - READMEの運用記述を現行仕様へ同期。

## 直近エントリ

### 2026/02/24 09:30:26 (JST)
- 目的:
  - セットアップ後の実行確認として、CLIの実起動スモークテストとエージェントCLI解決状況を確認する。
- 変更ファイル:
  - 更新: `docs/WORKLOG.md`
- 実行コマンド:
  - `Get-Command codex | Select-Object -ExpandProperty Source`
  - `Get-Command claude | Select-Object -ExpandProperty Source`
  - `Get-Command gemini | Select-Object -ExpandProperty Source`
  - `node dist/cli.js codex`
  - `exit`（対話プロンプトに入力）
- 結果:
  - `codex` / `claude` / `gemini` の各CLIをPATH上で解決可能であることを確認。
  - `aiteam` 起動時に `--- aiteam CLI ---` 表示を確認。
  - `You(codex)>` プロンプト表示後、`exit` で正常終了（`Shutting down...`）。
  - 補足: `GEMINI_API_KEY` 未設定警告は表示されるが、CLI起動確認自体は成功。
- 出力ファイルパス:
  - `dist/cli.js`

### 2026/02/24 09:26:50 (JST)
- 目的:
  - 新規環境で `aiteam` を実行可能にするため、依存導入・ビルド・グローバル実行導線のセットアップを行う。
- 変更ファイル:
  - 更新: `docs/WORKLOG.md`
- 実行コマンド:
  - `node -v`
  - `npm install -g pnpm`
  - `pnpm -v`
  - `pnpm install`
  - `pnpm run build`
  - `node dist/cli.js -h`
  - `pnpm setup`
  - `$env:PNPM_HOME='C:\Users\080001538\AppData\Local\pnpm'; $env:Path="$env:PNPM_HOME;$env:Path"; pnpm link --global`
  - `$env:PNPM_HOME='C:\Users\080001538\AppData\Local\pnpm'; $env:Path="$env:PNPM_HOME;$env:Path"; aiteam -h`
- 結果:
  - `pnpm` をグローバル導入し、`pnpm@8.15.4` を利用可能化。
  - 依存インストール完了（`pnpm install` 成功）。
  - ビルド成功（`dist/cli.js` を含む成果物生成）。
  - `pnpm link --global` によりグローバル shim を作成。
  - `PNPM_HOME` を PATH に含めたセッションで `aiteam -h` の起動を確認。
- 出力ファイルパス:
  - `dist/cli.js`
  - `C:\Users\080001538\AppData\Local\pnpm\aiteam.cmd`

### 2026/02/23 23:57:11 (JST)
- 目的:
  - ユーザー報告の「codex応答が見えない/遅い」現象を優先して、待機UXとCodex起動設定を改善する。
- 変更ファイル:
  - 更新: `src/adapters/codex.ts`
  - 更新: `src/cli.ts`
  - 更新: `src/__tests__/cli-output-filter.spec.ts`
  - 更新: `README.md`
  - 更新: `docs/WORKLOG.md`
- 実行コマンド:
  - `pnpm run build`
  - `pnpm exec vitest run src/__tests__/cli-output-filter.spec.ts src/__tests__/adapters/codex.spec.ts src/__tests__/e2e/headless-workflow.spec.ts src/__tests__/e2e/cli-ux-resilience.spec.ts`
  - `node tmp/codex_medium_probe.cjs`
- 結果:
  - Codex adapter の既定起動パラメータ最適化と待機表示改善を反映。
  - 対象テスト pass（`4 files / 16 tests`）。
  - `sup` の初回 `agent_message` が約10秒で返ることを実測。
- 出力ファイルパス:
  - `dist/cli.js`

### 2026/02/24 00:18:44 (JST)
- 目的:
  - ユーザー要望に合わせて、Codex の既定 `model_reasoning_effort` を `medium` から `high` に変更する。
- 変更ファイル:
  - 更新: `src/adapters/codex.ts`
  - 更新: `README.md`
  - 更新: `docs/WORKLOG.md`
- 実行コマンド:
  - `pnpm run build`
- 結果:
  - `DEFAULT_CODEX_REASONING_EFFORT` を `high` に変更。
  - README の既定値説明を `high` に更新。
  - `build` 成功。
- 出力ファイルパス:
  - `dist/cli.js`

### 2026/02/24 00:42:25 (JST)
- 目的:
  - `GEMINI_API_KEY_FILE` 依存を削除し、`GEMINI_API_KEY` のみでGemini認証を行うよう整理する。
  - 併せて Gemini 応答の実E2Eを追加し、ローカル実行で pass を確認する。
- 変更ファイル:
  - 更新: `src/adapters/gemini.ts`
  - 追加: `src/__tests__/adapters/gemini-api-key.spec.ts`
  - 追加: `src/__tests__/e2e/gemini-response.spec.ts`
  - 更新: `docs/WORKLOG.md`
- 実行コマンド:
  - `pnpm run build`
  - `pnpm exec vitest run src/__tests__/adapters/gemini-api-key.spec.ts src/__tests__/adapters/gemini.spec.ts --reporter verbose`
  - `$env:AITEAM_RUN_REAL_GEMINI_E2E='1'; pnpm exec vitest run src/__tests__/e2e/gemini-response.spec.ts --reporter verbose`
- 結果:
  - APIキー解決:
    - `resolveGeminiApiKeyFromEnv` は `GEMINI_API_KEY` のみ参照する実装へ変更。
    - `GEMINI_API_KEY_FILE` の読込・パス解決ロジックを削除。
  - テスト:
    - `gemini-api-key.spec.ts`: `3/3 pass`
    - `gemini.spec.ts`: `1/1 pass`
    - `gemini-response.spec.ts`（実Gemini E2E）: `1/1 pass`（約64秒）
- 出力ファイルパス:
  - `dist/cli.js`

### 2026/02/24 00:45:30 (JST)
- 目的:
  - ユーザー依頼に基づき、`AGENTS.md` の未コミット差分を取り込み、未pushコミットを含めて全体をpushする。
- 変更ファイル:
  - 更新: `AGENTS.md`
  - 更新: `docs/WORKLOG.md`
- 実行コマンド:
  - `git diff -- AGENTS.md`
  - `git add AGENTS.md docs/WORKLOG.md`
  - `git commit`
  - `git push`
- 結果:
  - `AGENTS.md` のログ運用文言を `git commit&push` に更新した差分をコミット対象へ追加。
  - 先行コミットを含めて `master` を `origin/master` へ push。
- 出力ファイルパス:
  - なし（ドキュメント更新）

### 2026/02/24 00:04:25 (JST)
- 目的:
  - リポジトリ説明依頼に対応するため、`README.md` / `docs/PROJECT_SPEC.md` / `docs/RUNBOOK.md` / `docs/WORKLOG.md` と主要実装 (`src/cli.ts`, `src/index.ts`, `src/adapters/codex.ts`) を確認して要点を整理する。
  - `docs/WORKLOG.md` が 400 行超過のため、運用ルールに従い要約化・退避を実施する。
- 変更ファイル:
  - 追加: `docs/20260224_WORKLOG_0004.md`
  - 更新: `docs/WORKLOG.md`
- 実行コマンド:
  - `Get-ChildItem -Force`
  - `rg --files`
  - `Get-Content -Raw README.md`
  - `Get-Content -Raw docs/PROJECT_SPEC.md`
  - `Get-Content -Raw docs/RUNBOOK.md`
  - `Get-Content -Tail 120 docs/WORKLOG.md`
  - `Get-Content -Raw package.json`
  - `Get-Content -Raw src/index.ts`
  - `Get-Content -Raw src/cli.ts`
  - `Get-Content -Raw src/adapters/codex.ts`
- 結果:
  - リポジトリの目的・構成・実行手順・テスト方針を要約可能な状態に整理。
  - `docs/WORKLOG.md` を要約版へ更新し、詳細ログを `docs/20260224_WORKLOG_0004.md` に退避。
- 出力ファイルパス:
  - `docs/20260224_WORKLOG_0004.md`
  - `docs/WORKLOG.md`
