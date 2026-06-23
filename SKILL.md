---
name: mashcloud-production
description: |
  Production architecture knowledge for the Mashcloud decentralized cloud storage startup.
  Covers: MinIO storage, Redis sessions, Razorpay payments, audit logging, Docker deployment,
  security hardening, and multi-DC distribution patterns for Tier 2/3 Indian data centers.
  Use this skill whenever working on the mashcloud codebase at s:\mashcloud.
---

# Mashcloud Production Architecture Skill

## Project Overview
Mashcloud is a **True Decentralized P2P Mesh cloud storage and compute platform** targeting Indian B2B enterprises.
Instead of relying purely on centralized servers, it uses a BitTorrent/Filecoin-inspired Swarm architecture where files are split via Reed-Solomon and distributed across peer nodes (idle PCs, laptops, and Tier 2/3 data centers) for cost-effective, hyper-fast, and bottleneck-free storage.
Furthermore, it leverages a Hyperspace-inspired Distributed AI Pod model, where idle mesh nodes donate their CPU/VRAM for local, sovereign AI inference (e.g. document OCR and summarization) to ensure absolute DPDP Act compliance without relying on centralized APIs like OpenAI.

## Technology Stack
| Layer | Technology | Location |
|---|---|---|
| Frontend | React + Vite + CSS | `client/src/` |
| Backend | Express.js (Node 20) | `server/server.js` |
| Database | PostgreSQL 16 | `server/db.js` |
| Object Storage | MinIO (S3-compatible) | `server/storageService.js` |
| Session/Cache | Redis 7 | `server/redisService.js` |
| Payments | Razorpay | `server/payments.js` |
| AI | Hyperspace AI + @xenova/transformers fallback | `server/aiUtils.js` |
| Auth | JWT + bcrypt + OTP (email/WhatsApp) | `server/server.js` |
| Email | Stalwart Mail (self-hosted) | docker-compose |
| WhatsApp OTP | SentDM | `server/messagingUtils.js` |
| Deployment | Docker Compose | `docker-compose.yml` |
| Audit | PostgreSQL-backed audit log | `server/auditLog.js` |

## Critical Architecture Rules

### 1. Storage Service (`server/storageService.js`)
- Uses MinIO SDK (NOT Telegram bots — the old `pentaract.js` is deprecated)
- Supports multi-node distribution via `MINIO_REPLICA_ENDPOINTS`
- Round-robin shard distribution across nodes by `shardIndex`
- Stores shard-to-node mapping in `mc_storage_shards` PostgreSQL table
- Has exponential backoff retry logic (configurable via `STORAGE_MAX_RETRIES`)
- SHA-256 checksums on every upload for integrity verification
- Same interface as old pentaract.js: `uploadFile()`, `uploadStream()`, `getDownloadStream()`, `deleteFile()`
- **NEVER** hardcode MinIO credentials. Always use env vars.

### 2. Session Management (`server/redisService.js`)
- CAPTCHA and OTP sessions are stored in Redis with TTL
- Falls back to in-memory `Map` if Redis is unavailable
- The `sessionStore` helper in `server.js` abstracts this dual-mode
- OTP TTL: 600 seconds. CAPTCHA TTL: 300 seconds.
- **NEVER** store sessions in a bare `Map` for production — they are lost on restart.

### 3. Payment Integration (`server/payments.js`)
- Uses Razorpay (not Stripe) for Indian UPI/cards/net banking
- Plans: `starter` (₹49/50GB), `pro` (₹149/200GB), `business` (₹499/1TB)
- Amounts are in paise (smallest INR unit). ₹49 = 4900 paise.
- Self-registers routes via `paymentService.registerRoutes(app, authenticateToken, db)`
- Webhook verification uses HMAC-SHA256 with `RAZORPAY_WEBHOOK_SECRET`
- On payment success: updates `mc_users.plan`, `storage_quota`, `plan_expires_at`

### 4. Security Rules
- CORS: Only whitelisted origins (NOT `callback(null, true)`)
- All secrets in `.env.production` (NEVER in docker-compose.yml)
- JWT Secret must be 64+ bytes of random hex
- Rate limiting: global (1000/15m), auth (30/15m), upload (50/15m), AI (10/15m)
- Audit log every auth event, file upload, deletion, payment
- E2EE: All encryption/decryption happens CLIENT-SIDE. Server never sees plaintext.
- File uploads pass through multer → MinIO. The `PentaractStorage` engine in server.js handles this.

