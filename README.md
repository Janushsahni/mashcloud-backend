<div align="center">

# ⚡ Mashcloud

### Sovereign P2P Mesh Cloud Storage & Zero-Knowledge AI Compute

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docker Compose](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](docker-compose.yml)
[![Node.js](https://img.shields.io/badge/Node.js-20_LTS-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18_Vite-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![MinIO](https://img.shields.io/badge/MinIO-S3_Compatible-C72C48?logo=minio&logoColor=white)](https://min.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![Security](https://img.shields.io/badge/Security-AES--256--GCM-success)](#zero-knowledge-security)
[![Compliance](https://img.shields.io/badge/Compliance-DPDP_Act_2023-orange)](#data-sovereignty--compliance)

<p align="center">
  <b>Eliminating hyper-scaler egress taxation and centralized single-points-of-failure.</b><br>
  Engineered with client-side zero-knowledge encryption, 4+2 Reed-Solomon WASM erasure coding, parallel shard racing, and sovereign multi-datacenter clustering.
</p>

[Architecture](#-architecture) •
[Key Features](#-key-features) •
[Quickstart](#-quickstart-docker) •
[Tech Stack](#-technology-stack) •
[Storage Topology](#-storage-topology) •
[Roadmap](#-desktop-virtual-drive-winfsp--rclone)

---

</div>

## 📌 Overview

Centralized cloud monopolies (AWS S3, Google Cloud Storage, Azure) lock Indian enterprises into predatory egress fees ($0.05–$0.09/GB), expose sensitive corporate IP to foreign subpoena jurisdictions, and create brittle single points of failure.

**Mashcloud** re-engineers cloud storage into a decentralized, high-performance mesh:
1. **Zero-Knowledge Privacy:** All encryption happens in the client browser/agent before byte transmission.
2. **Mathematical Erasure Resiliency:** Files are split into 4 data + 2 parity shards using Reed-Solomon polynomial math. Any 2 storage nodes can undergo total hardware destruction with zero data loss.
3. **Parallel Shard Racing:** Client fetch requests blast all nodes simultaneously and reassemble the file as soon as the fastest 4 shards arrive, eliminating long-tail latency.
4. **Zero Crypto Friction:** Transparent Indian Rupee (INR) subscriptions via Razorpay UPI and netbanking—no volatile tokens, gas fees, or crypto wallets.

---

## ⚡ Key Features

- 🔐 **Client-Side Zero-Knowledge Encryption**: AES-256-GCM cipher with PBKDF2 master key derivation. Plaintext and keys never touch Mashcloud servers.
- 🧩 **Reed-Solomon WASM Sharding**: Client-side `@subspace/reed-solomon-erasure.wasm` chunks data into a $4+2$ matrix (6 shards total; any 4 reconstruct the file).
- 🚀 **Parallel Shard Racing**: Eliminates server bottlenecks by querying distributed MinIO nodes in parallel. Slow nodes are pruned on the fly.
- 🤖 **Distributed Edge AI Pods**: Idle mesh nodes run privacy-preserving document OCR, summarization, and vector indexing using local WebAssembly models (`@xenova/transformers` / Hyperspace).
- 🇮🇳 **DPDP Act 2023 Compliant**: Storage clusters reside strictly in sovereign Tier-2/3 Indian data centers (Jaipur, Indore, Kochi, Noida).
- 💳 **Enterprise INR Billing**: Out-of-the-box Razorpay integration supporting UPI, credit cards, and corporate netbanking.

---

## 🏗 Architecture

```
[ CLIENT TIER (Browser / Agent) ]
  │
  ├─► 1. AES-256-GCM Encryption (Client Master Key)
  ├─► 2. WASM Reed-Solomon Erasure Coding (4 Data + 2 Parity = 6 Shards)
  │
[ INGESTION & DISPATCH TIER (Express API) ]
  │
  ├─► 3. Storage Service Engine (`server/storageService.js`)
  │      Round-robin modulo dispatch across multi-datacenter endpoints
  │
[ OBJECT STORAGE SWARM ]
  │
  ├──► MinIO Primary Node ──► [Volume: minio_data] (ap-south-1)
  ├──► MinIO Replica 1    ──► [Tier-2 DC Node: Indore]
  └──► MinIO Replica 2    ──► [Tier-2 DC Node: Jaipur]
  │
[ TOPOLOGY & AUDIT REGISTRY ]
  │
  ├──► PostgreSQL 16 ──────► [mc_storage_shards, mc_files, mc_users, mc_audit_log]
  └──► Redis 7       ──────► [Session Tokens, OTP/CAPTCHA cache with TTL]
```

---

## 🛠 Technology Stack

| Layer | Component | Description |
|---|---|---|
| **Frontend** | React 18 + Vite | Single-page enterprise dashboard with dark UI |
| **Erasure Coding** | WebAssembly | `@subspace/reed-solomon-erasure.wasm` |
| **Client Crypto** | WebCrypto API | AES-256-GCM, PBKDF2 key derivation |
| **Backend API** | Node.js 20 + Express | High-concurrency asynchronous REST gateway |
| **Object Storage** | MinIO (S3-Compatible) | Geographically distributed storage nodes |
| **Relational DB** | PostgreSQL 16 | Shard topology registry, user plans, audit trails |
| **Session / Cache** | Redis 7 Alpine | Rate limits, brute-force protection, OTP/CAPTCHA |
| **Payment Gateway** | Razorpay | Native UPI and Rupee settlement in paise |
| **Mail & Messaging**| Stalwart Mail + SentDM | Self-hosted email OTP + WhatsApp verification |
| **Orchestration** | Docker Compose | Multi-container microservices with memory quotas |

---

## 🚀 Quickstart (Docker)

### 1. Prerequisites
- Docker Engine 24+ & Docker Compose v2+
- Git

### 2. Clone and Configure
```bash
git clone https://github.com/Janushsahni/mashcloud-backend.git
cd mashcloud-backend

# Copy production environment template
cp .env.production .env
```

### 3. Generate Security Keys
```bash
# Generate a strong 64-byte random JWT Secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Update your `.env` with your generated `JWT_SECRET`, `POSTGRES_PASSWORD`, `MINIO_SECRET_KEY`, and `REDIS_PASSWORD`.

### 4. Boot the Swarm
```bash
docker compose up -d --build
```

### 5. Verify Node Health
```bash
# Check service status
docker compose ps

# Check API health endpoint
curl http://localhost:3005/api/health
```

Access the MinIO Object Console at `http://localhost:9001` using your configured root credentials.

---

## 📂 Project Structure

```
mashcloud/
├── client/                     # React + Vite Frontend
│   ├── src/
│   │   ├── components/         # Dashboard, File Manager, Auth, Vault UI
│   │   ├── utils/
│   │   │   ├── erasureUtils.js # 4+2 Reed-Solomon WASM sharding & reconstruction
│   │   │   ├── cryptoUtils.js  # Client-side AES-GCM & PBKDF2 encryption
│   │   │   └── aiPodWorker.js  # Distributed P2P AI inference Web Worker
│   │   └── api.js              # Parallel Shard Racing client
│   └── package.json
│
├── server/                     # Express.js Backend API
│   ├── server.js               # Core HTTP server & endpoint routing
│   ├── storageService.js       # MinIO S3 multi-node replication & shard tracking
│   ├── db.js                   # PostgreSQL connection pool & schema migration
│   ├── redisService.js         # Redis session store & rate-limiting logic
│   ├── payments.js             # Razorpay subscription & webhook verification
│   ├── aiUtils.js              # Sovereign Hyperspace / local AI inference fallback
│   ├── auditLog.js             # Tamper-evident security audit logging
│   └── messagingUtils.js       # WhatsApp (SentDM) & Email OTP dispatchers
│
├── docker-compose.yml          # Production multi-container composition
├── Dockerfile                  # Production-optimized container build
├── CONTEXT.md                  # Comprehensive startup & technical blueprint
└── README.md                   # Repository documentation
```

---

## 💽 Storage Topology

Data is segregated across three distinct physical and cryptographic planes:

1. **Client Device (Cryptographic Isolation)**:
   - Plaintext files and master encryption keys exist exclusively in browser volatile memory. Zero plaintext ever reaches network interfaces.
2. **MinIO Storage Shard Nodes**:
   - Stores raw, immutable ciphertext fragments with anonymized UUID keys.
   - Primary node: `minio_data` persistent volume (`/data`).
   - Secondary nodes: Distributed across remote data center IPs via `MINIO_REPLICA_ENDPOINTS`.
3. **PostgreSQL 16 Metadata Registry**:
   - `mc_storage_shards`: Maps each shard to its node endpoint, size, and SHA-256 checksum.
   - `mc_files`: Stores file size, shard counts, and base64-encoded initialization vectors (IVs).
   - `mc_users`: Stores PBKDF2-derived authentication hashes and client-encrypted key vaults.

---

## 🔮 Desktop Virtual Drive (WinFsp + Rclone)

Under active development on the Mashcloud roadmap:
- **Mount Mashcloud as `M:\`**: Native Windows filesystem proxy integration via **WinFsp**.
- **Sparse Byte-Range Streaming**: Watch 4K videos and open large CAD/database archives without pre-downloading the entire file; fetches only the requested 1MB Reed-Solomon slices on demand.
- **Local Write-Back Caching**: Apps save directly to `M:\` with near-zero latency, while background daemons handle encryption, sharding, and multi-node distribution asynchronously.

---

## 📄 License & Compliance

Distributed under the MIT License. Built with strict compliance toward the **Digital Personal Data Protection (DPDP) Act of India**.
