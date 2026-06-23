require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const svgCaptcha = require('svg-captcha');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const fs = require('fs');
const db = require('./db');
const storageService = require('./storageService');
const aiUtils = require('./aiUtils');
const cookieParser = require('cookie-parser');
const { body, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const messagingUtils = require('./messagingUtils');
const redisService = require('./redisService');
const paymentService = require('./payments');
const AuditLog = require('./auditLog');
const geoSecurityMiddleware = require('./geoSecurity');

const app = express();
const PORT = process.env.PORT || 3005;

// Security Hardening (Cors & Helmet are applied below in init)

// --- Validate Critical Environment Variables ---
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'mashcloud-super-secret-key') {
    console.warn('WARNING: JWT_SECRET is not set or is using default. Set a strong random secret for production.');
}
const EFFECTIVE_JWT_SECRET = JWT_SECRET || 'mashcloud-super-secret-key';

const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

// --- Nodemailer Setup ---
let transporter;

const setupTransporter = async () => {
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: Number(process.env.SMTP_PORT) === 465,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            },
            tls: {
                rejectUnauthorized: false
            }
        });
        try {
            await transporter.verify();
            console.log('SMTP Email Transporter verified and ready.');
        } catch (err) {
            console.error('SMTP Email Transporter verification failed:', err.message);
            console.error('Email sending will fail until SMTP credentials are fixed.');
        }
    } else {
        console.warn('WARNING: SMTP credentials not configured (SMTP_HOST, SMTP_USER, SMTP_PASS).');
        console.warn('Email verification will not work. Set SMTP env vars for production.');
        // Provide a transporter that logs instead of silently dropping
        transporter = {
            sendMail: async (info) => {
                console.log('--- EMAIL NOT SENT (SMTP not configured) ---');
                console.log('To:', info.to);
                console.log('Subject:', info.subject);
                console.log('Text:', info.text);
                console.log('----------------------------------------------');
                return { messageId: 'not-sent' };
            }
        };
    }
};
setupTransporter();

// --- Security Middleware ---
const isProduction = process.env.NODE_ENV === 'production';

// Trust proxy for correct IP detection behind Docker/nginx
app.set('trust proxy', 1);

// --- Input Sanitization Helpers ---
const sanitizeFilename = (name) => {
    if (!name || typeof name !== 'string') return 'unnamed';
    return name.replace(/[\x00-\x1f\x80-\x9f]/g, '') // Remove control chars
              .replace(/\.\.[\/\\]/g, '')              // Remove path traversal
              .replace(/[\/\\:*?"<>|]/g, '_')           // Replace dangerous chars
              .substring(0, 255);                       // Limit length
};

const sanitizeText = (text) => {
    if (!text || typeof text !== 'string') return '';
    return text.replace(/[<>]/g, c => c === '<' ? '&lt;' : '&gt;').trim().substring(0, 500);
};

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", "'unsafe-eval'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:", "https://ui-avatars.com"],
            frameSrc: ["'self'", "blob:"],
            mediaSrc: ["'self'", "blob:"],
            connectSrc: ["'self'", "blob:"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

// CORS: In production, only allow the app's own origin. In dev, allow Vite dev server.
const allowedOrigins = isProduction
    ? [APP_URL]
    : ['http://localhost:5173', 'http://localhost:3005'];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true
}));

app.use(express.json());
app.use(cookieParser());

// Enforce Data Residency and VPN blocking on all API routes
app.use('/api', geoSecurityMiddleware);

// --- MASHCLOUD SIGNATURE MIDDLEWARE ---
app.use((req, res, next) => {
    res.setHeader('X-Mashcloud-Signature', 'Handcrafted with excellence by Janush sahni. Built for privacy, secured with Pentaract E2EE. © 2026.');
    next();
});
// --------------------------------------

// Rate limiting
const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, please try again later.' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Please try again later.' } });
const uploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false, message: { error: 'Upload limit reached. Please try again later.' } });
const aiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'AI processing limit reached. Please try again later.' } });

app.use('/api/', globalLimiter);
app.use('/api/auth', authLimiter);

// --- File Upload Config ---
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE_MB || 50) * 1024 * 1024; // Default 50MB

function PentaractStorage(opts) {}
PentaractStorage.prototype._handleFile = async function _handleFile(req, file, cb) {
    if (!req.uploadFilename) {
        req.uploadFilename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    }
    
    const indexMatch = file.originalname.match(/shard(\d+)/) || [0, 0];
    const index = parseInt(indexMatch[1], 10);
    
    try {
        const destPath = `/${req.uploadFilename}.shard${index}`;
        await storageService.uploadStream(file.stream, file.originalname, destPath, index);
        cb(null, {
            path: destPath,
            size: file.stream.bytesRead || 0
        });
    } catch (err) {
        cb(err);
    }
}
PentaractStorage.prototype._removeFile = function _removeFile(req, file, cb) {
    cb(null);
}

const storage = new PentaractStorage();

const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        // Block dangerous file extensions
        const blocked = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.js', '.msi', '.jar', '.com', '.scr', '.pif', '.reg', '.inf', '.hta', '.wsf', '.cpl'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (blocked.includes(ext)) {
            return cb(new Error('File type not allowed'), false);
        }
        cb(null, true);
    }
});

// --- Auth Middleware ---
const authenticateToken = async (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    try {
        const decoded = jwt.verify(token, EFFECTIVE_JWT_SECRET);
        const result = await db.query(
            'SELECT id, is_verified, storage_quota, storage_used, plan, plan_expires_at FROM mc_users WHERE id = $1',
            [decoded.userId]
        );
        if (result.rows.length === 0) return res.status(401).json({ error: 'User not found' });
        const user = result.rows[0];
        const isPremium = user.plan === 'premium' && (!user.plan_expires_at || new Date(user.plan_expires_at) > new Date());
        req.user = {
            userId: user.id,
            email: decoded.email,
            is_verified: user.is_verified,
            storage_quota: user.storage_quota,
            storage_used: user.storage_used,
            plan: user.plan || 'free',
            isPremium
        };
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            res.clearCookie('token');
            return res.status(401).json({ error: 'Session expired. Please sign in again.' });
        }
        console.error("Auth error:", err);
        return res.status(403).json({ error: 'Invalid session' });
    }
    
    next();
};

