const Razorpay = require('razorpay');
const crypto = require('crypto');

/**
 * PaymentService
 * Production Razorpay integration for Indian market (UPI, cards, net banking).
 */
class PaymentService {
    constructor() {
        this.instance = null;
        this.isReady = false;
        this.webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';

        // Plan definitions (amounts in paise — Razorpay uses smallest currency unit)
        this.plans = {
            starter: {
                name: 'Starter',
                amount: 4900,        // ₹49
                currency: 'INR',
                storageLimitBytes: 50 * 1024 * 1024 * 1024,  // 50 GB
                durationDays: 30,
                features: ['50 GB Storage', 'E2EE Encryption', 'File Sharding', 'Email Support'],
            },
            pro: {
                name: 'Pro',
                amount: 14900,       // ₹149
                currency: 'INR',
                storageLimitBytes: 200 * 1024 * 1024 * 1024, // 200 GB
                durationDays: 30,
                features: ['200 GB Storage', 'E2EE Encryption', 'AI Tagging & Summary', 'Priority Support'],
            },
            business: {
                name: 'Business',
                amount: 49900,       // ₹499
                currency: 'INR',
                storageLimitBytes: 1024 * 1024 * 1024 * 1024, // 1 TB
                durationDays: 30,
                features: ['1 TB Storage', 'E2EE Encryption', 'AI Tagging & Summary', 'Dedicated Support', 'Team Features'],
            },
        };
    }

    init() {
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;

        if (!keyId || !keySecret) {
            console.warn('PaymentService: RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set. Payments disabled.');
            return;
        }

        this.instance = new Razorpay({
            key_id: keyId,
            key_secret: keySecret,
        });

        this.isReady = true;
        console.log('PaymentService: Razorpay initialized successfully.');
    }

    /**
     * Create a Razorpay order for a plan upgrade.
     */
    async createOrder(planKey, userId, userEmail) {
        if (!this.isReady) {
            throw new Error('Payment service is not configured.');
        }

        const plan = this.plans[planKey];
        if (!plan) {
            throw new Error(`Invalid plan: ${planKey}`);
        }

        const order = await this.instance.orders.create({
            amount: plan.amount,
            currency: plan.currency,
            receipt: `mashcloud_${userId}_${Date.now()}`,
            notes: {
                userId: String(userId),
                email: userEmail,
                plan: planKey,
            },
        });

        return {
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            plan: planKey,
            planName: plan.name,
            keyId: process.env.RAZORPAY_KEY_ID,
        };
    }

    /**
     * Verify payment signature from Razorpay callback.
     */
    verifyPayment(orderId, paymentId, signature) {
        if (!this.isReady) return false;

        const body = orderId + '|' + paymentId;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest('hex');

        return expectedSignature === signature;
    }

    /**
     * Verify webhook signature from Razorpay server-to-server events.
     */
    verifyWebhookSignature(body, signature) {
        if (!this.webhookSecret) return false;

        const expectedSignature = crypto
            .createHmac('sha256', this.webhookSecret)
            .update(body)
            .digest('hex');

        return expectedSignature === signature;
    }

    /**
     * Get plan details
     */
    getPlan(planKey) {
        return this.plans[planKey] || null;
    }

    /**
     * Get all plans for display
     */
    getAllPlans() {
        return Object.entries(this.plans).map(([key, plan]) => ({
            key,
            ...plan,
            amountDisplay: `₹${(plan.amount / 100).toFixed(0)}`,
        }));
    }

