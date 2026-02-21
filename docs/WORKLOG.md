# aiteam Worklog (Summary)

## Archive Notice
- 2026/02/21 19:37:13 (JST) 時点で `docs/WORKLOG.md` が 449 行だったため、詳細ログを `docs/20260221_WORKLOG_1937.md` に退避。
- 本ファイルは 100 行以内の要約ログとして運用。

## Project Milestones (Condensed)
- 2026/02/21 12:41-13:07 (JST)
  - `AGENTS.md` / `docs/codex_interaction_guide.md` / `docs/PROJECT_SPEC.md` を整備し、Node.js + TypeScript への移行方針を確立。
  - `src/index.ts` と `src/__tests__/hub.spec.ts` を実装し、Central Hub の基本ルーティングを検証。
- 2026/02/21 14:00-14:07 (JST)
  - Phase 5 の Agent Teams 設計レビューを実施し、Gemini Adapter に `@agent` ベース委譲を実装。
- 2026/02/21 15:16-15:36 (JST)
  - E2E データセット（GROWI）を準備し、README を v2 ヘッドレス構成向けに更新。
- 2026/02/21 16:25-16:50 (JST)
  - Codex Adapter の `thread/start -> turn/start` キュー競合とエラールーティングを改善。
  - Adapter/Hub の冗長な INFO/DEBUG ログを抑制し、CLI 表示を簡素化。

## 2026/02/21 19:37:13 (JST)
* **目的:**
  * CLI (`src/cli.ts`) の受信メッセージ表示ロジックを見直し、Codex 由来の JSON-RPC ステータス/デバッグイベント（`turn/started`, `thread/started`, `token_count` 等）を非表示にする。
  * アダプターの実会話テキストのみを表示するフィルタを導入し、回帰防止テストを追加する。
* **変更ファイル:**
  * `src/cli.ts` (修正)
  * `src/__tests__/cli-output-filter.spec.ts` (新規)
  * `docs/WORKLOG.md` (要約化 + 追記)
  * `docs/20260221_WORKLOG_1937.md` (新規; 詳細ログ退避)
* **実行コマンド:**
  * `Get-Content README.md -TotalCount 200`
  * `Get-Content docs/PROJECT_SPEC.md -TotalCount 220`
  * `Get-Content docs/RUNBOOK.md -TotalCount 220` (not found)
  * `Get-Content docs/WORKLOG.md -Tail 120`
  * `pnpm run typecheck`
  * `pnpm run test src/__tests__/cli-output-filter.spec.ts`
  * `pnpm run build`
  * `Copy-Item docs/WORKLOG.md docs/20260221_WORKLOG_1937.md`
* **結果（行数・件数）:**
  * `src/cli.ts` に会話抽出関数 (`extractConversationalText`, `formatCliMessage`) を追加し、非会話 payload は `null` で破棄するよう変更。
  * Codex のステータス系 JSON-RPC メソッド (`thread/started`, `thread/updated`, `turn/started`, `token_count`) を明示的に denylist 化し、CLI表示から除外。
  * WebSocket 受信ハンドラから `[Raw]` フォールバック出力を削除し、JSON パース失敗・非会話イベントは完全に無視。
  * 追加テスト `src/__tests__/cli-output-filter.spec.ts`: 5 tests passed (会話表示1件 + ステータス抑止3件 + Codex出力抽出1件)。
  * `docs/WORKLOG.md` は 449 行 -> 44 行に圧縮（要約化ルールを適用）。
* **出力ファイルパス:**
  * `src/cli.ts`
  * `src/__tests__/cli-output-filter.spec.ts`
  * `docs/WORKLOG.md`
  * `docs/20260221_WORKLOG_1937.md`

## 2026/02/21 20:04:47 (JST)
* **目的:**
  * `src/cli.ts` の `extractConversationalText` を修正し、実際の Codex App Server 通知（`codex/event/*`）から会話テキストを抽出できるようにする。
  * `codex/event/agent_message` と v2 `item/completed`（`agentMessage`）を会話として表示し、`warning` 等の非会話イベントは表示しないことをテストで保証する。
* **変更ファイル:**
  * `src/cli.ts` (修正)
  * `src/__tests__/cli-output-filter.spec.ts` (修正)
  * `docs/WORKLOG.md` (追記)
* **実行コマンド:**
  * `Get-Content README.md -TotalCount 200`
  * `Get-Content docs/PROJECT_SPEC.md -TotalCount 220`
  * `Get-Content docs/WORKLOG.md -Tail 80`
  * `codex app-server generate-ts --out tmp/protocol-ts --experimental`
  * `codex app-server generate-json-schema --out tmp/protocol-schema --experimental`
  * `node -e \"...\"` (Codex app-server を直接起動し、`initialize -> thread/start -> turn/start` の実通知を収集)
  * `pnpm run test src/__tests__/cli-output-filter.spec.ts`
  * `pnpm run typecheck`
  * `pnpm run build`
* **結果（行数・件数）:**
  * 実通知で確認した `method: \"codex/event/agent_message\"` + `params.msg.message` を新たに抽出対象へ追加。
  * `extractTextFromItem` を導入し、`AgentMessage/agentMessage` と `role: assistant` の項目だけを抽出するように変更。
  * `extractTextFromTurn` を `turn.output` に加えて `turn.items`（v2）にも対応。
  * `item/completed` の `params.item.type = agentMessage` から会話テキストを抽出可能にした。
  * 回帰テストを 3 件追加し、`src/__tests__/cli-output-filter.spec.ts` は **8 tests passed**。
* **出力ファイルパス:**
  * `src/cli.ts`
  * `src/__tests__/cli-output-filter.spec.ts`
  * `docs/WORKLOG.md`
