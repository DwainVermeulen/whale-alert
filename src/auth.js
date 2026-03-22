const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('better-sqlite3');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'whale-alert-secret-key-change-in-production';
const DB_PATH = path.join(__dirname, '..', 'users.db');

// Initialize database
const db = new sqlite3(DB_PATH);

// Create tables if not exist
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        email TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        name TEXT,
        plan TEXT DEFAULT 'free',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS user_wallets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        chain TEXT NOT NULL,
        address TEXT NOT NULL,
        label TEXT,
        FOREIGN KEY (email) REFERENCES users(email)
    );
    
    CREATE TABLE IF NOT EXISTS user_price_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        symbol TEXT NOT NULL,
        target REAL NOT NULL,
        above INTEGER NOT NULL,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (email) REFERENCES users(email)
    );
    
    CREATE TABLE IF NOT EXISTS user_settings (
        email TEXT PRIMARY KEY,
        telegram_bot_token TEXT,
        telegram_chat_id TEXT,
        custom_keys TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (email) REFERENCES users(email)
    );
`);

// Default user data structure
const defaultUserData = {
    wallets: {},
    priceAlerts: [],
    telegram: { botToken: '', chatId: '' },
    customApiKeys: { coingecko: '', etherscan: '' },
    priceAlertsConfig: []
};

// Generate JWT token
function generateToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

// Verify JWT token
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (e) {
        return null;
    }
}

// Register new user
function register(email, password, name = '') {
    const existing = db.prepare('SELECT email FROM users WHERE email = ?').get(email);
    if (existing) {
        return { success: false, error: 'Email already registered' };
    }
    
    const hashedPassword = bcrypt.hashSync(password, 10);
    const userName = name || email.split('@')[0];
    
    try {
        db.prepare(`
            INSERT INTO users (email, password, name, plan)
            VALUES (?, ?, ?, 'free')
        `).run(email, hashedPassword, userName);
        
        // Initialize empty settings
        db.prepare(`
            INSERT INTO user_settings (email, custom_keys)
            VALUES (?, '{}')
        `).run(email);
        
        const token = generateToken(email);
        return { success: true, token, user: { email, name: userName, plan: 'free' } };
    } catch (e) {
        console.error('Registration error:', e.message);
        return { success: false, error: 'Registration failed' };
    }
}

// Login user
function login(email, password) {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
        return { success: false, error: 'Invalid email or password' };
    }
    
    if (!bcrypt.compareSync(password, user.password)) {
        return { success: false, error: 'Invalid email or password' };
    }
    
    const token = generateToken(email);
    return { 
        success: true, 
        token, 
        user: { 
            email, 
            name: user.name, 
            plan: user.plan || 'free' 
        } 
    };
}

// Get user data (without password)
function getUser(email) {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return null;
    
    const { password, ...userData } = user;
    return userData;
}

// Get full user data with wallets and alerts
function getFullUserData(email) {
    const user = getUser(email);
    if (!user) return null;
    
    const wallets = db.prepare('SELECT * FROM user_wallets WHERE email = ?').all(email);
    const priceAlerts = db.prepare('SELECT * FROM user_price_alerts WHERE email = ?').all(email);
    const settings = db.prepare('SELECT * FROM user_settings WHERE email = ?').get(email);
    
    // Convert wallets to chain-based format
    const walletsByChain = {};
    for (const w of wallets) {
        if (!walletsByChain[w.chain]) walletsByChain[w.chain] = [];
        walletsByChain[w.chain].push({ address: w.address, label: w.label });
    }
    
    // Convert price alerts
    const alerts = priceAlerts.map(a => ({
        id: a.id,
        symbol: a.symbol,
        target: a.target,
        above: !!a.above,
        active: !!a.active
    }));
    
    return {
        ...user,
        wallets: walletsByChain,
        priceAlerts: alerts,
        telegram: {
            botToken: settings?.telegram_bot_token || '',
            chatId: settings?.telegram_chat_id || ''
        },
        customApiKeys: settings?.custom_keys ? JSON.parse(settings.custom_keys) : { coingecko: '', etherscan: '' }
    };
}

// Update user
function updateUser(email, data) {
    // Don't allow direct password overwrite or plan change via this
    delete data.password;
    delete data.plan;
    delete data.email;
    
    const fields = Object.keys(data);
    if (fields.length === 0) return true;
    
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => data[f]);
    
    try {
        db.prepare(`UPDATE users SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE email = ?`).run(...values, email);
        return true;
    } catch (e) {
        console.error('Update user error:', e.message);
        return false;
    }
}

// Update user plan (called from webhook)
function updateUserPlan(email, plan) {
    try {
        db.prepare('UPDATE users SET plan = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?').run(plan, email);
        console.log(`✅ Updated ${email} to plan: ${plan}`);
        return true;
    } catch (e) {
        console.error('Update plan error:', e.message);
        return false;
    }
}

// Change password
function changePassword(email, oldPassword, newPassword) {
    const user = db.prepare('SELECT password FROM users WHERE email = ?').get(email);
    if (!user) {
        return { success: false, error: 'User not found' };
    }
    
    if (!bcrypt.compareSync(oldPassword, user.password)) {
        return { success: false, error: 'Current password is incorrect' };
    }
    
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    try {
        db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?').run(hashedPassword, email);
        return { success: true };
    } catch (e) {
        return { success: false, error: 'Password change failed' };
    }
}

// Save user data (wallets, alerts, settings)
function saveUserData(email, data) {
    try {
        // Save wallets
        if (data.wallets) {
            db.prepare('DELETE FROM user_wallets WHERE email = ?').run(email);
            const insertWallet = db.prepare('INSERT INTO user_wallets (email, chain, address, label) VALUES (?, ?, ?, ?)');
            for (const [chain, wallets] of Object.entries(data.wallets)) {
                for (const w of wallets) {
                    insertWallet.run(email, chain, w.address, w.label);
                }
            }
        }
        
        // Save price alerts
        if (data.priceAlerts) {
            db.prepare('DELETE FROM user_price_alerts WHERE email = ?').run(email);
            const insertAlert = db.prepare('INSERT INTO user_price_alerts (email, symbol, target, above, active) VALUES (?, ?, ?, ?, ?)');
            for (const a of data.priceAlerts) {
                insertAlert.run(email, a.symbol, a.target, a.above ? 1 : 0, a.active !== false ? 1 : 0);
            }
        }
        
        // Save settings
        if (data.telegram || data.customApiKeys) {
            const current = db.prepare('SELECT * FROM user_settings WHERE email = ?').get(email) || {};
            const telegram = data.telegram || { botToken: current.telegram_bot_token, chatId: current.telegram_chat_id };
            const customKeys = data.customApiKeys ? JSON.stringify(data.customApiKeys) : current.custom_keys || '{}';
            
            db.prepare(`
                INSERT INTO user_settings (email, telegram_bot_token, telegram_chat_id, custom_keys, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(email) DO UPDATE SET
                    telegram_bot_token = excluded.telegram_bot_token,
                    telegram_chat_id = excluded.telegram_chat_id,
                    custom_keys = excluded.custom_keys,
                    updated_at = CURRENT_TIMESTAMP
            `).run(email, telegram.botToken, telegram.chatId, customKeys);
        }
        
        return true;
    } catch (e) {
        console.error('Save user data error:', e.message);
        return false;
    }
}

// Load user data
function loadUserData(email) {
    return getFullUserData(email) || { ...defaultUserData, email };
}

module.exports = {
    register,
    login,
    verifyToken,
    getUser,
    getFullUserData,
    updateUser,
    updateUserPlan,
    changePassword,
    loadUserData,
    saveUserData,
    defaultUserData,
    JWT_SECRET
};
