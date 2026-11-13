# Mashcloud — Master Project Context & Startup Specification

> **Classification:** Internal Startup Master Blueprint & Technical Specification  
> **Target Market:** Indian B2B Enterprises, Privacy-First SMEs, Legal/Healthcare, DPDP Act Compliance  
> **Platform Version:** Production Swarm Architecture  
> **Source Directory:** `s:\mashcloud`

---

## 1. Executive Summary & Startup Plan

### 1.1 The Problem
Centralized cloud storage providers (Amazon AWS S3, Google Cloud Storage, Microsoft Azure) impose an extractive monopoly model on Indian businesses:
1. **Predatory Egress Fees:** Uploading data is free, but retrieving it costs \$0.05–\$0.09 per GB, holding enterprise data hostage.
2. **Centralized Surveillance & Data Sovereignty Risks:** Foreign hyper-scalers hold encryption keys, leaving Indian data subject to extraterritorial subpoenas (e.g., US CLOUD Act) and regulatory violation under India's Digital Personal Data Protection (DPDP) Act 2023.
3. **Single Point of Failure (SPOF):** Frequent regional outages in centralized data centers paralyze dependent business operations.
4. **Extravagant Cost Margins:** Hyper-scalers operate at 60%+ gross margins, making petabyte-scale storage prohibitively expensive for startups and mid-market Indian enterprises.

### 1.2 The Mashcloud Solution
Mashcloud is a **True Decentralized P2P Mesh Cloud Storage & Sovereign AI Compute Platform**. It breaks files into encrypted erasure shards, scattering them across a federated network of low-cost Tier-2/3 Indian data centers, dedicated enterprise nodes, and idle peer capacity.

By pairing **Client-Side Zero-Knowledge Encryption (AES-256-GCM)** with **WASM-powered 4+2 Reed-Solomon Erasure Coding** and **Parallel Shard Racing**, Mashcloud provides:
- **80% lower total cost of ownership** compared to AWS S3.
- **Zero single-point-of-failure** resiliency.
- **Absolute mathematical privacy** (the server never touches plaintext data or encryption keys).
- **Native UPI/Rupee billing** with zero cryptocurrency or blockchain token friction.

---

## 2. Business Model & Go-To-Market (GTM)

### 2.1 Pricing & Revenue Streams
Unlike crypto-based decentralized storage (Filecoin, Storj) that demands crypto tokens and volatile gas fees, Mashcloud operates entirely on transparent, INR-denominated subscription tiers powered by Razorpay:

| Plan Tier | Storage Quota | Pricing (INR) | Pricing (Paise) | Target Audience |
|---|---|---|---|---|
| **Starter** | 50 GB | ₹49 / month | 4,900 paise | Freelancers, developers, individual pros |
| **Pro** | 200 GB | ₹149 / month | 14,900 paise | Small businesses, legal consultancies, clinics |
| **Business** | 1 TB | ₹499 / month | 49,900 paise | Mid-market enterprises, tech startups, agencies |
| **Enterprise Custom** | 5 TB – 100 TB+ | Volume-based | Custom invoice | High-scale data archiving, DPDP compliance |

### 2.2 Unit Economics & Margins
- **Storage Infrastructure Cost:** Aggregating raw NVMe/HDD storage in Tier-2/3 Indian DCs (Jaipur, Indore, Kochi, Noida) costs ~₹40–₹60 per TB/month.
- **Gross Margins:** At ₹499 per TB on the Business tier, Mashcloud commands gross margins exceeding **75%**, while remaining **70% cheaper** than AWS S3 standard storage + egress.

### 2.3 Target Verticals in India
1. **Legal & Financial Services:** Mandatory zero-knowledge confidentiality and non-custodial document vaults.
2. **Healthcare & Diagnostics:** HIPAA and DPDP Act compliant archival of high-resolution radiology scans and patient records.
3. **Media & Production Houses:** High-capacity archival without egress penalties for multi-terabyte raw video footage.
4. **Indian EdTech & Tech Startups:** Eliminating Dollar-denominated AWS S3 bills with predictable Rupee pricing.

---

## 3. Unique Selling Propositions (USPs) & Competitive Moat

### 3.1 vs Centralized Cloud Monopolies (AWS / GCP / Azure)
* **Zero Egress Taxation:** Free high-speed downloads via distributed mesh egress.
* **Mathematical Immunity to Data Breaches:** Client-side zero-knowledge encryption ensures that even if storage servers are compromised, attackers only acquire encrypted, partial polynomial shards.
* **Guaranteed Domestic Data Sovereignty:** Data resides strictly within verified Indian geographical boundaries, fully fulfilling DPDP Act data localization mandates.
* **Multi-Datacenter Fault Tolerance:** Survives simultaneous failure of 2 out of every 6 storage clusters without data degradation.

### 3.2 vs Crypto Decentralized Storage (Filecoin, Storj, Sia, Arweave)
* **Zero Crypto Friction:** No wallets, no seed phrases, no gas fees, and no exchange volatility. Pure Razorpay UPI/Netbanking.
* **Zero Retrieval Latency (Shard Racing):** Eliminates blockchain contract negotiation pauses. Blasts all shard locations simultaneously and resolves instantly upon receiving the first 4 chunks.
* **Integrated Sovereign Edge AI:** Combines decentralized storage with local document processing (OCR, summarization) via browser/node workers without routing sensitive files to third-party AI APIs.

---

## 4. Technical Architecture & How the Technology Works

