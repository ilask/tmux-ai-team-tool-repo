# CODEX Impact Scope: GROWI Semantic Search (Elasticsearch Vector + OpenAI Embeddings)

## 1. 目的
- GROWI に ACL 安全なセマンティック検索を追加し、既存のキーワード検索（BM25）とハイブリッド統合する。
- 検索品質を上げつつ、障害時は既存検索へ自動フォールバックして可用性を維持する。

## 2. 影響範囲（実装レイヤ別）

### 2.1 Application/API 層（GROWI Server）
- `search` API にハイブリッド検索経路を追加（vector + keyword）。
- リクエストごとに ACL 条件を確定し、vector/BM25 の両クエリへ同一 `filter` を適用。
- レスポンスに `finalScore` と内訳（`vectorScore`, `keywordScore`）をオプション付与。
- 機能フラグ（例: `SEMANTIC_SEARCH_ENABLED`）で段階ロールアウト可能化。

### 2.2 Ingestion/Indexing 層
- ページ更新イベント（作成/更新/削除/公開状態変更/権限変更）をキュー投入。
- チャンク化（例: 400-800 tokens, overlap 80）を実装し、`page_id:revision_id:chunk_no` で冪等 upsert。
- OpenAI Embeddings 呼び出しをワーカーに集約し、再試行・DLQ・レート制御を実装。
- 削除/非公開時は tombstone による chunk 一括削除を適用。

### 2.3 Search Backend 層（Elasticsearch）
- Vector index（`dense_vector` + metadata）と keyword index（BM25）を併用。
- 例示インデックス:
  - vector: `growi_semantic_pages`
  - keyword: `growi_pages_text`
- 運用は alias（read/write）で blue-green 再索引を可能にする。

### 2.4 Data/Schema 層
- 追加メタデータ: `workspace_id`, `page_id`, `revision_id`, `path`, `title`, `chunk_text`, `acl_principals`, `updated_at`, `embedding_model`, `embedding_version`。
- 埋め込み再生成に備え、`embedding_model/version` を必須保存。
- 変更差分再埋め込みのため `content_hash` を保存（コスト削減）。

### 2.5 Security/Compliance 層
- ACL 後段フィルタのみの設計は禁止（検索クエリ内での強制 filter が必須）。
- OpenAI API Key はサーバ側シークレット管理。クライアント露出禁止。
- 監査ログに `query`, `user`, `acl_filter`, `result_ids` を記録（PII マスキング前提）。

### 2.6 Reliability/Operations 層
- 主要メトリクス: `index_lag_seconds`, `embedding_error_rate`, `fallback_rate`, `search_latency_p95`。
- 主要 SLO（初期案）:
  - 検索 p95 < 1.2s
  - インデックス反映 p95 < 5分
  - 可用性 99.9%
- OpenAI 障害時は自動で BM25 only に切替。

### 2.7 QA/Testing 層
- オフライン評価: NDCG@10 / MRR / ゼロ件率を現行比較。
- オンライン評価: CTR, 検索後行動（クリック・滞在）を A/B テスト。
- セキュリティ試験: ACL 漏えい回帰テストを必須ゲート化。

## 3. 非対象（Out of Scope）
- LLM 生成回答（RAG 回答生成）機能。
- 権限モデル自体の再設計。
- UI 全面刷新（初期は既存検索 UI に段階統合）。

## 4. 既知の論点（相互レビュー対象）
- インデックス命名方針:
  - 案A: `growi_semantic_pages`（単一明示名）
  - 案B: `growi_semantic_v1` + `read/write alias`（運用重視）
- イベント起点:
  - 案A: App サーバイベントフック
  - 案B: MongoDB 変更起点（CDC/差分処理）
- Ownership 制約:
  - `nanobanana MCP` は `gemini` 所有（`claude`/`codex` 非所有）を前提とする。

## 5. 合意に向けた提案（codex案）
- 命名: 実体は versioned index（`growi_semantic_v1`）、外部参照は alias（`growi_semantic_read`/`growi_semantic_write`）に統一。
- イベント起点: 一次起点は App イベント、整合性補正として定期再走査（reconciliation）を併用。
- Ownership: 図生成パイプラインは `gemini -> nanobanana MCP` のみ許可し、運用ルールとして固定。