const requireVerified = (req, res, next) => {
    if (!req.user.is_verified) {
        return res.status(403).json({ error: 'Please verify your email address before uploading files.' });
    }
    next();
};

// --- Serve File Downloads (authenticated) ---
app.get('/uploads/:filename', authenticateToken, async (req, res) => {
    const filename = req.params.filename;
    const userId = req.user.userId;
    try {
        const result = await db.query(
            `SELECT id FROM mc_files WHERE filename = $1 AND user_id = $2
             UNION
             SELECT id FROM mc_photos WHERE filename = $1 AND user_id = $2`,
            [filename, userId]
        );
        if (result.rows.length === 0) return res.status(403).json({ error: 'Access denied' });

        const response = await storageService.getDownloadStream(`/${filename}`);
        response.data.pipe(res);
    } catch (err) {
        console.error('Download error:', err.message);
        res.status(404).json({ error: 'File not found or unavailable' });
    }
});

// --- Serve Static Frontend ---
app.use(express.static(path.join(__dirname, '../client/dist')));

// --- CAPTCHA & OTP Stores (Redis-backed with in-memory fallback) ---
const captchaStore = new Map();
const otpStore = new Map();

// Cleanup expired in-memory entries every 5 minutes (fallback only)
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of captchaStore) {
        if (val.expires && val.expires < now) captchaStore.delete(key);
    }
    for (const [key, val] of otpStore) {
        if (val.expires < now) otpStore.delete(key);
    }
}, 5 * 60 * 1000);

// Helper: Get/Set CAPTCHA from Redis or fallback to Map
const sessionStore = {
    async setCaptcha(id, data) {
        const stored = await redisService.setCaptcha(id, data.text, 300);
        if (!stored) captchaStore.set(id, data);
    },
    async getCaptcha(id) {
        let data = await redisService.getCaptcha(id);
        if (!data) data = captchaStore.get(id) || null;
        return data;
    },
    async deleteCaptcha(id) {
        await redisService.deleteCaptcha(id);
        captchaStore.delete(id);
    },
    async setOtp(id, data) {
        const stored = await redisService.setOtpSession(id, data, 600);
        if (!stored) otpStore.set(id, data);
    },
    async getOtp(id) {
        let data = await redisService.getOtpSession(id);
        if (!data) data = otpStore.get(id) || null;
        return data;
    },
    async updateOtp(id, data) {
        const stored = await redisService.updateOtpSession(id, data, 600);
        if (!stored) otpStore.set(id, data);
    },
    async deleteOtp(id) {
        await redisService.deleteOtpSession(id);
        otpStore.delete(id);
    },
};

// --- AUTH ROUTES ---
app.get('/api/auth/captcha', async (req, res) => {
    const captcha = svgCaptcha.create({ size: 5, ignoreChars: '0o1i', noise: 2, color: true, background: '#333' });
    const captchaId = crypto.randomUUID();
    await sessionStore.setCaptcha(captchaId, { text: captcha.text.toLowerCase(), expires: Date.now() + 5 * 60 * 1000 });
    res.json({ id: captchaId, svg: captcha.data });
});

// --- Key Escrow Helpers ---
const SERVER_ESCROW_KEY = crypto.createHash('sha256').update(EFFECTIVE_JWT_SECRET).digest();

const escrowEncrypt = (text) => {
    if (!text) return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', SERVER_ESCROW_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const tag = cipher.getAuthTag().toString('base64');
    return `${iv.toString('base64')}:${encrypted}:${tag}`;
};