### 4.1 End-to-End File Ingestion Pipeline
```
[ 1. User Client (Browser / App) ]
       │
       ▼
   AES-256-GCM Encryption (Client-side PBKDF2 Master Key)
       │
       ▼
   Reed-Solomon Erasure Coding (`@subspace/reed-solomon-erasure.wasm`)
   Split into 6 Shards (4 Data Shards + 2 Parity Shards)
       │
       ▼
[ 2. Mashcloud Core API (`server/server.js`) ]
       │
       ▼
   Storage Dispatch Engine (`server/storageService.js`)
   Round-robin distribution by shardIndex across storage endpoints
       │
       ├──► Shard 0, 3  ──► Primary MinIO Node (Local Docker Cluster)
       ├──► Shard 1, 4  ──► Secondary MinIO Replica (Tier-2 DC Node 1)
       └──► Shard 2, 5  ──► Tertiary MinIO Replica (Tier-2 DC Node 2)
       │
       ▼
[ 3. Metadata Persistence (`server/db.js`) ]
   PostgreSQL updates `mc_files` and `mc_storage_shards`
```

### 4.2 File Retrieval Pipeline (Parallel Shard Racing)
```
[ 1. User Requests File Download ]
       │
       ▼
[ 2. API Queries PostgreSQL `mc_storage_shards` ]
   Returns endpoints and object keys for all 6 shards
       │
       ▼
[ 3. Parallel Shard Racing (`fetchShardsWithRacing`) ]
   Client blasts simultaneous parallel download streams to all 6 shard locations
       │
       ▼
[ 4. Instant Resolution on Threshold Arrival ]
   As soon as any 4 of the 6 shards land in memory:
   - Slower 2 connections are aborted immediately.
   - WASM Reed-Solomon reconstructs the original contiguous ciphertext buffer.
       │
       ▼
[ 5. Client-Side Decryption ]
   AES-256-GCM decrypts ciphertext to plaintext.
   Instant browser stream / disk write.
```

### 4.3 Distributed AI Pod Model (`client/src/utils/aiPodWorker.js` & `server/aiUtils.js`)
- Idle peer nodes and active client browsers opt into a sovereign compute pool.
- Background Web Workers run local quantized models (via `@xenova/transformers` / Hyperspace network).
- B2B documents are parsed, OCR-processed, and summarized locally without sending unencrypted enterprise documents to OpenAI or external cloud endpoints.

---

## 5. Storage Topology: Where and How Data Is Stored

| Storage Layer | Component | Implementation | Physical Host Location |
|---|---|---|---|
| **Data Payload (Shards)** | MinIO Object Storage | S3-Compatible API, Bucket `mashcloud-storage` | Docker volume `minio_data` mounted at `/data`; Multi-node replicas on Tier-2/3 DC servers |
| **Relational Metadata** | PostgreSQL 16 | Relational Engine, DB `mashcloud` | Docker volume `pg_data` mounted at `/var/lib/postgresql/data` |
| **Session & OTP Cache** | Redis 7 | In-memory key-value with TTL | Docker volume `redis_data` mounted at `/data` |
| **Email Subsystem** | Stalwart Mail | Self-hosted secure mail server | Docker volume `stalwart_data` |
| **Client Cryptography** | Browser WebCrypto | Non-extractable CryptoKey | User's local device volatile RAM / Local Vault |

---

## 6. Complete Technology Stack

```
MASHCLOUD ENTERPRISE STACK
├── Frontend Tier:
│   ├── Framework: React 18 + Vite
│   ├── Cryptography: Native WebCrypto API (AES-GCM, PBKDF2)
│   ├── Erasure Engine: @subspace/reed-solomon-erasure.wasm
│   ├── Edge Compute: Web Workers + @xenova/transformers
│   └── API Communication: Axios with parallel shard racing
│
├── Backend Application Tier:
│   ├── Runtime: Node.js 20 LTS
│   ├── Framework: Express.js (Modular Route Layout)
│   ├── Ingestion Engine: Multer + Custom Pentaract/MinIO Streaming Engine
│   ├── Session Store: Redis 7 (with in-memory fallback)
│   ├── Security: Helmet, CORS Whitelisting, Audit Logging (`server/auditLog.js`)
│   └── Multi-Channel OTP: SentDM (WhatsApp OTP) + Stalwart Mail (Self-hosted Email OTP)
│
├── Data & Object Storage Tier:
│   ├── Database: PostgreSQL 16 (Connection Pool via `pg`)
│   ├── Object Storage: MinIO Distributed Cluster (S3 SDK)
│   └── Shard Distribution: Multi-Node Round-Robin with SHA-256 Checksums
│
├── Commercial & Payments Tier:
│   ├── Gateway: Razorpay Enterprise API
│   ├── Currency: INR (Indian Rupee / Paise precision)
│   └── Webhook Engine: HMAC-SHA256 signature verification
│
└── Infrastructure & Deployment:
    ├── Containerization: Docker & Docker Compose
    ├── Resource Limits: Hard CPU & Memory constraints per container
    └── Reverse Proxy: Nginx / Cloudflare CDN edge
```

---

## 7. Ecosystem Roadmap: WinFsp + Rclone Virtual Drive Upgrade

To scale beyond browser web uploads, Mashcloud integrates **WinFsp (Windows File System Proxy)** combined with **Rclone** to deliver a native desktop virtual drive (`M:\`):
1. **Native Drive Mounting:** Mounts decentralized sharded storage as a native Windows drive letter in Windows Explorer.
2. **Sparse Byte-Range Streaming:** Streams multi-gigabyte video and archive files on-demand by fetching only the active 1MB Reed-Solomon shards requested by the OS kernel, cutting initial load times by 95%.
3. **Local Write-Back Caching:** Applications save files to `M:\` instantly; background daemons handle encryption, sharding, and multi-node distribution asynchronously.
4. **Third-Party Application Compatibility:** Direct compatibility with Adobe Premiere, AutoCAD, Microsoft Office, and Windows automated backup scripts.

