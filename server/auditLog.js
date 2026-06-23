/**
 * AuditLog Service
 * Logs security-sensitive events for compliance (CERT-In, RBI data residency).
 * Stores in PostgreSQL for queryability and retention.
 */
class AuditLogService {
    constructor() {
        this._db = null;
        this.isReady = false;
    }

    async init(db) {
        this._db = db;
        try {
            await this._db.query(`
                CREATE TABLE IF NOT EXISTS mc_audit_log (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER,
                    action TEXT NOT NULL,
                    resource_type TEXT,
                    resource_id TEXT,
                    ip_address TEXT,
                    user_agent TEXT,
                    details JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            await this._db.query(`CREATE INDEX IF NOT EXISTS idx_mc_audit_log_user_id ON mc_audit_log (user_id)`);
            await this._db.query(`CREATE INDEX IF NOT EXISTS idx_mc_audit_log_action ON mc_audit_log (action)`);
            await this._db.query(`CREATE INDEX IF NOT EXISTS idx_mc_audit_log_created_at ON mc_audit_log (created_at)`);

            this.isReady = true;
            console.log('AuditLog: Table ready.');
        } catch (err) {
            console.error('AuditLog: Init failed:', err.message);
        }
    }

    /**
     * Log an auditable event.
     * @param {object} params
     * @param {number} params.userId
     * @param {string} params.action - e.g. 'auth.login', 'file.upload', 'file.delete', 'payment.completed'
     * @param {string} params.resourceType - e.g. 'file', 'photo', 'user', 'payment'
     * @param {string} params.resourceId
     * @param {object} params.req - Express request object (for IP/UA extraction)
     * @param {object} params.details - Additional context
     */
    async log({ userId, action, resourceType, resourceId, req, details }) {
        if (!this.isReady) return;

        const ipAddress = req
            ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
            : 'system';
        const userAgent = req ? (req.headers['user-agent'] || 'unknown') : 'system';

        try {
            await this._db.query(
                `INSERT INTO mc_audit_log (user_id, action, resource_type, resource_id, ip_address, user_agent, details)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [userId || null, action, resourceType || null, resourceId || null, ipAddress, userAgent, details ? JSON.stringify(details) : null]
            );
        } catch (err) {
            console.error('AuditLog: Write failed:', err.message);
        }
    }

    /**
     * Query recent audit events for admin dashboard.
     */
    async getRecent(limit = 100, userId = null) {
        if (!this.isReady) return [];
        try {
            let query = `SELECT * FROM mc_audit_log`;
            const params = [];
            if (userId) {
                query += ` WHERE user_id = $1`;
                params.push(userId);
            }
            query += ` ORDER BY created_at DESC LIMIT ${parseInt(limit, 10)}`;
            const result = await this._db.query(query, params);
            return result.rows;
        } catch (err) {
            return [];
        }
    }
}

module.exports = new AuditLogService();
