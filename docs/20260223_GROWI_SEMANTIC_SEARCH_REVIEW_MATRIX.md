# GROWI Semantic Search: Impact Scope & Review Matrix
**Token:** `growi_deep_1771778496391`

## 1. Impact Scope

### 1.1 Backend API
*   **Search Endpoint (`/api/v3/search`):** Introduction of a hybrid search capability (BM25 + Vector Search). The API must accept semantic queries and route them to both Elasticsearch and the Vector database/index.
*   **Embedding Service Integration:** New internal service or API client to interact with OpenAI Embeddings API (or equivalent). Must handle rate limiting, timeouts, and fallback to keyword-only search if the embedding service is degraded.
*   **Access Control (ACL):** Ensure that semantic search results strictly adhere to the same ACLs as the current keyword search. The filtering must happen at the database/index query level, not post-retrieval, to prevent information leakage.
*   **Indexing Hooks:** Modifying existing page create/update/delete hooks to trigger asynchronous re-indexing and embedding generation for semantic search.

### 1.2 Data Model
*   **Document Chunking:** Pages will be split into smaller chunks (e.g., paragraphs or fixed token lengths) to improve embedding accuracy.
*   **Vector Storage Schema:** Introduction of dense vector fields alongside existing document metadata (page ID, revision ID, chunk index, ACL permissions).
*   **Metadata Sync:** Tracking `embedding_version` or `hash` to know when a chunk needs to be re-embedded due to content changes or model upgrades.

### 1.3 Infrastructure
*   **Search Engine Upgrades:** Depending on the current Elasticsearch version, upgrading or configuring it to support dense vector fields and approximate nearest neighbor (ANN) search. Alternatively, provisioning a new dedicated vector database.
*   **Asynchronous Workers:** Provisioning or scaling background worker queues (e.g., Redis/Bull/RabbitMQ) to handle the asynchronous job of chunking documents and fetching embeddings without blocking the main Node.js event loop.
*   **Network/Egress:** Allowing outbound API calls to external embedding providers (e.g., OpenAI API) from the worker nodes.

### 1.4 Monitoring
*   **Search Latency:** Tracking p50, p90, and p99 latencies for hybrid search vs. keyword-only search.
*   **Embedding API Health:** Monitoring error rates (429s, 5xxs) and latencies of the external embedding API.
*   **Indexing Lag:** Measuring the time delta between a page update and its vector index being fully updated and searchable.
*   **Fallback Rate:** Monitoring how often the system falls back to keyword-only search due to vector search failures.

### 1.5 Rollout Plans
*   **Phase 1: Background Indexing (Dark Launch):** Deploy data model changes and indexing workers. Begin backfilling embeddings for existing pages without exposing the feature to users.
*   **Phase 2: Opt-In Beta:** Enable the semantic search toggle for specific beta workspaces or administrative users to gather qualitative feedback and ensure ACL compliance.
*   **Phase 3: A/B Testing:** Roll out the feature to a percentage of production users, comparing CTR (Click-Through Rate) and search refinement metrics against the control group.
*   **Phase 4: General Availability:** Make semantic search the default hybrid search mechanism for all users, with a documented fallback procedure.

---

## 2. Review Matrix

| Component | Review Area | Key Review Questions | Reviewer Role | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Backend API** | Hybrid Search Logic | Is the score blending formula between BM25 and Vector scores documented and mathematically sound? | Backend Tech Lead | Pending |
| | ACL Enforcement | Are ACL filters applied *before* or *during* the vector similarity search, preventing post-retrieval leakage? | Security Engineer | Pending |
| | Fallback Mechanism | Does the API gracefully degrade to BM25-only if the embedding API is unreachable? | Reliability Eng. | Pending |
| **Data Model** | Chunking Strategy | Does the chunking strategy handle code blocks and markdown tables effectively without losing context? | Data Scientist / AI Eng. | Pending |
| | Schema Migration | Is there a safe migration path for existing Elasticsearch indices to support dense vectors? | Database Admin | Pending |
| **Infrastructure**| Cost Analysis | What is the estimated monthly cost for embedding generation and vector storage at current growth rates? | Engineering Manager| Pending |
| | Worker Scaling | Are the background workers auto-scaled based on queue length to handle bulk page imports? | DevOps / SRE | Pending |
| **Monitoring** | Observability | Are distributed traces capturing the external embedding API calls? | DevOps / SRE | Pending |
| | Alerting | Are alerts configured for `Fallback Rate > 5%` or `Indexing Lag > 10m`? | Reliability Eng. | Pending |
| **Rollout** | Backfill Strategy | Is the backfill script idempotent, and does it respect the embedding API rate limits? | Backend Engineer | Pending |
| | Revert Plan | Is there a one-click kill switch to completely disable vector search and revert to the old API path? | Release Manager | Pending |