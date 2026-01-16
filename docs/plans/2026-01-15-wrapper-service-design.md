# Wrapper Service Design

Goal
- Deploy a dedicated wrapper service for AFB script generation and wire the Vercel Next API to call it with optional shared-secret auth.

Architecture
- The wrapper runs as a long-lived Express server (Render) that exposes /api/afb and optional /api/context/debug.
- The Next API (/api/afb in the Next app) forwards requests to the wrapper using WRAPPER_* env vars and a request_id for traceability.
- The wrapper stays stateless: request data and BYOA content are used only within the request lifecycle and not persisted.

Security and Abuse Controls
- Optional shared secret: if WRAPPER_AUTH_TOKEN is set, require Authorization: Bearer <token> (header name configurable).
- Rate limit applies to /api routes; JSON body size caps remain; BYOA content is size-capped.
- CORS is restricted to allowed origins (Vercel domain + configured CLIENT_URL).
- Allowlist HTTP methods and known paths; reject unexpected methods with 405.

Traceability
- Every response includes request_id, context_version, context_hash, and a data_provenance summary.
- context_hash is computed from canonicalized, ordered JSON of the post-truncation context payload plus context_version.
- /api/context/debug returns the canonical context payload, context_version, and data_provenance for debugging.

Timeouts
- The wrapper enforces a request deadline (e.g., 25s) to avoid orphaned OpenAI calls when Vercel times out.
- The Next API keeps a strict timeout and does not retry; if it does, it must reuse request_id.

Deployment
- Render Web Service with root dir my-parlaygpt, start command `npm start`.
- Env vars: GPT_API_KEY or OPENAI_API_KEY, GPT_MODEL_ID (optional), GPT_BASE_URL (optional), WRAPPER_AUTH_TOKEN (optional), WRAPPER_AUTH_HEADER (optional), WRAPPER_ALLOWED_ORIGINS (optional).
- Vercel env vars: WRAPPER_BASE_URL, WRAPPER_ENDPOINT_PATH=/api/afb, WRAPPER_AUTH_HEADER=Authorization, WRAPPER_AUTH_TOKEN, WRAPPER_TIMEOUT_MS.