    /**
     * Register payment routes on the Express app.
     */
    registerRoutes(app, authenticateToken, db) {
        // Create payment tables
        this._initDatabase(db);

        // GET /api/plans — list available plans
        app.get('/api/plans', (req, res) => {
            res.json({ plans: this.getAllPlans() });
        });

        // POST /api/payments/create-order — create Razorpay order
        app.post('/api/payments/create-order', authenticateToken, async (req, res) => {
            try {
                const { plan } = req.body;
                if (!plan || !this.plans[plan]) {
                    return res.status(400).json({ error: 'Invalid plan selected.' });
                }

                if (!this.isReady) {
                    return res.status(503).json({ error: 'Payment service is not available.' });
                }

                const order = await this.createOrder(plan, req.user.userId, req.user.email);

                // Store pending order in database
                await db.query(
                    `INSERT INTO mc_payments (user_id, razorpay_order_id, plan, amount, currency, status)
                     VALUES ($1, $2, $3, $4, $5, 'pending')`,
                    [req.user.userId, order.orderId, plan, order.amount, order.currency]
                );

                res.json(order);
            } catch (err) {
                console.error('Create order error:', err.message);
                res.status(500).json({ error: 'Failed to create payment order.' });
            }
        });

        // POST /api/payments/verify — verify payment after Razorpay callback
        app.post('/api/payments/verify', authenticateToken, async (req, res) => {
            try {
                const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

                if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
                    return res.status(400).json({ error: 'Missing payment verification data.' });
                }

                const isValid = this.verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);
                if (!isValid) {
                    await db.query(
                        `UPDATE mc_payments SET status = 'failed' WHERE razorpay_order_id = $1`,
                        [razorpay_order_id]
                    );
                    return res.status(400).json({ error: 'Payment verification failed.' });
                }

                // Get the pending payment record
                const paymentResult = await db.query(
                    `SELECT plan FROM mc_payments WHERE razorpay_order_id = $1 AND user_id = $2`,
                    [razorpay_order_id, req.user.userId]
                );

                if (paymentResult.rows.length === 0) {
                    return res.status(404).json({ error: 'Payment record not found.' });
                }

                const planKey = paymentResult.rows[0].plan;
                const plan = this.plans[planKey];

                // Update payment status
                await db.query(
                    `UPDATE mc_payments SET status = 'completed', razorpay_payment_id = $1, razorpay_signature = $2, completed_at = CURRENT_TIMESTAMP
                     WHERE razorpay_order_id = $3`,
                    [razorpay_payment_id, razorpay_signature, razorpay_order_id]
                );

                // Upgrade the user's plan
                const expiresAt = new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000);
                await db.query(
                    `UPDATE mc_users SET plan = 'premium', storage_quota = $1, plan_expires_at = $2 WHERE id = $3`,
                    [plan.storageLimitBytes, expiresAt, req.user.userId]
                );

                res.json({
                    message: 'Payment verified and plan upgraded successfully.',
                    plan: planKey,
                    planName: plan.name,
                    storageQuota: plan.storageLimitBytes,
                    expiresAt: expiresAt.toISOString(),
                });
            } catch (err) {
                console.error('Payment verify error:', err.message);
                res.status(500).json({ error: 'Failed to verify payment.' });
            }
        });

        // POST /api/payments/webhook — Razorpay server-to-server webhook
        app.post('/api/payments/webhook', async (req, res) => {
            try {
                const signature = req.headers['x-razorpay-signature'];
                const body = JSON.stringify(req.body);

                if (!this.verifyWebhookSignature(body, signature)) {
                    return res.status(400).json({ error: 'Invalid webhook signature.' });
                }

                const event = req.body.event;
                const payload = req.body.payload;

                if (event === 'payment.captured') {
                    const orderId = payload.payment.entity.order_id;
                    await db.query(
                        `UPDATE mc_payments SET status = 'captured' WHERE razorpay_order_id = $1`,
                        [orderId]
                    );
                } else if (event === 'payment.failed') {
                    const orderId = payload.payment.entity.order_id;
                    await db.query(
                        `UPDATE mc_payments SET status = 'failed' WHERE razorpay_order_id = $1`,
                        [orderId]
                    );
                }

                res.json({ status: 'ok' });
            } catch (err) {
                console.error('Webhook error:', err.message);
                res.status(500).json({ error: 'Webhook processing failed.' });
            }
        });

        // GET /api/payments/history — user's payment history
        app.get('/api/payments/history', authenticateToken, async (req, res) => {
            try {
                const result = await db.query(
                    `SELECT id, plan, amount, currency, status, created_at, completed_at
                     FROM mc_payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
                    [req.user.userId]
                );
                res.json(result.rows);
            } catch (err) {
                res.status(500).json({ error: 'Failed to fetch payment history.' });
            }
        });
    }

    async _initDatabase(db) {
        try {
            await db.query(`
                CREATE TABLE IF NOT EXISTS mc_payments (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES mc_users(id) ON DELETE CASCADE,
                    razorpay_order_id TEXT UNIQUE,
                    razorpay_payment_id TEXT,
                    razorpay_signature TEXT,
                    plan TEXT NOT NULL,
                    amount INTEGER NOT NULL,
                    currency TEXT DEFAULT 'INR',
                    status TEXT DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP
                )
            `);
            await db.query(`CREATE INDEX IF NOT EXISTS idx_mc_payments_user_id ON mc_payments (user_id)`);
            await db.query(`CREATE INDEX IF NOT EXISTS idx_mc_payments_order_id ON mc_payments (razorpay_order_id)`);
            console.log('PaymentService: Database tables ready.');
        } catch (err) {
            console.error('PaymentService: Database init error:', err.message);
        }
    }
}

module.exports = new PaymentService();
