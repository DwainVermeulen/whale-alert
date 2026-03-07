require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const http = require('http');
const WebSocket = require('ws');
const webpush = require('web-push');
const auth = require('./auth');
const payments = require('./payments');
const analytics = require('./analytics');
const emails = require('./emails');

// Web Push configuration
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(
        'mailto:support@whale-alert.app',
        vapidPublicKey,
        vapidPrivateKey
    );
    console.log('✅ Web Push configured');
}

// Store push subscriptions (in memory - would use DB in production)
const pushSubscriptions = [];

function sendPushNotification(subscription, payload) {
    if (!subscription || !vapidPublicKey) return;
    
    webpush.sendNotification(
        subscription,
        JSON.stringify(payload)
    ).catch(err => {
        if (err.statusCode === 410) {
            // Subscription expired - remove it
            const idx = pushSubscriptions.indexOf(subscription);
            if (idx > -1) pushSubscriptions.splice(idx, 1);
        }
    });
}

function broadcastPushNotification(payload) {
    pushSubscriptions.forEach(sub => sendPushNotification(sub, payload));
}

const CONFIG = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    ALERT_THRESHOLD_USD: 10000,
    CHECK_INTERVAL_MS: 30000,
    ETHERSCAN_API_KEY: process.env.ETHERSCAN_API_KEY,
    SOLANA_RPC: process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com',
    BLOCKSTREAM_API: 'https://blockstream.info/api',
};

// Rate Limiting Configuration
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per window
    message: { error: 'Too many login attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute
    message: { error: 'Too many API requests, please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Auth middleware
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = auth.verifyToken(token);
    
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    req.userId = decoded.userId;
    req.userData = auth.loadUserData(decoded.userId);
    next();
}

// Optional auth - doesn't fail if no token
function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const decoded = auth.verifyToken(token);
        if (decoded) {
            req.userId = decoded.userId;
            req.userData = auth.loadUserData(decoded.userId);
        }
    }
    next();
}

