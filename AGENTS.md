# AI Team Members

This file contains guidelines and context for interacting with the various AI agents in this project.
It is intended to be read by the main agent (like Gemini, Claude, or Cursor) to understand how to effectively coordinate with sub-agents like Codex.

## Codex CLI

When instructing or communicating with the Codex CLI, be aware of its specific execution quirks, especially when running non-interactively.

**⚠️ IMPORTANT: Before attempting to run commands against `codex` or `codex exec`, please review the [Codex CLI Interaction Guide](docs/codex_interaction_guide.md).**

It contains crucial knowledge gathered from trial-and-error regarding:
*   How to properly pass multi-line prompts without causing hangs.
*   Why piping (`|`) into `codex exec` might fail on certain OS environments.
*   How to correctly format flags for non-interactive mode.

## ログ運用
- 作業ごとに `docs/WORKLOG.md` を更新しgit commitする
- ユーザーへ返信する前に、その作業の `docs/WORKLOG.md` 追記を完了する
- `docs/WORKLOG.md` には JST の日時を明記する
- `docs/WORKLOG.md` が 400 行を超えたら、`docs/WORKLOG.md` は 100 行の要約に更新し、詳細ログは `docs/YYYYMMDD_WORKLOG_****.md` に退避する
- 最低限以下を残す:
  - 目的
  - 変更ファイル
  - 実行コマンド
  - 結果（行数、列、スコア等）
  - 出力ファイルパス

## 開始前チェック
- `README.md` を確認する
- `docs/PROJECT_SPEC.md` と `docs/RUNBOOK.md` を確認する
- `docs/WORKLOG.md` の直近エントリを確認する