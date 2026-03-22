const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Email configuration
const EMAIL_ENABLED = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

// Create transporter
let transporter = null;

if (EMAIL_ENABLED) {
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
    
    console.log('✅ Email notifications enabled');
} else {
    console.log('⚠️ Email not configured (SMTP_HOST not set)');
}

// Email templates
const templates = {
    whaleAlert: (data) => ({
        subject: `🐋 Whale Alert - ${data.chain} | ${data.label}`,
        html: `
            <div style="font-family: 'Courier New', monospace; background: #0a0a0a; color: #00FF41; padding: 20px; max-width: 600px; margin: 0 auto;">
                <h2 style="border-bottom: 2px solid #00FF41; padding-bottom: 10px;">🐋 WHALE ALERT</h2>
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
                    Sent by Whale Alert Terminal<br>
                    <a href="#" style="color: #00FF41;">https://whalewink.net</a>
                </p>
            </div>
        `,
        text: `
🐋 WHALE ALERT

Chain: ${data.chain}
Label: ${data.label}
Amount: ${data.amount}
USD Value: $${data.usd.toLocaleString()}
Address: ${data.address}
Time: ${new Date(data.time).toLocaleString()}

Sent by Whale Alert Terminal
        `
    }),
    
    priceAlert: (data) => ({
        subject: `🔔 Price Alert - ${data.symbol} ${data.above ? '↑' : '↓'} $${data.target}`,
        html: `
            <div style="font-family: 'Courier New', monospace; background: #0a0a0a; color: #00FF41; padding: 20px; max-width: 600px; margin: 0 auto;">
                <h2 style="border-bottom: 2px solid #00FF41; padding-bottom: 10px;">🔔 PRICE ALERT</h2>
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
                        <td style="padding: 10px; border: 1px solid #00FF41;">${data.above ? '⬆️ Above' : '⬇️ Below'} target</td>
                    </tr>
                </table>
                <p style="margin-top: 20px; font-size: 12px; color: #00aa2a;">
                    Sent by Whale Alert Terminal<br>
                    <a href="#" style="color: #00FF41;">https://whalewink.net</a>
                </p>
            </div>
        `,
        text: `
🔔 PRICE ALERT

Symbol: ${data.symbol}
Current Price: $${data.current.toLocaleString()}
Target: $${data.target.toLocaleString()}
Direction: ${data.above ? 'Above' : 'Below'} target

Sent by Whale Alert Terminal
        `
    }),
    
    welcome: (data) => ({
        subject: 'Welcome to Whale Alert Terminal!',
        html: `
            <div style="font-family: 'Courier New', monospace; background: #0a0a0a; color: #00FF41; padding: 20px; max-width: 600px; margin: 0 auto;">
                <h2 style="border-bottom: 2px solid #00FF41; padding-bottom: 10px;">🐋 WELCOME TO WHALE ALERT</h2>
                <p>Hi ${data.name || 'there'},</p>
                <p>Welcome to Whale Alert Terminal - your crypto whale monitoring solution!</p>
                <h3 style="margin-top: 20px;">Getting Started:</h3>
                <ul>
                    <li>Add wallets to monitor in the Dashboard</li>
                    <li>Set up price alerts for your favorite coins</li>
                    <li>Connect Telegram for instant notifications</li>
                    <li>Upgrade to Pro for unlimited features</li>
                </ul>
                <p style="margin-top: 20px;">
                    <a href="#" style="background: #00FF41; color: #000; padding: 10px 20px; text-decoration: none;">Go to Dashboard</a>
                </p>
                <p style="margin-top: 20px; font-size: 12px; color: #00aa2a;">
                    Sent by Whale Alert Terminal<br>
                    <a href="#" style="color: #00FF41;">https://whalewink.net</a>
                </p>
            </div>
        `,
        text: `
🐋 WELCOME TO WHALE ALERT

Hi ${data.name || 'there'},

Welcome to Whale Alert Terminal!

Getting Started:
- Add wallets to monitor in the Dashboard
- Set up price alerts for your favorite coins
- Connect Telegram for instant notifications
- Upgrade to Pro for unlimited features

Go to Dashboard: https://whalewink.net

Sent by Whale Alert Terminal
        `
    })
};

// Send email
async function sendEmail(to, template, data) {
    if (!EMAIL_ENABLED) {
        console.log(`📧 Email (disabled): Would send ${template} to ${to}`);
        return { success: false, error: 'Email not configured' };
    }
    
    if (!transporter) {
        return { success: false, error: 'Transporter not initialized' };
    }
    
    try {
        const content = templates[template](data);
        
        const info = await transporter.sendMail({
            from: process.env.SMTP_FROM || '"Whale Alert" <noreply@whalewink.net>',
            to,
            subject: content.subject,
            html: content.html,
            text: content.text
        });
        
        console.log(`📧 Email sent: ${template} to ${to}`);
        return { success: true, messageId: info.messageId };
    } catch (e) {
        console.log(`📧 Email error: ${e.message}`);
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
        host: EMAIL_ENABLED ? process.env.SMTP_HOST : null
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
