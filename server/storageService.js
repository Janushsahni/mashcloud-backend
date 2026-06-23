const { Client } = require('minio');
const crypto = require('crypto');
const { Readable } = require('stream');

/**
 * MinIOStorageService
 * Production-grade decentralized storage using MinIO (S3-compatible).
 * Replaces Telegram bot storage with real object storage nodes.
 * Supports multi-node distribution for geographic redundancy.
 */
class MinIOStorageService {
    constructor() {
        // Primary node configuration
        this.primaryConfig = {
            endPoint: process.env.MINIO_ENDPOINT || 'minio',
            port: parseInt(process.env.MINIO_PORT || '9000', 10),
            useSSL: process.env.MINIO_USE_SSL === 'true',
            accessKey: process.env.MINIO_ACCESS_KEY || '',
            secretKey: process.env.MINIO_SECRET_KEY || '',
        };

        // Secondary/replica nodes for geographic distribution
        this.replicaConfigs = [];
        const replicaEndpoints = (process.env.MINIO_REPLICA_ENDPOINTS || '').split(',').filter(Boolean);
        const replicaAccessKeys = (process.env.MINIO_REPLICA_ACCESS_KEYS || '').split(',').filter(Boolean);
        const replicaSecretKeys = (process.env.MINIO_REPLICA_SECRET_KEYS || '').split(',').filter(Boolean);
        const replicaPorts = (process.env.MINIO_REPLICA_PORTS || '').split(',').filter(Boolean);

        for (let i = 0; i < replicaEndpoints.length; i++) {
            this.replicaConfigs.push({
                endPoint: replicaEndpoints[i].trim(),
                port: parseInt(replicaPorts[i]?.trim() || '9000', 10),
                useSSL: process.env.MINIO_USE_SSL === 'true',
                accessKey: replicaAccessKeys[i]?.trim() || this.primaryConfig.accessKey,
                secretKey: replicaSecretKeys[i]?.trim() || this.primaryConfig.secretKey,
            });
        }

        this.bucket = process.env.MINIO_BUCKET || 'mashcloud-storage';
        this.primaryClient = null;
        this.replicaClients = [];
        this.isReady = false;
        this._db = null;

        // Retry configuration
        this.maxRetries = parseInt(process.env.STORAGE_MAX_RETRIES || '3', 10);
        this.retryDelayMs = parseInt(process.env.STORAGE_RETRY_DELAY_MS || '1000', 10);
    }