const escrowDecrypt = (escrowedStr) => {
    if (!escrowedStr) return null;
    const [ivB64, encryptedB64, tagB64] = escrowedStr.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', SERVER_ESCROW_KEY, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    let decrypted = decipher.update(encryptedB64, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};

const reEncryptMasterKeyWithNewPassword = (rawMasterKeyB64, newPassword, email) => {
    const rawMasterKeyBuffer = Buffer.from(rawMasterKeyB64, 'base64');
    const saltBuffer = Buffer.from(email.toLowerCase() + "MASHCLOUD", 'utf8');
    const kek = crypto.pbkdf2Sync(newPassword, saltBuffer, 100000, 32, 'sha256');
    
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);
    let encrypted = cipher.update(rawMasterKeyBuffer);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const tag = cipher.getAuthTag();
    
    // Web Crypto appends the tag to the ciphertext
    const combinedCiphertext = Buffer.concat([encrypted, tag]);
    
    return `${iv.toString('base64')}:${combinedCiphertext.toString('base64')}`;
};
// --- Contact Route ---
app.post('/api/contact', upload.single('attachment'), async (req, res) => {
    try {
        const { name, email, message } = req.body;
        if (!name || !email || !message) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Name, email, and message are required' });
        }

        if (!transporter) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(500).json({ error: 'Email service is not configured' });
        }

        const mailOptions = {
            from: process.env.SMTP_FROM || 'admin@mashcloud.local',
            to: process.env.SUPERUSER_EMAIL || 'admin@mashcloud.local',
            subject: `New Contact Request from ${name}`,
            text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
            attachments: req.file ? [{
                filename: req.file.originalname,
                path: req.file.path
            }] : []
        };

        await transporter.sendMail(mailOptions);

        if (req.file) {
            fs.unlinkSync(req.file.path);
        }

        res.json({ message: 'Message sent successfully' });
    } catch (err) {
        console.error('Contact form error:', err.message);
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

app.post('/api/auth/register', [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('firstName').trim().escape().notEmpty(),
    body('lastName').trim().escape().notEmpty()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { firstName, lastName, country, month, day, year, email, password, captchaId, captchaText, phone, encryptedMasterKey, rawMasterKeyB64 } = req.body;

    if (!captchaId || !captchaText) return res.status(400).json({ error: 'CAPTCHA is required' });

    const stored = await sessionStore.getCaptcha(captchaId);
    if (!stored || stored.expires < Date.now() || stored.text !== captchaText.toLowerCase()) {
        await sessionStore.deleteCaptcha(captchaId);
        return res.status(400).json({ error: 'Invalid or expired CAPTCHA' });
    }
    await sessionStore.deleteCaptcha(captchaId);

    try {
        const existing = await db.query(`SELECT id FROM mc_users WHERE email = $1`, [email]);
        if (existing.rows.length > 0) return res.status(409).json({ error: 'An account with this email already exists' });

        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpSessionId = crypto.randomUUID();
        const passwordHash = await bcrypt.hash(password, 12);
        const dob = (year && month && day) ? `${year}-${month}-${day}` : null;

        const escrowedMasterKey = escrowEncrypt(rawMasterKeyB64);

        await sessionStore.setOtp(otpSessionId, {
            otpCode,
            attempts: 0,
            userData: { firstName, lastName, country, dob, email, passwordHash, phone, encryptedMasterKey, escrowedMasterKey },
            expires: Date.now() + 10 * 60 * 1000
        });

        // --- MASHCLOUD ENHANCED AUTH (SentDM) ---
        // Prioritize WhatsApp/SMS via SentDM if phone is provided
        let sentDmStatus = null;
        if (phone) {
            sentDmStatus = await messagingUtils.sendOTP(phone, otpCode);
        }

        // Always send email as a reliable secondary/fallback channel
        await transporter.sendMail({
            from: `"Mashcloud" <${process.env.SMTP_FROM || 'noreply@mashcloud.com'}>`,
            to: email,
            subject: 'Your Mashcloud Verification Code',
            text: `Your verification code is: ${otpCode}\n\nThis code expires in 10 minutes.`,
            html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
                    <h2 style="color: #0a84ff;">Mashcloud</h2>
                    <p>Your verification code is:</p>
                    <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #0a84ff; padding: 20px; text-align: center; background: #f0f5ff; border-radius: 12px; margin: 20px 0;">
                        ${otpCode}
                    </div>
                    <p style="color: #666; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
                </div>
            `
        });

        await auditLog.log({ userId: null, action: 'auth.register_attempt', resourceType: 'user', req, details: { email } });

        res.json({ 
            status: 'requires_otp', 
            otpSessionId,
            messagingStatus: sentDmStatus?.success ? 'otp_sent_to_phone' : 'otp_sent_to_email'
        });
    } catch (error) {
        console.error('Registration error:', error.message);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

app.post('/api/auth/verify-otp', async (req, res) => {
    const { otpSessionId, otpCode } = req.body;
    if (!otpSessionId || !otpCode) return res.status(400).json({ error: 'Session ID and OTP code are required' });

    const session = await sessionStore.getOtp(otpSessionId);
    if (!session || session.expires < Date.now()) {
        await sessionStore.deleteOtp(otpSessionId);
        return res.status(400).json({ error: 'OTP session expired. Please register again.' });
    }

    // Brute force protection
    session.attempts += 1;
    await sessionStore.updateOtp(otpSessionId, session);
    if (session.attempts > 5) {
        await sessionStore.deleteOtp(otpSessionId);
        return res.status(429).json({ error: 'Too many attempts. Please register again.' });
    }

    if (session.otpCode !== otpCode) {
        return res.status(400).json({ error: 'Incorrect verification code' });
    }

    const { firstName, lastName, country, dob, email, passwordHash, phone, encryptedMasterKey, escrowedMasterKey } = session.userData;

    try {
        // Create user as verified (OTP already proves email ownership)
        const insertRes = await db.query(
            `INSERT INTO mc_users (first_name, last_name, country, dob, email, password_hash, phone, is_verified, encrypted_master_key, escrowed_master_key)
             VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9) RETURNING id`,
            [firstName, lastName, country, dob, email, passwordHash, phone, encryptedMasterKey, escrowedMasterKey]
        );
        await sessionStore.deleteOtp(otpSessionId);
        await auditLog.log({ userId: insertRes.rows[0].id, action: 'auth.register_success', resourceType: 'user', req, details: { email } });

        res.status(201).json({ message: 'Account created successfully! You can now sign in.' });
    } catch (err) {
        console.error('User creation error:', err.message);
        res.status(500).json({ error: 'Failed to create account' });
    }
});

app.post('/api/auth/forgot-password', [
    body('email').isEmail().normalizeEmail()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email } = req.body;
    try {
        const result = await db.query('SELECT id FROM mc_users WHERE email = $1', [email]);
        // Always return success to prevent email enumeration
        if (result.rows.length === 0) {
            return res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 min

        await db.query(
            'UPDATE mc_users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3',
            [resetToken, resetExpiry, email]
        );

        const resetUrl = `${APP_URL}/reset-password?token=${resetToken}`;
        await transporter.sendMail({
            from: `"Mashcloud" <${process.env.SMTP_FROM || 'noreply@mashcloud.com'}>`,
            to: email,
            subject: 'Reset your Mashcloud password',
            text: `Reset your password by visiting: ${resetUrl}\n\nThis link expires in 30 minutes.`,
            html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
                    <h2 style="color: #1a1a2e;">Mashcloud</h2>
                    <p>Click the button below to reset your password:</p>
                    <a href="${resetUrl}" style="display: inline-block; padding: 14px 28px; background: #007aff; color: #fff; text-decoration: none; border-radius: 8px; margin: 20px 0;">Reset Password</a>
                    <p style="color: #666; font-size: 14px;">This link expires in 30 minutes. If you didn't request this, you can safely ignore this email.</p>
                </div>
            `
        });

        res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
    } catch (err) {
        console.error('Forgot password error:', err.message);
        res.status(500).json({ error: 'Failed to process request' });
    }
});

