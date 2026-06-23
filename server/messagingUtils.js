const { SentDM } = require('@sentdm/sentdm');

// Initialize SentDM Client
// These variables should be added to your server/.env file
const SENTDM_API_KEY = process.env.SENTDM_API_KEY;
const SENTDM_WHATSAPP_ID = process.env.SENTDM_WHATSAPP_ID;

const client = SENTDM_API_KEY ? new SentDM(SENTDM_API_KEY) : null;

/**
 * Sends an OTP via WhatsApp using SentDM
 * @param {string} phone - User's phone number (with country code)
 * @param {string} code - The 6-digit OTP
 */
const sendOTP = async (phone, code) => {
    if (!client) {
        console.warn('--- SENTDM NOT CONFIGURED ---');
        console.log(`To: ${phone}, OTP: ${code}`);
        return { success: false, error: 'Messaging service not configured' };
    }

    try {
        // We use a template or a direct message depending on your SentDM setup
        // For Indian startups, WhatsApp is preferred over SMS
        await client.messages.sendMessage({
            to: phone,
            whatsappId: SENTDM_WHATSAPP_ID,
            body: `Your Mashcloud verification code is: *${code}*\n\nThis code expires in 10 minutes. Do not share it with anyone.`,
        });

        console.log(`SentDM: OTP sent to ${phone}`);
        return { success: true };
    } catch (error) {
        console.error('SentDM Error:', error.message);
        return { success: false, error: error.message };
    }
};

/**
 * Sends a welcome message or critical account alert
 */
const sendAlert = async (phone, message) => {
    if (!client) return;
    try {
        await client.messages.sendMessage({
            to: phone,
            whatsappId: SENTDM_WHATSAPP_ID,
            body: `*Mashcloud Security Alert*\n\n${message}`,
        });
    } catch (error) {
        console.error('SentDM Alert Error:', error.message);
    }
};

module.exports = {
    sendOTP,
    sendAlert
};
