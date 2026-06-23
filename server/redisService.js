const Redis = require('ioredis');

/**
 * RedisService
 * Production Redis client for session stores, caching, and rate limiting.
 * Replaces in-memory Maps (captchaStore, otpStore) that are lost on restart.
 */
class RedisService {
    constructor() {
        this.client = null;
        this.isReady = false;
    }

    async init() {
        const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
        const redisPassword = process.env.REDIS_PASSWORD || undefined;

        try {
            this.client = new Redis(redisUrl, {
                password: redisPassword,
                maxRetriesPerRequest: 3,
                retryStrategy(times) {
                    const delay = Math.min(times * 500, 5000);
                    return delay;
                },
                lazyConnect: true,
            });

            await this.client.connect();
            this.isReady = true;
            console.log('Redis: Connected successfully.');
        } catch (err) {
            console.warn(`Redis: Connection failed (${err.message}). Falling back to in-memory store.`);
            this.isReady = false;
            this.client = null;
        }
    }

    /**
     * Store a CAPTCHA with TTL
     */
    async setCaptcha(captchaId, text, ttlSeconds = 300) {
        if (!this.isReady) return false;
        try {
            await this.client.setex(
                `captcha:${captchaId}`,
                ttlSeconds,
                JSON.stringify({ text, expires: Date.now() + ttlSeconds * 1000 })
            );
            return true;
        } catch (err) {
            console.error('Redis setCaptcha error:', err.message);
            return false;
        }
    }

    async getCaptcha(captchaId) {
        if (!this.isReady) return null;
        try {
            const data = await this.client.get(`captcha:${captchaId}`);
            return data ? JSON.parse(data) : null;
        } catch (err) {
            return null;
        }
    }

    async deleteCaptcha(captchaId) {
        if (!this.isReady) return;
        try {
            await this.client.del(`captcha:${captchaId}`);
        } catch (err) {
            // Silently fail
        }
    }

    /**
     * Store OTP session with TTL
     */
    async setOtpSession(sessionId, sessionData, ttlSeconds = 600) {
        if (!this.isReady) return false;
        try {
            await this.client.setex(
                `otp:${sessionId}`,
                ttlSeconds,
                JSON.stringify(sessionData)
            );
            return true;
        } catch (err) {
            console.error('Redis setOtpSession error:', err.message);
            return false;
        }
    }

    async getOtpSession(sessionId) {
        if (!this.isReady) return null;
        try {
            const data = await this.client.get(`otp:${sessionId}`);
            return data ? JSON.parse(data) : null;
        } catch (err) {
            return null;
        }
    }

    async updateOtpSession(sessionId, sessionData, ttlSeconds = 600) {
        return this.setOtpSession(sessionId, sessionData, ttlSeconds);
    }

    async deleteOtpSession(sessionId) {
        if (!this.isReady) return;
        try {
            await this.client.del(`otp:${sessionId}`);
        } catch (err) {
            // Silently fail
        }
    }

    /**
     * Generic cache operations
     */
    async set(key, value, ttlSeconds) {
        if (!this.isReady) return false;
        try {
            if (ttlSeconds) {
                await this.client.setex(key, ttlSeconds, JSON.stringify(value));
            } else {
                await this.client.set(key, JSON.stringify(value));
            }
            return true;
        } catch (err) {
            return false;
        }
    }

    async get(key) {
        if (!this.isReady) return null;
        try {
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (err) {
            return null;
        }
    }

    async del(key) {
        if (!this.isReady) return;
        try {
            await this.client.del(key);
        } catch (err) {
            // Silently fail
        }
    }

    /**
     * Health check
     */
    async healthCheck() {
        if (!this.isReady || !this.client) return false;
        try {
            const result = await this.client.ping();
            return result === 'PONG';
        } catch (err) {
            return false;
        }
    }
}

module.exports = new RedisService();