app.post('/api/auth/reset-password', [
    body('password').isLength({ min: 8 })
], async (req, res) => {
    const { token, password } = req.body;
    if (!token) return res.status(400).json({ error: 'Reset token is required' });

    try {
        const result = await db.query(
            'SELECT id, email, escrowed_master_key FROM mc_users WHERE reset_token = $1 AND reset_token_expires > NOW()',
            [token]
        );
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        const user = result.rows[0];
        const passwordHash = await bcrypt.hash(password, 12);
        
        let newEncryptedMasterKey = null;
        if (user.escrowed_master_key) {
            try {
                const rawMasterKeyB64 = escrowDecrypt(user.escrowed_master_key);
                newEncryptedMasterKey = reEncryptMasterKeyWithNewPassword(rawMasterKeyB64, password, user.email);
            } catch (err) {
                console.error('Failed to re-encrypt master key during reset:', err);
            }
        }

        await db.query(
            'UPDATE mc_users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL, encrypted_master_key = COALESCE($2, encrypted_master_key) WHERE id = $3',
            [passwordHash, newEncryptedMasterKey, user.id]
        );

        res.json({ message: 'Password reset successfully. You can now sign in.' });
    } catch (err) {
        console.error('Reset password error:', err.message);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

app.post('/api/auth/login', [
    body('email').isEmail().normalizeEmail(),
    body('password').exists()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    try {
        const result = await db.query(`SELECT * FROM mc_users WHERE email = $1`, [email]);
        if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid email or password' });

        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: 'Invalid email or password' });

        const token = jwt.sign(
            { userId: user.id, email: user.email },
            EFFECTIVE_JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'strict' : 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        res.json({
            message: 'Login successful',
            user: {
                firstName: user.first_name,
                lastName: user.last_name,
                email: user.email,
                is_verified: user.is_verified,
                storage_used: user.storage_used,
                storage_quota: user.storage_quota,
                profile_photo: user.profile_photo,
                encrypted_master_key: user.encrypted_master_key
            }
        });
    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax'
    });
    res.json({ message: 'Logged out successfully' });
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT first_name, last_name, email, is_verified, storage_used, storage_quota, profile_photo, encrypted_master_key FROM mc_users WHERE id = $1`,
            [req.user.userId]
        );
        if (result.rows.length === 0) return res.status(401).json({ error: 'User not found' });
        const user = result.rows[0];
        res.json({
            user: {
                firstName: user.first_name,
                lastName: user.last_name,
                email: user.email,
                is_verified: user.is_verified,
                storage_used: user.storage_used,
                storage_quota: user.storage_quota,
                profile_photo: user.profile_photo,
                encrypted_master_key: user.encrypted_master_key
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch user data' });
    }
});

app.put('/api/auth/me', authenticateToken, async (req, res) => {
    const { firstName, lastName } = req.body;
    const safeFirst = sanitizeText(firstName);
    const safeLast = sanitizeText(lastName);
    if (!safeFirst) return res.status(400).json({ error: 'First name is required' });
    try {
        await db.query(
            `UPDATE mc_users SET first_name = $1, last_name = $2 WHERE id = $3`,
            [safeFirst, safeLast, req.user.userId]
        );
        res.json({ message: 'Profile updated successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

app.post('/api/auth/me/photo', authenticateToken, async (req, res) => {
    const { photo } = req.body;
    if (!photo) return res.status(400).json({ error: 'Photo data is required' });
    try {
        await db.query(
            `UPDATE mc_users SET profile_photo = $1 WHERE id = $2`,
            [photo, req.user.userId]
        );
        res.json({ message: 'Profile photo updated successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update profile photo' });
    }
});

// GDPR: Delete account and all associated data
app.delete('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const filesRes = await db.query(
            'SELECT filename FROM mc_files WHERE user_id = $1 UNION SELECT filename FROM mc_photos WHERE user_id = $1',
            [userId]
        );

        // Delete files from Pentaract storage
        for (const row of filesRes.rows) {
            try {
                await storageService.deleteFile(`/${row.filename}`);
            } catch (e) {
                console.error('Pentaract delete error for', row.filename, ':', e.message);
            }
        }

        await db.query('DELETE FROM mc_users WHERE id = $1', [userId]);
        res.clearCookie('token');
        res.json({ message: 'Account and all associated data permanently deleted' });
    } catch (err) {
        console.error('Account deletion error:', err.message);
        res.status(500).json({ error: 'Failed to delete account' });
    }
});

app.get('/api/storage/breakdown', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const filesRes = await db.query(`SELECT COUNT(*) as count, SUM(size) as size FROM mc_files WHERE user_id = $1`, [userId]);
        const photosRes = await db.query(`SELECT COUNT(*) as count, SUM(size) as size FROM mc_photos WHERE user_id = $1`, [userId]);
        
        const files = {
            count: parseInt(filesRes.rows[0].count) || 0,
            size: parseInt(filesRes.rows[0].size) || 0
        };
        const photos = {
            count: parseInt(photosRes.rows[0].count) || 0,
            size: parseInt(photosRes.rows[0].size) || 0
        };
        
        res.json({ files, photos });
    } catch (err) {
        console.error('Storage breakdown error:', err.message);
        res.status(500).json({ error: 'Failed to fetch storage breakdown' });
    }
});

// --- HEALTH CHECK ---
app.get('/api/health', async (req, res) => {
    const health = {
        status: 'ok',
        service: 'Mashcloud API',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        storage: storageService.isReady ? 'connected' : 'disconnected',
        database: 'unknown',
        redis: 'unknown',
        payments: paymentService.isReady ? 'enabled' : 'disabled',
    };
    try {
        await db.query('SELECT 1');
        health.database = 'connected';
    } catch (e) {
        health.database = 'disconnected';
        health.status = 'degraded';
    }
    try {
        const redisOk = await redisService.healthCheck();
        health.redis = redisOk ? 'connected' : 'disconnected';
    } catch (e) {
        health.redis = 'disconnected';
    }
    if (storageService.isReady) {
        try {
            const storageHealth = await storageService.healthCheck();
            health.storageNodes = storageHealth;
        } catch (e) { /* ignore */ }
    }
    res.json(health);
});

// --- FILE ROUTES ---
app.post('/api/files/upload', authenticateToken, requireVerified, uploadLimiter, upload.array('shards', 10), async (req, res) => {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
    
    const { originalName, mimetype, originalSize, folder_id, iv, dataShards, parityShards, thumbnail_base64 } = req.body;
    const userId = req.user.userId;
    // Security: Use actual uploaded file sizes, not client-supplied originalSize (prevents quota bypass)
    const actualSize = req.files.reduce((sum, f) => sum + f.size, 0);
    const size = Math.max(parseInt(originalSize, 10) || 0, actualSize);
    const safeName = sanitizeFilename(originalName);
    const safeMimetype = (mimetype || 'application/octet-stream').substring(0, 127);
    const dShards = parseInt(dataShards, 10) || 1;
    const pShards = parseInt(parityShards, 10) || 0;
    const totalShards = dShards + pShards;

    // 5GB Free Tier Enforcement
    const FREE_TIER_LIMIT = 5 * 1024 * 1024 * 1024; // 5GB
    if (!req.user.isPremium && (Number(req.user.storage_used) + size > FREE_TIER_LIMIT)) {
        return res.status(402).json({ error: 'Free plan storage limit (5 GB) exceeded. Please upgrade to Premium.' });
    }

    // Check Quota
    if (Number(req.user.storage_used) + size > Number(req.user.storage_quota)) {
        return res.status(402).json({ error: 'Storage limit exceeded. Please upgrade your plan.' });
    }

    const filename = req.uploadFilename; // Generated in storage engine

    try {
        const insertRes = await db.query(
            `INSERT INTO mc_files (user_id, original_name, filename, mimetype, size, folder_id, iv, data_shards, parity_shards, total_shards, thumbnail_base64) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
            [userId, safeName, filename, safeMimetype, size, folder_id || null, iv, dShards, pShards, totalShards, thumbnail_base64 || null]
        );
        const fileId = insertRes.rows[0].id;

        await db.query(`UPDATE mc_users SET storage_used = storage_used + $1 WHERE id = $2`, [size, userId]);

        res.status(201).json({ message: 'File uploaded successfully', id: fileId, filename, originalname: originalName, size });
    } catch (err) {
        console.error('File upload error:', err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to upload file' });
    }
});