    async init() {
        this._db = require('./db');

        if (!this.primaryConfig.accessKey || !this.primaryConfig.secretKey) {
            console.error('FATAL: MINIO_ACCESS_KEY or MINIO_SECRET_KEY not set.');
            return;
        }

        try {
            console.log(`Initializing MinIO storage (primary: ${this.primaryConfig.endPoint}:${this.primaryConfig.port})...`);

            // Initialize primary client
            this.primaryClient = new Client(this.primaryConfig);

            // Verify connectivity and create bucket if needed
            const bucketExists = await this.primaryClient.bucketExists(this.bucket);
            if (!bucketExists) {
                await this.primaryClient.makeBucket(this.bucket, 'ap-south-1');
                console.log(`MinIO: Created bucket "${this.bucket}"`);
            }

            // Set bucket policy to private (no public access)
            const policy = {
                Version: '2012-10-17',
                Statement: [
                    {
                        Effect: 'Deny',
                        Principal: '*',
                        Action: 's3:GetObject',
                        Resource: `arn:aws:s3:::${this.bucket}/*`,
                        Condition: {
                            StringNotEquals: {
                                'aws:PrincipalType': 'IAMUser'
                            }
                        }
                    }
                ]
            };

            try {
                await this.primaryClient.setBucketPolicy(this.bucket, JSON.stringify(policy));
            } catch (policyErr) {
                // Some MinIO versions don't support all policy features, continue
                console.warn('MinIO: Bucket policy set warning:', policyErr.message);
            }

            // Initialize replica clients
            for (let i = 0; i < this.replicaConfigs.length; i++) {
                try {
                    const replicaClient = new Client(this.replicaConfigs[i]);
                    const replicaBucketExists = await replicaClient.bucketExists(this.bucket);
                    if (!replicaBucketExists) {
                        await replicaClient.makeBucket(this.bucket, 'ap-south-1');
                    }
                    this.replicaClients.push(replicaClient);
                    console.log(`MinIO: Replica ${i + 1} connected (${this.replicaConfigs[i].endPoint})`);
                } catch (err) {
                    console.error(`MinIO: Replica ${i + 1} failed: ${err.message}`);
                }
            }

            // Create the shard mapping table
            await this._db.query(`
                CREATE TABLE IF NOT EXISTS mc_storage_shards (
                    path TEXT PRIMARY KEY,
                    object_key TEXT NOT NULL,
                    node_endpoint TEXT NOT NULL,
                    size BIGINT DEFAULT 0,
                    checksum TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create index for fast lookups
            await this._db.query(`
                CREATE INDEX IF NOT EXISTS idx_mc_storage_shards_object_key ON mc_storage_shards (object_key)
            `);

            console.log('MinIO: Shard mapping table ready.');
            this.isReady = true;

            const totalNodes = 1 + this.replicaClients.length;
            console.log(`MinIO: Fully initialized across ${totalNodes} storage node(s).`);
        } catch (error) {
            console.error('MinIO: Initialization failed:', error.message);
            this.isReady = false;
        }
    }

    /**
     * Select the storage client for a given shard index.
     * Round-robins across primary + replicas for write distribution.
     */
    _getClientForShard(shardIndex) {
        const allClients = [this.primaryClient, ...this.replicaClients];
        const idx = shardIndex % allClients.length;
        const endpoint = idx === 0
            ? this.primaryConfig.endPoint
            : this.replicaConfigs[idx - 1].endPoint;
        return { client: allClients[idx], endpoint };
    }

    /**
     * Retry wrapper for storage operations
     */
    async _withRetry(operation, operationName) {
        let lastError;
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                return await operation();
            } catch (err) {
                lastError = err;
                if (attempt < this.maxRetries) {
                    const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
                    console.warn(`MinIO: ${operationName} attempt ${attempt} failed, retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        throw lastError;
    }

    /**
     * Upload a file from disk path
     */
    async uploadFile(filePath, destinationPath, shardIndex = 0) {
        if (!this.isReady) {
            throw new Error('MinIO storage service is not initialized.');
        }

        const fs = require('fs');
        const stream = fs.createReadStream(filePath);
        const path = require('path');
        const fileName = path.basename(filePath);
        return this.uploadStream(stream, fileName, destinationPath, shardIndex);
    }

    /**
     * Upload a stream to MinIO storage.
     * Distributes across nodes based on shardIndex.
     */
    async uploadStream(stream, fileName, destinationPath, shardIndex = 0) {
        if (!this.isReady) {
            throw new Error('MinIO storage service is not initialized.');
        }

        const objectKey = destinationPath.startsWith('/')
            ? destinationPath.substring(1)
            : destinationPath;

        const { client, endpoint } = this._getClientForShard(shardIndex);

        return this._withRetry(async () => {
            // Collect stream into buffer for checksum + upload
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);
            const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
            const size = buffer.length;

            // Upload to MinIO
            const readableStream = new Readable();
            readableStream.push(buffer);
            readableStream.push(null);

            await client.putObject(this.bucket, objectKey, readableStream, size, {
                'Content-Type': 'application/octet-stream',
                'x-amz-meta-original-name': fileName,
                'x-amz-meta-checksum-sha256': checksum,
            });

            // Store shard mapping in database
            await this._db.query(
                `INSERT INTO mc_storage_shards (path, object_key, node_endpoint, size, checksum)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (path) DO UPDATE SET object_key = $2, node_endpoint = $3, size = $4, checksum = $5`,
                [destinationPath, objectKey, endpoint, size, checksum]
            );

            return { file_id: objectKey, size, checksum };
        }, `upload ${objectKey}`);
    }

    /**
     * Download a file as a stream from MinIO.
     * Looks up which node holds the shard and fetches from there.
     */
    async getDownloadStream(pathName) {
        if (!this.isReady) {
            throw new Error('MinIO storage service is not initialized.');
        }

        // Look up shard location
        const result = await this._db.query(
            `SELECT object_key, node_endpoint FROM mc_storage_shards WHERE path = $1`,
            [pathName]
        );

        let objectKey;
        let targetClient;

        if (result.rows.length > 0) {
            objectKey = result.rows[0].object_key;
            const nodeEndpoint = result.rows[0].node_endpoint;

            // Find the right client for this endpoint
            if (nodeEndpoint === this.primaryConfig.endPoint) {
                targetClient = this.primaryClient;
            } else {
                const replicaIdx = this.replicaConfigs.findIndex(c => c.endPoint === nodeEndpoint);
                targetClient = replicaIdx >= 0 ? this.replicaClients[replicaIdx] : this.primaryClient;
            }
        } else {
            // Fallback: try primary with path as object key
            objectKey = pathName.startsWith('/') ? pathName.substring(1) : pathName;
            targetClient = this.primaryClient;
        }

        return this._withRetry(async () => {
            const stream = await targetClient.getObject(this.bucket, objectKey);
            // Return in the same format as the old Telegram service (axios-like response)
            return { data: stream };
        }, `download ${objectKey}`);
    }

    /**
     * Delete a file and all its shards from storage.
     */
    async deleteFile(pathName) {
        if (!this.isReady) {
            throw new Error('MinIO storage service is not initialized.');
        }

        // Find all shards matching this base path
        const likePattern = `${pathName}.shard%`;
        const result = await this._db.query(
            `SELECT path, object_key, node_endpoint FROM mc_storage_shards WHERE path LIKE $1`,
            [likePattern]
        );

        // Also try the exact path (non-sharded files)
        const exactResult = await this._db.query(
            `SELECT path, object_key, node_endpoint FROM mc_storage_shards WHERE path = $1`,
            [pathName]
        );

        const allShards = [...result.rows, ...exactResult.rows];

        for (const shard of allShards) {
            try {
                let targetClient = this.primaryClient;
                if (shard.node_endpoint !== this.primaryConfig.endPoint) {
                    const replicaIdx = this.replicaConfigs.findIndex(c => c.endPoint === shard.node_endpoint);
                    if (replicaIdx >= 0) targetClient = this.replicaClients[replicaIdx];
                }
                await targetClient.removeObject(this.bucket, shard.object_key);
            } catch (err) {
                console.error(`MinIO: Failed to delete object ${shard.object_key}: ${err.message}`);
            }
        }

        // Clean up database mappings
        await this._db.query(`DELETE FROM mc_storage_shards WHERE path LIKE $1 OR path = $2`, [likePattern, pathName]);

        return { deleted: true };
    }

    /**
     * Health check: verify all nodes are reachable
     */
    async healthCheck() {
        const results = { primary: false, replicas: [] };

        try {
            await this.primaryClient.bucketExists(this.bucket);
            results.primary = true;
        } catch (err) {
            results.primary = false;
        }

        for (let i = 0; i < this.replicaClients.length; i++) {
            try {
                await this.replicaClients[i].bucketExists(this.bucket);
                results.replicas.push({ index: i, endpoint: this.replicaConfigs[i].endPoint, healthy: true });
            } catch (err) {
                results.replicas.push({ index: i, endpoint: this.replicaConfigs[i].endPoint, healthy: false });
            }
        }

        return results;
    }

    /**
     * Get storage statistics
     */
    async getStats() {
        if (!this._db) return null;
        const result = await this._db.query(
            `SELECT COUNT(*) as total_objects, COALESCE(SUM(size), 0) as total_bytes FROM mc_storage_shards`
        );
        return {
            totalObjects: parseInt(result.rows[0].total_objects, 10),
            totalBytes: parseInt(result.rows[0].total_bytes, 10),
        };
    }
}

module.exports = new MinIOStorageService();