### 5. Database Schema (Key Tables)
```
mc_users          - User accounts, plans, encrypted master keys
mc_files          - File metadata (encrypted names, shard counts, IVs)
mc_photos         - Photo metadata (same pattern as files)
mc_folders        - Folder hierarchy
mc_albums         - Photo albums
mc_album_photos   - Album ↔ Photo junction
mc_storage_shards - Shard-to-MinIO-node mapping (NEW)
mc_payments       - Razorpay payment records (NEW)
mc_audit_log      - Security audit trail (NEW)
mc_telegram_files - DEPRECATED (old Telegram bot mapping)
```

### 6. Docker Deployment
- Services: mashcloud (app), minio, db, redis, stalwart-mail
- All services use `env_file: .env.production`
- MinIO console available on port 9001 (admin UI)
- Health checks on db, redis, minio
- Memory limits enforced via `deploy.resources.limits`

### 7. AI Integration (`server/aiUtils.js` & `client/src/utils/aiPodWorker.js`)
- Primary: **Distributed Mesh Pod Processing**. Active clients act as idle nodes running `aiPodWorker.js` to handle distributed AI tasks.
- Fallback/Server: Hyperspace AI node (OpenAI-compatible API at `HYPERSPACE_URL`) or local `@xenova/transformers`.
- This ensures maximum privacy for B2B documents by processing them on trusted P2P nodes.

### 8. File Upload Flow (Swarm Chunking)
```
Client (E2EE encrypt) → uploadWorker.js splits into Reed-Solomon shards
  → Distributed asynchronously across P2P Mesh nodes and Tier-2 DCs
  → mc_storage_shards DB mapping → response to client
```

### 9. File Download Flow (Parallel Shard Racing)
```
Client request → fetchShardsWithRacing() blasts requests to all Mesh peers
  → Instantly resolves as soon as the first 4 shards arrive (Zero Bottleneck)
  → Client-side E2EE decrypt → Reconstruct → Download
```

## Common Pitfalls
1. **Do NOT use pentaract.js** — it's the old Telegram-based storage, deprecated.
2. **Do NOT hardcode secrets** in docker-compose.yml or source code.
3. **Do NOT use `callback(null, true)` in CORS** — whitelist origins only.
4. **Do NOT store OTP/CAPTCHA in bare `Map`** for production — use sessionStore helper.
5. **Razorpay amounts are in paise**, not rupees. ₹100 = 10000 paise.
6. **MinIO object keys** must NOT start with `/`. Strip leading slash before storage.
7. **The frontend does ALL encryption/decryption**. Server handles only ciphertext.

## Environment Variables Reference
See `.env.production` for the complete list. Critical ones:
- `JWT_SECRET` — 64+ byte random hex
- `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` — MinIO credentials
- `REDIS_PASSWORD` — Redis auth
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — Payment gateway
- `HYPERSPACE_URL` / `HYPERSPACE_API_KEY` — AI node

## Verified File Inventory (Syntax-Checked)
All files below have passed `node -c` syntax validation:

| File | Purpose | Lines | Status |
|---|---|---|---|
| `server/server.js` | Main Express app, all routes | 1391 | ✅ Verified |
| `server/storageService.js` | MinIO storage (replaces pentaract.js) | ~280 | ✅ Verified |
| `server/redisService.js` | Redis session/cache service | ~165 | ✅ Verified |
| `server/payments.js` | Razorpay integration + routes | ~270 | ✅ Verified |
| `server/auditLog.js` | Security audit logging | ~95 | ✅ Verified |
| `server/aiUtils.js` | Hyperspace AI + fallback | ~180 | ✅ Verified |
| `server/db.js` | PostgreSQL connection + schema | 172 | ✅ Verified |
| `server/messagingUtils.js` | SentDM WhatsApp OTP | 59 | ✅ Verified |
| `server/pentaract.js` | DEPRECATED Telegram storage | 201 | ⚠️ Keep for migration |

## OTP Brute-Force Pattern
When an OTP attempt is made, the `session.attempts` counter must be incremented
and persisted back to Redis. The pattern is:
```javascript
session.attempts += 1;
// Must persist the updated counter:
await sessionStore.updateOtp(otpSessionId, session);
```
Without this, the counter resets on each request and brute-force protection fails.

## Production Deployment Checklist
1. [ ] Generate real `JWT_SECRET`: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
2. [ ] Set strong `POSTGRES_PASSWORD`, `MINIO_SECRET_KEY`, `REDIS_PASSWORD`
3. [ ] Register Razorpay account and set `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`
4. [ ] Configure DNS for your domain (e.g., `mashcloud.in`)
5. [ ] Set up Cloudflare (free tier) for CDN + DDoS protection
6. [ ] Set `APP_URL` to your actual production domain
7. [ ] Run `docker compose up -d` on the data center server
8. [ ] Verify health: `curl https://yourdomain.com/api/health`
9. [ ] Test full upload → download flow end-to-end
10. [ ] Test Razorpay payment in test mode before going live