app.get('/api/files', authenticateToken, async (req, res) => {
    try {
        const { folder_id, is_favorite } = req.query;
        let query = `SELECT * FROM mc_files WHERE user_id = $1 AND is_deleted = false`;
        let params = [req.user.userId];
        
        if (is_favorite === 'true') {
            query += ` AND is_favorite = true`;
        } else if (folder_id) {
            query += ` AND folder_id = $2`;
            params.push(folder_id);
        } else if (folder_id === 'null' || !folder_id) {
            query += ` AND folder_id IS NULL`;
        }
        
        query += ` ORDER BY upload_date DESC`;
        
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve files' });
    }
});

// --- NEW FILE ROUTES (Folders & Favorites) ---
app.post('/api/folders', authenticateToken, async (req, res) => {
    const { name, parent_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Folder name is required' });
    const safeFolderName = sanitizeText(name);
    if (!safeFolderName) return res.status(400).json({ error: 'Invalid folder name' });
    try {
        const result = await db.query(
            `INSERT INTO mc_folders (user_id, name, parent_id) VALUES ($1, $2, $3) RETURNING *`,
            [req.user.userId, safeFolderName, parent_id || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to create folder' });
    }
});

// Delete folder and move its files to root
app.delete('/api/folders/:id', authenticateToken, async (req, res) => {
    try {
        const folderId = req.params.id;
        const userId = req.user.userId;
        const check = await db.query(`SELECT id FROM mc_folders WHERE id = $1 AND user_id = $2`, [folderId, userId]);
        if (check.rows.length === 0) return res.status(404).json({ error: 'Folder not found' });
        // Move files in this folder to root
        await db.query(`UPDATE mc_files SET folder_id = NULL WHERE folder_id = $1 AND user_id = $2`, [folderId, userId]);
        // Delete child folders
        await db.query(`DELETE FROM mc_folders WHERE parent_id = $1 AND user_id = $2`, [folderId, userId]);
        // Delete the folder
        await db.query(`DELETE FROM mc_folders WHERE id = $1 AND user_id = $2`, [folderId, userId]);
        res.json({ message: 'Folder deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete folder' });
    }
});

app.get('/api/folders', authenticateToken, async (req, res) => {
    try {
        const { parent_id } = req.query;
        let query = `SELECT * FROM mc_folders WHERE user_id = $1`;
        let params = [req.user.userId];
        if (parent_id) {
            query += ` AND parent_id = $2`;
            params.push(parent_id);
        } else if (parent_id === 'null' || !parent_id) {
            query += ` AND parent_id IS NULL`;
        }
        query += ` ORDER BY created_at DESC`;
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch folders' });
    }
});

app.put('/api/files/:id/move', authenticateToken, async (req, res) => {
    const { folder_id } = req.body;
    try {
        const result = await db.query(
            `UPDATE mc_files SET folder_id = $1 WHERE id = $2 AND user_id = $3 RETURNING *`,
            [folder_id || null, req.params.id, req.user.userId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'File not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to move file' });
    }
});

app.post('/api/files/:id/favorite', authenticateToken, async (req, res) => {
    try {
        const check = await db.query(`SELECT is_favorite FROM mc_files WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.userId]);
        if (check.rows.length === 0) return res.status(404).json({ error: 'File not found' });
        const newStatus = !check.rows[0].is_favorite;
        await db.query(`UPDATE mc_files SET is_favorite = $1 WHERE id = $2 AND user_id = $3`, [newStatus, req.params.id, req.user.userId]);
        res.json({ message: 'Favorite status updated', is_favorite: newStatus });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update favorite status' });
    }
});


app.get('/api/shards/:type/:id/:index', authenticateToken, async (req, res) => {
    const { type, id, index } = req.params;
    const userId = req.user.userId;
    try {
        const table = type === 'photo' ? 'mc_photos' : 'mc_files';
        const fileRes = await db.query(
            `SELECT filename FROM ${table} WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        if (fileRes.rows.length === 0) return res.status(404).json({ error: 'File not found' });

        const file = fileRes.rows[0];
        const response = await storageService.getDownloadStream(`/${file.filename}.shard${index}`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Cache-Control', 'private, max-age=31536000'); // Cache shards locally
        response.data.pipe(res);
    } catch (err) {
        console.error('Shard download error:', err.message);
        res.status(500).json({ error: 'Failed to download shard' });
    }
});

app.put('/api/files/:id/rename', authenticateToken, async (req, res) => {
    const fileId = req.params.id;
    const userId = req.user.userId;
    const { name } = req.body;
    try {
        const fileRes = await db.query('SELECT id FROM mc_files WHERE id = $1 AND user_id = $2', [fileId, userId]);
        if (fileRes.rows.length === 0) return res.status(404).json({ error: 'File not found' });
        await db.query('UPDATE mc_files SET original_name = $1 WHERE id = $2', [name, fileId]);
        res.json({ message: 'File renamed successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to rename file' });
    }
});

app.put('/api/files/:id/move', authenticateToken, async (req, res) => {
    const fileId = req.params.id;
    const userId = req.user.userId;
    const { folder_id } = req.body;
    try {
        const fileRes = await db.query('SELECT id FROM mc_files WHERE id = $1 AND user_id = $2', [fileId, userId]);
        if (fileRes.rows.length === 0) return res.status(404).json({ error: 'File not found' });
        await db.query('UPDATE mc_files SET folder_id = $1 WHERE id = $2', [folder_id || null, fileId]);
        res.json({ message: 'File moved successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to move file' });
    }
});

app.post('/api/files/:id/duplicate', authenticateToken, async (req, res) => {
    const fileId = req.params.id;
    const userId = req.user.userId;
    try {
        const fileRes = await db.query('SELECT * FROM mc_files WHERE id = $1 AND user_id = $2', [fileId, userId]);
        if (fileRes.rows.length === 0) return res.status(404).json({ error: 'File not found' });
        const file = fileRes.rows[0];
        
        let newName = file.original_name;
        const dotIndex = newName.lastIndexOf('.');
        if (dotIndex !== -1) {
            newName = newName.substring(0, dotIndex) + " copy" + newName.substring(dotIndex);
        } else {
            newName = newName + " copy";
        }
        
        const insertRes = await db.query(
            `INSERT INTO mc_files (user_id, folder_id, original_name, size, mimetype, total_shards, data_shards, parity_shards, iv) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [userId, file.folder_id, newName, file.size, file.mimetype, file.total_shards, file.data_shards, file.parity_shards, file.iv]
        );
        
        const shardsRes = await db.query('SELECT * FROM mc_file_shards WHERE file_id = $1', [fileId]);
        const newFileId = insertRes.rows[0].id;
        for (let shard of shardsRes.rows) {
             await db.query('INSERT INTO mc_file_shards (file_id, pentaract_shard_id, shard_index) VALUES ($1, $2, $3)', [newFileId, shard.pentaract_shard_id, shard.shard_index]);
        }
        res.json(insertRes.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to duplicate file' });
    }
});

app.delete('/api/files/:id', authenticateToken, async (req, res) => {
    const fileId = req.params.id;
    const userId = req.user.userId;

    try {
        const fileRes = await db.query(
            `SELECT id FROM mc_files WHERE id = $1 AND user_id = $2`,
            [fileId, userId]
        );
        if (fileRes.rows.length === 0) return res.status(404).json({ error: 'File not found' });

        await db.query(`UPDATE mc_files SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP WHERE id = $1`, [fileId]);

        res.json({ message: 'File moved to Data Recovery' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete file' });
    }
});

// --- PHOTO ROUTES ---
app.post('/api/photos/upload', authenticateToken, requireVerified, uploadLimiter, upload.array('shards', 10), async (req, res) => {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No photo uploaded' });
    
    const { originalName, mimetype, originalSize, iv, dataShards, parityShards, thumbnail_base64 } = req.body;
    const userId = req.user.userId;
    const actualSize = req.files.reduce((sum, f) => sum + f.size, 0);
    const size = Math.max(parseInt(originalSize, 10) || 0, actualSize);
    const safeName = sanitizeFilename(originalName);
    const safeMimetype = (mimetype || 'image/jpeg').substring(0, 127);
    const dShards = parseInt(dataShards, 10) || 1;
    const pShards = parseInt(parityShards, 10) || 0;
    const totalShards = dShards + pShards;

    // Check Quota
    if (Number(req.user.storage_used) + size > Number(req.user.storage_quota)) {
        return res.status(402).json({ error: 'Storage limit exceeded. Please upgrade your plan.' });
    }

    const filename = req.uploadFilename; // Generated in storage engine

    try {
        const insertRes = await db.query(
            `INSERT INTO mc_photos (user_id, original_name, filename, mimetype, size, iv, data_shards, parity_shards, total_shards, thumbnail_base64) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
            [userId, safeName, filename, safeMimetype, size, iv, dShards, pShards, totalShards, thumbnail_base64 || null]
        );
        const photoId = insertRes.rows[0].id;

        await db.query(`UPDATE mc_users SET storage_used = storage_used + $1 WHERE id = $2`, [size, userId]);

        res.status(201).json({ message: 'Photo uploaded successfully', id: photoId, filename, originalname: originalName, size });
    } catch (err) {
        console.error('Photo upload error:', err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to upload photo' });
    }
});

app.get('/api/photos', authenticateToken, async (req, res) => {
    try {
        const { is_favorite, is_hidden } = req.query;
        let query = `SELECT * FROM mc_photos WHERE user_id = $1 AND is_deleted = false`;
        let params = [req.user.userId];
        
        if (is_favorite === 'true') query += ` AND is_favorite = true`;
        
        // Default behavior: don't show hidden photos unless explicitly requested
        if (is_hidden === 'true') {
            query += ` AND is_hidden = true`;
        } else {
            query += ` AND is_hidden = false`;
        }
        
        query += ` ORDER BY upload_date DESC`;
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve photos' });
    }
});

// --- NEW PHOTO ROUTES (Hidden & Albums) ---
app.post('/api/photos/:id/hide', authenticateToken, async (req, res) => {
    try {
        const check = await db.query(`SELECT is_hidden FROM mc_photos WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.userId]);
        if (check.rows.length === 0) return res.status(404).json({ error: 'Photo not found' });
        const newStatus = !check.rows[0].is_hidden;
        await db.query(`UPDATE mc_photos SET is_hidden = $1 WHERE id = $2 AND user_id = $3`, [newStatus, req.params.id, req.user.userId]);
        res.json({ message: 'Hidden status updated', is_hidden: newStatus });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update hidden status' });
    }
});

app.get('/api/hidden-password/status', authenticateToken, async (req, res) => {
    try {
        const userRes = await db.query('SELECT hidden_password_hash FROM mc_users WHERE id = $1', [req.user.userId]);
        const hasPassword = !!userRes.rows[0].hidden_password_hash;
        res.json({ isSet: hasPassword });
    } catch (error) {
        console.error('Error fetching hidden password status:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/hidden-password/set', authenticateToken, async (req, res) => {
    const { password } = req.body;
    if (!password || password.length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters long' });
    }
    try {
        const userRes = await db.query('SELECT hidden_password_hash FROM mc_users WHERE id = $1', [req.user.userId]);
        if (userRes.rows[0].hidden_password_hash) {
            return res.status(400).json({ error: 'Hidden password is already set' });
        }
        const hash = await bcrypt.hash(password, 10);
        await db.query('UPDATE mc_users SET hidden_password_hash = $1 WHERE id = $2', [hash, req.user.userId]);
        res.json({ message: 'Hidden password set successfully' });
    } catch (error) {
        console.error('Error setting hidden password:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/hidden-password/verify', authenticateToken, async (req, res) => {
    const { password } = req.body;
    try {
        const userRes = await db.query('SELECT hidden_password_hash FROM mc_users WHERE id = $1', [req.user.userId]);
        const hash = userRes.rows[0].hidden_password_hash;
        if (!hash) {
            return res.status(400).json({ error: 'No hidden password set' });
        }
        const isValid = await bcrypt.compare(password, hash);
        if (isValid) {
            res.json({ success: true });
        } else {
            res.status(401).json({ error: 'Incorrect password' });
        }
    } catch (error) {
        console.error('Error verifying hidden password:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/albums', authenticateToken, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Album name is required' });
    const safeAlbumName = sanitizeText(name);
    if (!safeAlbumName) return res.status(400).json({ error: 'Invalid album name' });
    try {
        const result = await db.query(`INSERT INTO mc_albums (user_id, name) VALUES ($1, $2) RETURNING *`, [req.user.userId, safeAlbumName]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to create album' });
    }
});

app.get('/api/albums', authenticateToken, async (req, res) => {
    try {
        const result = await db.query(`SELECT * FROM mc_albums WHERE user_id = $1 ORDER BY created_at DESC`, [req.user.userId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch albums' });
    }
});

app.get('/api/albums/:id/photos', authenticateToken, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT p.* FROM mc_photos p 
             JOIN mc_album_photos ap ON p.id = ap.photo_id 
             WHERE ap.album_id = $1 AND p.user_id = $2 AND p.is_deleted = false 
             ORDER BY ap.added_at DESC`,
            [req.params.id, req.user.userId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch album photos' });
    }
});

app.post('/api/albums/:id/photos', authenticateToken, async (req, res) => {
    const { photo_id } = req.body;
    const userId = req.user.userId;
    try {
        // IDOR Fix: Verify album belongs to user
        const albumCheck = await db.query(`SELECT id FROM mc_albums WHERE id = $1 AND user_id = $2`, [req.params.id, userId]);
        if (albumCheck.rows.length === 0) return res.status(404).json({ error: 'Album not found' });
        // IDOR Fix: Verify photo belongs to user
        const photoCheck = await db.query(`SELECT id FROM mc_photos WHERE id = $1 AND user_id = $2`, [photo_id, userId]);
        if (photoCheck.rows.length === 0) return res.status(404).json({ error: 'Photo not found' });

        const check = await db.query(`SELECT * FROM mc_album_photos WHERE album_id = $1 AND photo_id = $2`, [req.params.id, photo_id]);
        if (check.rows.length > 0) {
            await db.query(`DELETE FROM mc_album_photos WHERE album_id = $1 AND photo_id = $2`, [req.params.id, photo_id]);
            return res.json({ message: 'Photo removed from album', action: 'removed' });
        } else {
            await db.query(`INSERT INTO mc_album_photos (album_id, photo_id) VALUES ($1, $2)`, [req.params.id, photo_id]);
            return res.json({ message: 'Photo added to album', action: 'added' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to update album' });
    }
});


app.delete('/api/photos/:id', authenticateToken, async (req, res) => {
    const photoId = req.params.id;
    const userId = req.user.userId;
    try {
        const photoRes = await db.query(
            `SELECT id FROM mc_photos WHERE id = $1 AND user_id = $2`,
            [photoId, userId]
        );
        if (photoRes.rows.length === 0) return res.status(404).json({ error: 'Photo not found' });

        await db.query(`UPDATE mc_photos SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP WHERE id = $1`, [photoId]);

        res.json({ message: 'Photo moved to Data Recovery' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete photo' });
    }
});

app.post('/api/photos/:id/favorite', authenticateToken, async (req, res) => {
    const photoId = req.params.id;
    const userId = req.user.userId;
    try {
        const photoRes = await db.query(
            `SELECT is_favorite FROM mc_photos WHERE id = $1 AND user_id = $2`,
            [photoId, userId]
        );
        if (photoRes.rows.length === 0) return res.status(404).json({ error: 'Photo not found' });

        const newStatus = !photoRes.rows[0].is_favorite;
        await db.query(`UPDATE mc_photos SET is_favorite = $1 WHERE id = $2 AND user_id = $3`, [newStatus, photoId, userId]);
        res.json({ message: 'Favorite status updated', is_favorite: newStatus });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update favorite status' });
    }
});

// --- Multer Error Handler ---
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.` });
        }
        return res.status(400).json({ error: err.message });
    }
    if (err.message === 'File type not allowed') {
        return res.status(400).json({ error: 'This file type is not allowed for security reasons.' });
    }
    next(err);
});


// --- Data Recovery Endpoints ---
app.get('/api/recovery', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const filesRes = await db.query(
            `SELECT id, original_name, filename, size, deleted_at, 'file' as type FROM mc_files WHERE user_id = $1 AND is_deleted = true`,
            [userId]
        );
        const photosRes = await db.query(
            `SELECT id, original_name, filename, size, deleted_at, 'photo' as type FROM mc_photos WHERE user_id = $1 AND is_deleted = true`,
            [userId]
        );
        const allItems = [...filesRes.rows, ...photosRes.rows].sort((a, b) => new Date(b.deleted_at) - new Date(a.deleted_at));
        res.json(allItems);
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve recovery items' });
    }
});

app.post('/api/recovery/:type/:id/restore', authenticateToken, async (req, res) => {
    try {
        const { type, id } = req.params;
        const userId = req.user.userId;
        const table = type === 'photo' ? 'mc_photos' : 'mc_files';
        
        const result = await db.query(`UPDATE ${table} SET is_deleted = false, deleted_at = NULL WHERE id = $1 AND user_id = $2 RETURNING id`, [id, userId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });
        
        res.json({ message: 'Item restored successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to restore item' });
    }
});

app.delete('/api/recovery/:type/:id/permanent', authenticateToken, async (req, res) => {
    try {
        const { type, id } = req.params;
        const userId = req.user.userId;
        const table = type === 'photo' ? 'mc_photos' : 'mc_files';
        
        const itemRes = await db.query(`SELECT filename, size FROM ${table} WHERE id = $1 AND user_id = $2 AND is_deleted = true`, [id, userId]);
        if (itemRes.rows.length === 0) return res.status(404).json({ error: 'Item not found' });
        
        try {
            await storageService.deleteFile(`/${itemRes.rows[0].filename}`);
        } catch (e) {
            console.error('Pentaract permanent delete warning:', e.message);
        }
        
        await db.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
        await db.query(`UPDATE mc_users SET storage_used = GREATEST(storage_used - $1, 0) WHERE id = $2`, [itemRes.rows[0].size, userId]);
        
        res.json({ message: 'Item permanently deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to permanently delete item' });
    }
});


// --- AI Processing Endpoints ---
app.post('/api/ai/process-photo', authenticateToken, aiLimiter, async (req, res) => {
    try {
        const { id, thumbnailBase64 } = req.body;
        if (!id || !thumbnailBase64) return res.status(400).json({ error: 'Missing parameters' });
        
        const tags = await aiUtils.generateImageTags(thumbnailBase64);
        
        await db.query(`UPDATE mc_photos SET ai_tags = $1 WHERE id = $2 AND user_id = $3`, [tags, id, req.user.userId]);
        res.json({ message: 'Photo processed successfully', tags });
    } catch (err) {
        console.error('AI Photo processing error:', err.message);
        res.status(500).json({ error: 'AI processing failed' });
    }
});

app.post('/api/ai/process-document', authenticateToken, aiLimiter, async (req, res) => {
    try {
        const { id, textSnippet } = req.body;
        if (!id || !textSnippet) return res.status(400).json({ error: 'Missing parameters' });
        
        const summary = await aiUtils.generateDocumentSummary(textSnippet);
        
        await db.query(`UPDATE mc_files SET ai_summary = $1 WHERE id = $2 AND user_id = $3`, [summary, id, req.user.userId]);
        res.json({ message: 'Document processed successfully', summary });
    } catch (err) {
        console.error('AI Document processing error:', err.message);
        res.status(500).json({ error: 'AI processing failed' });
    }
});

// --- SPA Fallback ---
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// --- Register Payment Routes ---
paymentService.init();
paymentService.registerRoutes(app, authenticateToken, db);

// --- Start Server ---
app.listen(PORT, async () => {
    console.log(`Mashcloud server running on port ${PORT}`);
    console.log(`Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);

    // Initialize services
    await redisService.init();
    await AuditLog.init(db);

    // Give MinIO container time to start
    setTimeout(async () => {
        await storageService.init();
    }, 3000);
});