// Default whale wallets (used as defaults for new users)
const DEFAULT_WHALE_WALLETS = {
    ethereum: [
        { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', label: 'Vitalik Buterin' },
        { address: '0x28C6c06298d514Db089934071355E5743bf21d60', label: 'Binance 14' },
    ],
    bitcoin: [
        { address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', label: 'Binance Cold' },
    ],
    solana: [
        { address: 'EPjFWdd5AufqSSCwBkCwBz8L1hKjBRQ54iTZ2EfHT3t5', label: 'USDC Circle' },
    ],
    base: [
        { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', label: 'Vitalik (Base)' },
    ],
    arbitrum: [
        { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', label: 'Vitalik (Arb)' },
    ],
    tron: [
        { address: 'TVkmtEy1E柄3LHPsD1LqK3KqhGmhC5', label: 'Binance (TRC20)' },
    ],
    bsc: [
        { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', label: 'Vitalik (BSC)' },
    ],
};

// Multi-chain support
const CHAINS = {
    ethereum: { name: 'Ethereum', symbol: 'ETH', color: '#627eea', rpc: null },
    bitcoin: { name: 'Bitcoin', symbol: 'BTC', color: '#f7931a', rpc: null },
    solana: { name: 'Solana', symbol: 'SOL', color: '#9945ff', rpc: 'https://api.mainnet-beta.solana.com' },
    base: { name: 'Base', symbol: 'ETH', color: '#0052ff', rpc: 'https://mainnet.base.org' },
    arbitrum: { name: 'Arbitrum', symbol: 'ETH', color: '#28a0f0', rpc: 'https://arb1.arbitrum.io/rpc' },
    avalanche: { name: 'Avalanche', symbol: 'AVAX', color: '#e84142', rpc: 'https://api.avax.network/ext/bc/C/rpc' },
    polygon: { name: 'Polygon', symbol: 'MATIC', color: '#8247e5', rpc: 'https://polygon-rpc.com' },
    tron: { name: 'Tron', symbol: 'TRX', color: '#FF0013', rpc: 'https://api.trongrid.io' },
    bsc: { name: 'BNB Chain', symbol: 'BNB', color: '#F3BA2F', rpc: 'https://bsc-dataseed.binance.org' },
};

const WHALE_WALLETS = {
    ethereum: [
        { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', label: 'Vitalik Buterin' },
        { address: '0x28C6c06298d514Db089934071355E5743bf21d60', label: 'Binance 14' },
    ],
    bitcoin: [
        { address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', label: 'Binance Cold' },
    ],
    solana: [
        { address: 'EPjFWdd5AufqSSCwBkCwBz8L1hKjBRQ54iTZ2EfHT3t5', label: 'USDC Circle' },
    ],
    base: [
        { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', label: 'Vitalik (Base)' },
    ],
    arbitrum: [
        { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', label: 'Vitalik (Arb)' },
    ],
    tron: [
        { address: 'TVkmtEy1E柄3LHPsD1LqK3KqhGmhC5', label: 'Binance (TRC20)' },
    ],
    bsc: [
        { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', label: 'Vitalik (BSC)' },
    ],
};

// Price alerts
const priceAlerts = [];

// Historical data (last 24h)
const history = {};

// State
const prices = { eth: 2500, btc: 45000, sol: 100, avax: 35, matic: 0.85, trx: 0, bnb: 0 };
const gasPrices = { eth: 0, base: 0, arbitrum: 0, polygon: 0, sol: 0 };
const alerts = [];
const sentimentData = { bullish: 0, bearish: 0, score: 50 };
const seenTxHashes = new Set();
let bot = null;
let chatId = null;
let customApiKeys = { coingecko: '', etherscan: '' };

const path = require('path');
const fs = require('fs');

// Data file path
const DATA_FILE = path.join(__dirname, '..', 'data.json');

// Load data from file
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            
            // Load wallets
            if (data.wallets) {
                Object.keys(data.wallets).forEach(chain => {
                    if (WHALE_WALLETS[chain]) {
                        WHALE_WALLETS[chain] = data.wallets[chain];
                    }
                });
            }
            
            // Load price alerts
            if (data.priceAlerts) {
                data.priceAlerts.forEach(a => priceAlerts.push(a));
            }
            
            // Load Telegram config
            if (data.telegram && data.telegram.botToken && data.telegram.chatId) {
                CONFIG.TELEGRAM_BOT_TOKEN = data.telegram.botToken;
                chatId = data.telegram.chatId;
                try {
                    bot = new TelegramBot(data.telegram.botToken, { polling: false });
                    console.log('✅ Telegram loaded from saved config');
                } catch (e) {
                    console.log('⚠️ Failed to load Telegram config');
                }
            }
            
            // Load custom API keys
            if (data.customApiKeys) {
                customApiKeys = data.customApiKeys;
            }
            
            console.log('✅ Data loaded from', DATA_FILE);
        }
    } catch (e) {
        console.log('⚠️ Error loading data:', e.message);
    }
}

// Save data to file
function saveData() {
    try {
        const data = {
            wallets: WHALE_WALLETS,
            priceAlerts: priceAlerts,
            telegram: {
                botToken: CONFIG.TELEGRAM_BOT_TOKEN || '',
                chatId: chatId || ''
            },
            customApiKeys: customApiKeys
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.log('⚠️ Error saving data:', e.message);
    }
}

// Load data on startup
loadData();

const staticPath = path.join(__dirname, '..');
const dashboardPath = path.join(staticPath, 'dashboard.html');
console.log('Static path:', staticPath);
console.log('Dashboard path:', dashboardPath);
console.log('Exists:', fs.existsSync(dashboardPath));

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(staticPath));

// ============================================
// WEBSOCKET SERVER
// ============================================
let wss;

function initWebSocket(server) {
    wss = new WebSocket.Server({ server });
    
    wss.on('connection', (ws) => {
        console.log('🔌 WebSocket client connected');
        
        // Send current state immediately on connect
        ws.send(JSON.stringify({
            type: 'init',
            data: {
                alerts: alerts.slice(0, 20),
                prices,
                gas: gasPrices,
                sentiment: sentimentData
            }
        }));
        
        ws.on('close', () => {
            console.log('🔌 WebSocket client disconnected');
        });
    });
    
    console.log('✅ WebSocket server initialized');
}

// Broadcast to all connected clients
function broadcast(type, data) {
    if (!wss) return;
    
    const message = JSON.stringify({ type, data });
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Apply general rate limiting to all API routes
app.use('/api', apiLimiter);

// Analytics middleware - track API calls
app.use('/api', (req, res, next) => {
    // Get user from auth header if present
    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const decoded = auth.verifyToken(token);
        if (decoded) {
            userId = decoded.userId;
        }
    }
    analytics.trackApiCall(userId);
    next();
});

// Landing page
app.get('/', (req, res) => {
    const html = fs.readFileSync(path.join(staticPath, 'index.html'), 'utf8');
    res.type('html').send(html);
});

app.get('/dashboard', (req, res) => {
    res.redirect('/dashboard.html');
});

app.get('/dashboard.html', (req, res) => {
    const html = fs.readFileSync(dashboardPath, 'utf8');
    res.type('html').send(html);
});

app.get('/settings.html', (req, res) => {
    const html = fs.readFileSync(path.join(staticPath, 'settings.html'), 'utf8');
    res.type('html').send(html);
});

// API Endpoints
app.get('/api/alerts', (req, res) => res.json({ alerts: alerts.slice(0, 20) }));

// Push notification endpoints
app.get('/api/push/vapidPublicKey', (req, res) => {
    res.json({ publicKey: vapidPublicKey || '' });
});

app.post('/api/push/subscribe', (req, res) => {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
        return res.json({ success: false, error: 'Invalid subscription' });
    }
    
    // Check if already subscribed
    const exists = pushSubscriptions.some(s => s.endpoint === subscription.endpoint);
    if (!exists) {
        pushSubscriptions.push(subscription);
    }
    
    res.json({ success: true });
});

app.post('/api/push/unsubscribe', (req, res) => {
    const { endpoint } = req.body;
    const idx = pushSubscriptions.findIndex(s => s.endpoint === endpoint);
    if (idx > -1) {
        pushSubscriptions.splice(idx, 1);
    }
    res.json({ success: true });
});

// WebSocket connection info
app.get('/api/ws', (req, res) => {
    const protocol = req.protocol === 'https' ? 'wss' : 'ws';
    res.json({ 
        url: `${protocol}://${req.get('host')}`,
        supported: true
    });
});

app.get('/api/wallets', (req, res) => {
    const allWallets = Object.entries(WHALE_WALLETS).flatMap(([chain, wallets]) =>
        wallets.map(w => ({ ...w, chain, chainName: CHAINS[chain]?.name, chainColor: CHAINS[chain]?.color }))
    );
    res.json({ wallets: allWallets, chains: Object.keys(CHAINS) });
});

app.get('/api/stats', (req, res) => {
    const totalWallets = Object.values(WHALE_WALLETS).flat().length;
    res.json({
        totalWallets,
        alertsToday: alerts.filter(a => new Date(a.time).toDateString() === new Date().toDateString()).length,
        prices,
        gas: gasPrices,
        sentiment: sentimentData,
        supportedChains: Object.entries(CHAINS).map(([k, v]) => ({ id: k, ...v })),
        history: Object.entries(history).map(([k, v]) => ({ time: k, ...v })).slice(-24)
    });
});

app.get('/api/price-alerts', (req, res) => res.json({ alerts: priceAlerts }));

app.post('/api/price-alerts', (req, res) => {
    const { symbol, target, above } = req.body;
    priceAlerts.push({ symbol: symbol.toUpperCase(), target: parseFloat(target), above: above !== false, active: true });
    saveData();
    res.json({ success: true, alerts: priceAlerts });
});

app.delete('/api/price-alerts', (req, res) => {
    const { index } = req.body;
    if (index >= 0 && index < priceAlerts.length) {
        priceAlerts.splice(index, 1);
    }
    saveData();
    res.json({ success: true, alerts: priceAlerts });
});

// Telegram configuration
app.get('/api/telegram/status', (req, res) => {
    res.json({ 
        configured: !!(CONFIG.TELEGRAM_BOT_TOKEN && chatId),
        chatId: chatId ? 'configured' : null
    });
});

app.post('/api/telegram/configure', (req, res) => {
    const { botToken, chatId: newChatId } = req.body;
    if (!botToken || !newChatId) {
        return res.json({ success: false, error: 'Bot token and chat ID required' });
    }
    try {
        CONFIG.TELEGRAM_BOT_TOKEN = botToken;
        bot = new TelegramBot(botToken, { polling: false });
        chatId = newChatId;
        // Test the connection
        bot.sendMessage(chatId, '✅ <b>Whale Alert Terminal Connected!</b>\n\nYou will now receive whale alerts here.', { parse_mode: 'HTML' })
            .then(() => {
                saveData();
                res.json({ success: true });
            })
            .catch(e => {
                bot = null;
                chatId = null;
                res.json({ success: false, error: 'Invalid token or chat ID' });
            });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.post('/api/telegram/test', (req, res) => {
    if (!bot || !chatId) {
        return res.json({ success: false, error: 'Telegram not configured' });
    }
    bot.sendMessage(chatId, '🧪 <b>Test Alert</b>\n\nYour Whale Alert Terminal is working!', { parse_mode: 'HTML' })
        .then(() => res.json({ success: true }))
        .catch(e => res.json({ success: false, error: e.message }));
});

// Custom API Keys

app.get('/api/keys', (req, res) => {
    res.json({ 
        coingecko: customApiKeys.coingecko ? 'configured' : '',
        etherscan: customApiKeys.etherscan ? 'configured' : ''
    });
});

app.post('/api/keys', (req, res) => {
    const { coingecko, etherscan } = req.body;
    if (coingecko) customApiKeys.coingecko = coingecko;
    if (etherscan) customApiKeys.etherscan = etherscan;
    saveData();
    res.json({ success: true });
});

// Wallet management
app.post('/api/wallets', (req, res) => {
    const { chain, address, label } = req.body;
    if (!chain || !address) {
        return res.json({ success: false, error: 'Chain and address required' });
    }
    if (!WHALE_WALLETS[chain]) {
        return res.json({ success: false, error: 'Invalid chain' });
    }
    WHALE_WALLETS[chain].push({ address, label: label || address });
    saveData();
    res.json({ success: true, wallets: WHALE_WALLETS });
});

app.delete('/api/wallets', (req, res) => {
    const { chain, index } = req.body;
    if (!WHALE_WALLETS[chain] || index < 0 || index >= WHALE_WALLETS[chain].length) {
        return res.json({ success: false, error: 'Invalid chain or index' });
    }
    WHALE_WALLETS[chain].splice(index, 1);
    saveData();
    res.json({ success: true, wallets: WHALE_WALLETS });
});

// ============================================
// AUTHENTICATION ENDPOINTS
// ============================================

// Register new user
app.post('/api/auth/register', authLimiter, (req, res) => {
    const { email, password, name } = req.body;
    if (!email || !password) {
        return res.json({ success: false, error: 'Email and password required' });
    }
    if (password.length < 6) {
        return res.json({ success: false, error: 'Password must be at least 6 characters' });
    }
    const result = auth.register(email, password, name);
    if (result.success) {
        analytics.track('registrations', email);
    }
    res.json(result);
});

// Login
app.post('/api/auth/login', authLimiter, (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.json({ success: false, error: 'Email and password required' });
    }
    const result = auth.login(email, password);
    if (result.success) {
        analytics.track('logins', email);
    }
    res.json(result);
});

// Get current user
app.get('/api/auth/me', requireAuth, (req, res) => {
    const user = auth.getUser(req.userId);
    res.json({ 
        user: { 
            email: req.userId, 
            name: user.name, 
            plan: user.plan || 'free',
            createdAt: user.createdAt
        } 
    });
});

// Update profile
app.post('/api/auth/profile', requireAuth, (req, res) => {
    const { name } = req.body;
    if (name) {
        auth.updateUser(req.userId, { name });
    }
    res.json({ success: true });
});

// Change password
app.post('/api/auth/password', requireAuth, (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
        return res.json({ success: false, error: 'Old and new password required' });
    }
    if (newPassword.length < 6) {
        return res.json({ success: false, error: 'New password must be at least 6 characters' });
    }
    const result = auth.changePassword(req.userId, oldPassword, newPassword);
    res.json(result);
});

// ============================================
// USER-SPECIFIC DATA ENDPOINTS (Authenticated)
// ============================================

// Get user wallets
app.get('/api/user/wallets', requireAuth, (req, res) => {
    const userData = req.userData;
    const wallets = userData.wallets || DEFAULT_WHALE_WALLETS;
    const allWallets = Object.entries(wallets).flatMap(([chain, walletList]) =>
        walletList.map(w => ({ ...w, chain, chainName: CHAINS[chain]?.name, chainColor: CHAINS[chain]?.color }))
    );
    res.json({ wallets: allWallets, chains: Object.keys(CHAINS) });
});

// Add wallet
app.post('/api/user/wallets', requireAuth, (req, res) => {
    const { chain, address, label } = req.body;
    if (!chain || !address) {
        return res.json({ success: false, error: 'Chain and address required' });
    }
    if (!CHAINS[chain]) {
        return res.json({ success: false, error: 'Invalid chain' });
    }
    
    const userData = req.userData;
    if (!userData.wallets) userData.wallets = JSON.parse(JSON.stringify(DEFAULT_WHALE_WALLETS));
    if (!userData.wallets[chain]) userData.wallets[chain] = [];
    
    userData.wallets[chain].push({ address, label: label || address });
    auth.saveUserData(req.userId, userData);
    
    analytics.track('walletsAdded', req.userId, { action: 'add_wallet', chain });
    
    res.json({ success: true, wallets: userData.wallets });
});

// Remove wallet
app.delete('/api/user/wallets', requireAuth, (req, res) => {
    const { chain, index } = req.body;
    const userData = req.userData;
    
    if (!userData.wallets || !userData.wallets[chain] || index < 0 || index >= userData.wallets[chain].length) {
        return res.json({ success: false, error: 'Invalid chain or index' });
    }
    
    userData.wallets[chain].splice(index, 1);
    auth.saveUserData(req.userId, userData);
    
    res.json({ success: true, wallets: userData.wallets });
});

// Get user price alerts
app.get('/api/user/price-alerts', requireAuth, (req, res) => {
    const userData = req.userData;
    res.json({ alerts: userData.priceAlerts || [] });
});

// Add price alert
app.post('/api/user/price-alerts', requireAuth, (req, res) => {
    const { symbol, target, above } = req.body;
    const userData = req.userData;
    
    if (!userData.priceAlerts) userData.priceAlerts = [];
    userData.priceAlerts.push({ 
        symbol: symbol.toUpperCase(), 
        target: parseFloat(target), 
        above: above !== false, 
        active: true 
    });
    
    auth.saveUserData(req.userId, userData);
    
    analytics.track('alertsCreated', req.userId, { action: 'create_alert', symbol });
    
    res.json({ success: true, alerts: userData.priceAlerts });
});

// Remove price alert
app.delete('/api/user/price-alerts', requireAuth, (req, res) => {
    const { index } = req.body;
    const userData = req.userData;
    
    if (!userData.priceAlerts || index < 0 || index >= userData.priceAlerts.length) {
        return res.json({ success: false, error: 'Invalid index' });
    }
    
    userData.priceAlerts.splice(index, 1);
    auth.saveUserData(req.userId, userData);
    
    res.json({ success: true, alerts: userData.priceAlerts });
});

// Get user Telegram config
app.get('/api/user/telegram', requireAuth, (req, res) => {
    const userData = req.userData;
    res.json({ 
        configured: !!(userData.telegram?.botToken && userData.telegram?.chatId),
        chatId: userData.telegram?.chatId ? 'configured' : null
    });
});

// Configure Telegram
app.post('/api/user/telegram/configure', requireAuth, (req, res) => {
    const { botToken, chatId: newChatId } = req.body;
    if (!botToken || !newChatId) {
        return res.json({ success: false, error: 'Bot token and chat ID required' });
    }
    
    try {
        const testBot = new TelegramBot(botToken, { polling: false });
        const userData = req.userData;
        
        userData.telegram = { botToken, chatId: newChatId };
        
        // Test connection
        testBot.sendMessage(newChatId, '✅ <b>Whale Alert Terminal Connected!</b>', { parse_mode: 'HTML' })
            .then(() => {
                auth.saveUserData(req.userId, userData);
                res.json({ success: true });
            })
            .catch(e => {
                res.json({ success: false, error: 'Invalid token or chat ID' });
            });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// Test Telegram
app.post('/api/user/telegram/test', requireAuth, (req, res) => {
    const userData = req.userData;
    
    if (!userData.telegram?.botToken || !userData.telegram?.chatId) {
        return res.json({ success: false, error: 'Telegram not configured' });
    }
    
    try {
        const testBot = new TelegramBot(userData.telegram.botToken, { polling: false });
        testBot.sendMessage(userData.telegram.chatId, '🧪 <b>Test Alert</b>', { parse_mode: 'HTML' })
            .then(() => res.json({ success: true }))
            .catch(e => res.json({ success: false, error: e.message }));
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// Get user API keys
app.get('/api/user/keys', requireAuth, (req, res) => {
    const userData = req.userData;
    res.json({ 
        coingecko: userData.customApiKeys?.coingecko ? 'configured' : '',
        etherscan: userData.customApiKeys?.etherscan ? 'configured' : ''
    });
});

// Save API keys
app.post('/api/user/keys', requireAuth, (req, res) => {
    const { coingecko, etherscan } = req.body;
    const userData = req.userData;
    
    if (!userData.customApiKeys) userData.customApiKeys = { coingecko: '', etherscan: '' };
    if (coingecko) userData.customApiKeys.coingecko = coingecko;
    if (etherscan) userData.customApiKeys.etherscan = etherscan;
    
    auth.saveUserData(req.userId, userData);
    res.json({ success: true });
});

// ============================================
// EMAIL NOTIFICATION ENDPOINTS
// ============================================

// Get email config status
app.get('/api/email/status', (req, res) => {
    res.json(emails.getStatus());
});

// Get user email settings
app.get('/api/user/email', requireAuth, (req, res) => {
    const userData = req.userData;
    res.json({ 
        email: userData.email || null,
        emailAlerts: userData.emailAlerts || false,
        emailWhales: userData.emailWhales !== false,
        emailPrices: userData.emailPrices !== false
    });
});

// Configure user email
app.post('/api/user/email', requireAuth, (req, res) => {
    const { email, emailAlerts, emailWhales, emailPrices } = req.body;
    const userData = req.userData;
    
    if (email) {
        // Basic email validation
        if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            return res.json({ success: false, error: 'Invalid email address' });
        }
        userData.email = email;
    }
    
    if (emailAlerts !== undefined) userData.emailAlerts = emailAlerts;
    if (emailWhales !== undefined) userData.emailWhales = emailWhales;
    if (emailPrices !== undefined) userData.emailPrices = emailPrices;
    
    auth.saveUserData(req.userId, userData);
    
    res.json({ success: true, email: userData.email });
});

// Send test email
app.post('/api/user/email/test', requireAuth, async (req, res) => {
    const userData = req.userData;
    
    if (!userData.email) {
        return res.json({ success: false, error: 'No email configured' });
    }
    
    const result = await emails.sendWelcome(userData.email, userData.name || 'User');
    res.json(result);
});

// Get user plan
app.get('/api/user/plan', requireAuth, (req, res) => {
    const user = auth.getUser(req.userId);
    res.json({ plan: user.plan || 'free' });
});

// ============================================
// PAYMENT ENDPOINTS
// ============================================

// Get available plans
app.get('/api/plans', (req, res) => {
    const plans = payments.getPlans();
    
    // Add Stripe publishable key (frontend needs this)
    res.json({ 
        plans,
        stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || ''
    });
});

// Create checkout session
app.post('/api/checkout', requireAuth, rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 checkouts per hour
    message: { error: 'Too many checkout attempts, please try again later.' }
}), async (req, res) => {
    const { planId } = req.body;
    const successUrl = req.protocol + '://' + req.get('host') + '/dashboard.html?upgrade=success';
    const cancelUrl = req.protocol + '://' + req.get('host') + '/dashboard.html?upgrade=cancelled';
    
    const result = await payments.createCheckoutSession(req.userId, planId, successUrl, cancelUrl);
    res.json(result);
});

// Verify checkout session
app.get('/api/checkout/verify', requireAuth, async (req, res) => {
    const { sessionId } = req.query;
    if (!sessionId) {
        return res.json({ success: false, error: 'Session ID required' });
    }
    
    const result = await payments.verifySession(sessionId);
    
    if (result.success && result.status === 'paid') {
        // Get plan from metadata (would need to fetch session again)
        // For now, just return success - user can check their plan
    }
    
    res.json(result);
});

// Get current subscription
app.get('/api/subscription', requireAuth, async (req, res) => {
    // First check local user data
    const user = auth.getUser(req.userId);
    const localPlan = user.plan || 'free';
    
    // If on free plan, just return that
    if (localPlan === 'free') {
        return res.json({ plan: 'free', planDetails: payments.PLANS.free });
    }
    
    // Otherwise verify with Stripe
    const stripeSub = await payments.getSubscription(req.userId);
    res.json({
        plan: stripeSub.plan || localPlan,
        planDetails: payments.PLANS[stripeSub.plan] || payments.PLANS.free,
        currentPeriodEnd: stripeSub.currentPeriodEnd
    });
});

// Customer portal
app.post('/api/portal', requireAuth, async (req, res) => {
    const returnUrl = req.protocol + '://' + req.get('host') + '/dashboard.html';
    const result = await payments.createPortalSession(req.userId, returnUrl);
    res.json(result);
});

// Analytics endpoints
app.get('/api/analytics/summary', requireAuth, (req, res) => {
    const summary = analytics.getSummary(7);
    res.json(summary);
});

app.get('/api/analytics/me', requireAuth, (req, res) => {
    const userAnalytics = analytics.getUserAnalytics(req.userId);
    res.json(userAnalytics || { message: 'No activity yet' });
});

// Stripe webhook (no auth - from Stripe)
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['stripe-signature'];
    const result = await payments.handleWebhook(req.body, signature);
    res.json(result);
});

// ============================================
// PUBLIC/MONITORING FUNCTIONS
// ============================================

async function fetchPrices() {
    try {
        let url = 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin,solana,avalanche-2,matic-network,tron,binancecoin&vs_currencies=usd';
        if (customApiKeys.coingecko) {
            url += '&x_cg_demo_api_key=' + customApiKeys.coingecko;
        }
        const response = await axios.get(url, { timeout: 5000 });
        prices.eth = response.data?.ethereum?.usd || prices.eth;
        prices.btc = response.data?.bitcoin?.usd || prices.btc;
        prices.sol = response.data?.solana?.usd || prices.sol;
        prices.avax = response.data?.['avalanche-2']?.usax || prices.avax;
        prices.matic = response.data?.['matic-network']?.usd || prices.matic;
        prices.trx = response.data?.tron?.usd || 0;
        prices.bnb = response.data?.binancecoin?.usd || 0;
        
        // Update history
        const hour = new Date().toISOString().slice(0, 13);
        if (!history[hour]) history[hour] = { btc: 0, eth: 0, alerts: 0 };
        history[hour].btc = prices.btc;
        history[hour].eth = prices.eth;
        
        // Check price alerts
        checkPriceAlerts();
    } catch (e) { console.log('⚠️ Price fetch error'); }
}

async function fetchGasPrices() {
    try {
        // ETH gas - try multiple sources
        let ethGas = null;
        
        // Try EthScan V2 first (free, no key needed for estimates)
        try {
            const response = await axios.get('https://api.etherscan.io/v2/api?chainid=1&action=gasoracle&apikey=YourApiKeyToken', { timeout: 5000 });
            if (response.data?.status === '1') {
                ethGas = {
                    slow: parseFloat(response.data.result.SafeGasPrice),
                    normal: parseFloat(response.data.result.ProposeGasPrice),
                    fast: parseFloat(response.data.result.FastGasPrice)
                };
            }
        } catch (e) {}
        
        // Fallback: estimate from recent transactions if API fails
        if (!ethGas || !ethGas.normal) {
            ethGas = { slow: 8, normal: 12, fast: 20 }; // reasonable defaults
        }
        
        gasPrices.eth = ethGas;
        
        // Base (simplified estimate)
        gasPrices.base = Math.round(ethGas.normal * 0.1);
        // Arbitrum
        gasPrices.arbitrum = Math.round(ethGas.normal * 0.05);
        // Polygon
        gasPrices.polygon = 50;
        // Solana (lamports)
        gasPrices.sol = 5000;
    } catch (e) { 
        // Fallback defaults
        gasPrices.eth = { slow: 10, normal: 15, fast: 25 };
        gasPrices.base = 1;
        gasPrices.arbitrum = 1;
        gasPrices.polygon = 50;
        gasPrices.sol = 5000;
        console.log('⚠️ Gas fetch error, using defaults');
    }
}

function checkPriceAlerts() {
    for (const alert of priceAlerts) {
        if (!alert.active) continue;
        const current = prices[alert.symbol.toLowerCase()];
        if (!current) continue;
        
        const triggered = alert.above ? current >= alert.target : current <= alert.target;
        if (triggered) {
            alert.active = false;
            const msg = `🔔 <b>Price Alert</b>\n\n${alert.symbol} is now $${current.toLocaleString()} (${alert.above ? '⬆️ above' : '⬇️ below'} $${alert.target})`;
            if (bot && chatId) bot.sendMessage(chatId, msg, { parse_mode: 'HTML' });
        }
    }
}

function calculateSentiment() {
    const now = Date.now();
    const recent = alerts.filter(a => now - new Date(a.time).getTime() < 3600000); // Last hour
    
    let inflow = 0, outflow = 0;
    recent.forEach(a => {
        if (a.action === 'In') inflow += a.usd;
        else outflow += a.usd;
    });
    
    if (inflow + outflow > 0) {
        sentimentData.score = Math.min(100, Math.max(0, 50 + ((inflow - outflow) / (inflow + outflow)) * 50));
    }
    sentimentData.bullish = Math.round(sentimentData.score);
    sentimentData.bearish = 100 - sentimentData.bullish;
}

async function checkWallet(chain, wallet) {
    try {
        if (chain === 'ethereum') {
            const url = `https://api.etherscan.io/api?module=account&action=txlist&address=${wallet.address}&startblock=0&endblock=99999999&sort=desc&apikey=${CONFIG.ETHERSCAN_API_KEY}`;
            const res = await axios.get(url, { timeout: 10000 });
            if (res.data.status === '1' && res.data.result.length > 0) {
                const tx = res.data.result[0];
                if (!seenTxHashes.has(tx.hash)) {
                    seenTxHashes.add(tx.hash);
                    const value = parseFloat(tx.value) / 1e18;
                    const usd = value * prices.eth;
                    if (usd > CONFIG.ALERT_THRESHOLD_USD) {
                        addAlert({ chain: 'ETH', label: wallet.label, address: wallet.address, action: 'Out', amount: `${value.toFixed(4)} ETH`, usd });
                    }
                }
            }
        } else if (chain === 'bitcoin') {
            const url = `${CONFIG.BLOCKSTREAM_API}/address/${wallet.address}/txs`;
            const res = await axios.get(url, { timeout: 10000 });
            if (res.data?.length > 0) {
                const tx = res.data[0];
                if (!seenTxHashes.has(tx.txid)) {
                    seenTxHashes.add(tx.txid);
                    const value = tx.vout.reduce((sum, o) => sum + o.value, 0) / 1e8;
                    const usd = value * prices.btc;
                    if (usd > CONFIG.ALERT_THRESHOLD_USD) {
                        addAlert({ chain: 'BTC', label: wallet.label, address: wallet.address, action: 'Out', amount: `${value.toFixed(4)} BTC`, usd });
                    }
                }
            }
        }
    } catch (e) { console.log(`❌ ${chain} error`); }
}

function addAlert(data) {
    const alert = { ...data, time: new Date().toISOString() };
    alerts.unshift(alert);
    if (alerts.length > 100) alerts.pop();
    
    calculateSentiment();
    
    console.log(`\n🐋 WHALE ALERT - ${data.chain} | ${data.label}: ${data.amount} ($${data.usd.toLocaleString()})`);
    
    // Broadcast to WebSocket clients
    broadcast('alert', alert);
    
    // Send browser push notifications
    const pushPayload = {
        title: '🐋 Whale Alert',
        body: `${data.chain} - ${data.label}: ${data.amount} ($${data.usd.toLocaleString()})`,
        icon: '/favicon.ico',
        tag: 'whale-alert',
        data: alert
    };
    broadcastPushNotification(pushPayload);
    
    if (bot && chatId) {
        bot.sendMessage(chatId, `🐋 <b>Whale Alert</b>\n\n<b>${data.chain}</b> - ${data.label}\n${data.amount} ($${data.usd.toLocaleString()})`, { parse_mode: 'HTML' }).catch(() => {});
    }
}

async function startMonitoring() {
    if (CONFIG.TELEGRAM_BOT_TOKEN) {
        bot = new TelegramBot(CONFIG.TELEGRAM_BOT_TOKEN, { polling: false });
        chatId = process.env.TELEGRAM_CHAT_ID;
    }

    console.log('\n🐋 Whale Alert Pro - Starting...');
    
    const checkAll = async () => {
        await fetchPrices();
        await fetchGasPrices();
        for (const [chain, wallets] of Object.entries(WHALE_WALLETS)) {
            for (const wallet of wallets) await checkWallet(chain, wallet);
        }
    };

    await checkAll();
    setInterval(checkAll, CONFIG.CHECK_INTERVAL_MS);
    
    // Also broadcast prices every 30 seconds
    setInterval(() => {
        broadcast('prices', { prices, gas: gasPrices, sentiment: sentimentData });
    }, 30000);

    const PORT = 3000;
    const server = http.createServer(app);
    initWebSocket(server);
    server.listen(PORT, () => {
        console.log(`🌐 Server: http://localhost:${PORT}`);
        console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
    });
}

startMonitoring();
