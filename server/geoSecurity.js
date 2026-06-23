const geoip = require('geoip-lite');
const { getRedisClient } = require('./redisService');

// In a real production scenario, you might want to whitelist your own server IPs
// or local network IPs (e.g., 127.0.0.1, 192.168.x.x, 10.x.x.x)
const isLocalIp = (ip) => {
    return ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./);
};

const geoSecurityMiddleware = async (req, res, next) => {
    try {
        // Get the real IP, considering reverse proxies like Nginx/Cloudflare
        const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || 
                   req.headers['cf-connecting-ip'] || 
                   req.socket.remoteAddress;

        // Skip checks for local development/internal traffic
        if (isLocalIp(ip)) {
            return next();
        }

        const redis = getRedisClient();
        
        // 1. Fast Local GeoIP Check
        const geo = geoip.lookup(ip);
        if (!geo || geo.country !== 'IN') {
            console.warn(`[Geo-Block] Non-Indian IP blocked: ${ip} (Country: ${geo ? geo.country : 'Unknown'})`);
            return res.status(403).json({ 
                error: 'Data Residency Violation. Access is strictly restricted to IP addresses within the Republic of India to comply with DPDP Act 2023.' 
            });
        }

        // 2. VPN / Datacenter Check (Cached)
        // If Redis is available, check cache to avoid API rate limits
        const cacheKey = `geoip:vpn:${ip}`;
        let isVpn = false;

        if (redis) {
            const cachedResult = await redis.get(cacheKey);
            if (cachedResult) {
                if (cachedResult === 'BLOCKED') {
                    return res.status(403).json({ error: 'VPN or Datacenter Proxy detected. To ensure data sovereignty, VPN access is disabled.' });
                } else {
                    return next(); // Cached as SAFE
                }
            }
        }

        // Fallback to IP-API to check for proxies/VPNs (Free tier, no API key needed, limit 45 req/min)
        try {
            const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,countryCode,proxy,hosting`);
            const data = await response.json();

            if (data.status === 'success') {
                // If it's a proxy, VPN, or a datacenter (hosting provider) IP, block it.
                // Datacenter IPs are blocked because that's where VPNs usually exit from.
                if (data.proxy || data.hosting) {
                    isVpn = true;
                }
            }
        } catch (apiErr) {
            console.error('[Geo-Block] Failed to check VPN status API:', apiErr.message);
            // Fail open on API failure so we don't lock out legitimate users if the API goes down
        }

        if (isVpn) {
            console.warn(`[Geo-Block] VPN/Proxy detected and blocked: ${ip}`);
            if (redis) await redis.set(cacheKey, 'BLOCKED', 'EX', 86400); // Cache block for 24h
            return res.status(403).json({ error: 'VPN or Datacenter Proxy detected. To ensure data sovereignty, VPN access is disabled.' });
        }

        // IP is Indian and not a VPN. Cache as safe.
        if (redis) await redis.set(cacheKey, 'SAFE', 'EX', 86400); // Cache safe for 24h
        next();

    } catch (error) {
        console.error('[Geo-Block] Middleware error:', error);
        next(); // Fail open on code errors so we don't break the app entirely
    }
};

module.exports = geoSecurityMiddleware;
