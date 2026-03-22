const { Resend } = require('resend');

// Email configuration
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_ENABLED = !!RESEND_API_KEY;
const SENDER_EMAIL = process.env.SMTP_FROM || 'Whale Wink <noreply@whalewink.net>';

// Create Resend client
let resend = null;
if (EMAIL_ENABLED) {
    resend = new Resend(RESEND_API_KEY);
    console.log('✅ Resend email notifications enabled');
} else {
    console.log('⚠️ Email not configured (RESEND_API_KEY not set)');
}

// Email templates
const templates = {
    whaleAlert: (data) => ({
        subject: `Whale Alert - ${data.chain} | ${data.label}`,
        html: `
            <div style="font-family: 'Courier New', monospace; background: #0a0a0a; color: #00FF41; padding: 20px; max-width: 600px; margin: 0 auto;">
                <h2 style="border-bottom: 2px solid #00FF41; padding-bottom: 10px;">WHALE ALERT</h2>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 10px; border: 1px solid #00FF41;">Chain</td>
                        <td style="padding: 10px; border: 1px solid #00FF41; font-weight: bold;">${data.chain}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #00FF41;">Label</td>
                        <td style="padding: 10px; border: 1px solid #00FF41;">${data.label}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #00FF41;">Amount</td>
                        <td style="padding: 10px; border: 1px solid #00FF41;">${data.amount}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #00FF41;">USD Value</td>
                        <td style="padding: 10px; border: 1px solid #00FF41; font-weight: bold;">$${data.usd.toLocaleString()}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #00FF41;">Address</td>
                        <td style="padding: 10px; border: 1px solid #00FF41; font-size: 12px;">${data.address}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #00FF41;">Time</td>
                        <td style="padding: 10px; border: 1px solid #00FF41;">${new Date(data.time).toLocaleString()}</td>
                    </tr>
                </table>
                <p style="margin-top: 20px; font-size: 12px; color: #00aa2a;">
                    Sent by Whale Wink<br>
                    <a href="https://whalewink.net" style="color: #00FF41;">https://whalewink.net</a>
                </p>
            </div>
        `,
        text: `
WHALE ALERT

Chain: ${data.chain}
Label: ${data.label}
Amount: ${data.amount}
USD Value: $${data.usd.toLocaleString()}
Address: ${data.address}
Time: ${new Date(data.time).toLocaleString()}

Sent by Whale Wink
        `
    }),
    
    priceAlert: (data) => ({
        subject: `Price Alert - ${data.symbol} ${data.above ? 'ABOVE' : 'BELOW'} $${data.target}`,
        html: `
            <div style="font-family: 'Courier New', monospace; background: #0a0a0a; color: #00FF41; padding: 20px; max-width: 600px; margin: 0 auto;">
                <h2 style="border-bottom: 2px solid #00FF41; padding-bottom: 10px;">PRICE ALERT</h2>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 10px; border: 1px solid #00FF41;">Symbol</td>
                        <td style="padding: 10px; border: 1px solid #00FF41; font-weight: bold;">${data.symbol}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #00FF41;">Current Price</td>
                        <td style="padding: 10px; border: 1px solid #00FF41; font-weight: bold;">$${data.current.toLocaleString()}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #00FF41;">Target</td>
                        <td style="padding: 10px; border: 1px solid #00FF41;">$${data.target.toLocaleString()}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #00FF41;">Direction</td>
                        <td style="padding: 10px; border: 1px solid #00FF41;">${data.above ? 'ABOVE' : 'BELOW'} target</td>
                    </tr>
                </table>
                <p style="margin-top: 20px; font-size: 12px; color: #00aa2a;">
                    Sent by Whale Wink<br>
                    <a href="https://whalewink.net" style="color: #00FF41;">https://whalewink.net</a>
                </p>
            </div>
        `,
        text: `
PRICE ALERT

Symbol: ${data.symbol}
Current Price: $${data.current.toLocaleString()}
Target: $${data.target.toLocaleString()}
Direction: ${data.above ? 'ABOVE' : 'BELOW'} target

Sent by Whale Wink
        `
    }),
    
    welcome: (data) => ({
        subject: 'Welcome to Whale Wink!',
        html: `
            <div style="font-family: 'Courier New', monospace; background: #0a0a0a; color: #00FF41; padding: 20px; max-width: 600px; margin: 0 auto;">
                <h2 style="border-bottom: 2px solid #00FF41; padding-bottom: 10px;">WELCOME TO WHALE WINK</h2>
                <p>Hi ${data.name || 'there'},</p>
                <p>Welcome to Whale Wink - your crypto whale monitoring solution!</p>
                <h3 style="margin-top: 20px;">Getting Started:</h3>
                <ul>
                    <li>Add wallets to monitor in the Dashboard</li>
                    <li>Set up price alerts for your favorite coins</li>
                    <li>Connect Telegram for instant notifications</li>
                    <li>Upgrade to Deep Dive for unlimited features</li>
                </ul>
                <p style="margin-top: 20px;">
                    <a href="https://whalewink.net/dashboard.html" style="background: #00FF41; color: #000; padding: 10px 20px; text-decoration: none;">Go to Dashboard</a>
                </p>
                <p style="margin-top: 20px; font-size: 12px; color: #00aa2a;">
                    Sent by Whale Wink<br>
                    <a href="https://whalewink.net" style="color: #00FF41;">https://whalewink.net</a>
                </p>
            </div>
        `,
        text: `
WELCOME TO WHALE WINK

Hi ${data.name || 'there'},

Welcome to Whale Wink!

Getting Started:
- Add wallets to monitor in the Dashboard
- Set up price alerts for your favorite coins
- Connect Telegram for instant notifications
- Upgrade to Deep Dive for unlimited features

Go to Dashboard: https://whalewink.net/dashboard.html

Sent by Whale Wink
        `
    })
};

// Send email
async function sendEmail(to, template, data) {
    if (!EMAIL_ENABLED) {
        console.log(`Email (disabled): Would send ${template} to ${to}`);
        return { success: false, error: 'Email not configured' };
    }
    
    if (!resend) {
        return { success: false, error: 'Resend not initialized' };
    }
    
    try {
        const content = templates[template](data);
        
        const result = await resend.emails.send({
            from: SENDER_EMAIL,
            to: to,
            subject: content.subject,
            html: content.html,
            text: content.text
        });
        
        console.log(`Email sent: ${template} to ${to}`);
        return { success: true, id: result.data?.id };
    } catch (e) {
        console.log(`Email error: ${e.message}`);
        return { success: false, error: e.message };
    }
}

// Send whale alert
async function sendWhaleAlert(email, alertData) {
    return sendEmail(email, 'whaleAlert', alertData);
}

// Send price alert
async function sendPriceAlert(email, alertData) {
    return sendEmail(email, 'priceAlert', alertData);
}

// Send welcome email
async function sendWelcome(email, name) {
    return sendEmail(email, 'welcome', { name });
}

// Get email config status
function getStatus() {
    return {
        configured: EMAIL_ENABLED,
        provider: 'Resend'
    };
}

module.exports = {
    sendEmail,
    sendWhaleAlert,
    sendPriceAlert,
    sendWelcome,
    getStatus,
    EMAIL_ENABLED
};
