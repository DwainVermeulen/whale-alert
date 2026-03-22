const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'whale-alert-secret-key-change-in-production';
const DB_PATH = path.join(__dirname, '..', 'users.db');

// Initialize SQL.js
let db = null;
let SQL = null;

async function initDB() {
    if (db) return db;
    
    SQL = await initSqlJs();
    
    // Try to load existing database
    try {
        if (fs.existsSync(DB_PATH)) {
            const buffer = fs.readFileSync(DB_PATH);
            db = new SQL.Database(buffer);
        } else {
            db = new SQL.Database();
        }
    } catch (e) {
        db = new SQL.Database();
    }
    
    // Create tables
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            email TEXT PRIMARY KEY,
            password TEXT NOT NULL,
            name TEXT,
            plan TEXT DEFAULT 'free',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS user_wallets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            chain TEXT NOT NULL,
            address TEXT NOT NULL,
            label TEXT,
            FOREIGN KEY (email) REFERENCES users(email)
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS user_price_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            symbol TEXT NOT NULL,
            target REAL NOT NULL,
            above INTEGER NOT NULL,
            active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (email) REFERENCES users(email)
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS user_settings (
            email TEXT PRIMARY KEY,
            telegram_bot_token TEXT,
            telegram_chat_id TEXT,
            custom_keys TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (email) REFERENCES users(email)
        )
    `);
    
    saveDB();
    return db;
}

function saveDB() {
    if (!db) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

// Initialize on load
initDB().catch(console.error);

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
    if (!db) return { success: false, error: 'Database not ready' };
    
    const existing = db.exec(`SELECT email FROM users WHERE email = '${email}'`);
    if (existing.length > 0 && existing[0].values.length > 0) {
        return { success: false, error: 'Email already registered' };
    }
    
    const hashedPassword = bcrypt.hashSync(password, 10);
    const userName = name || email.split('@')[0];
    
    try {
        db.run(`INSERT INTO users (email, password, name, plan) VALUES (?, ?, ?, 'free')`, 
            [email, hashedPassword, userName]);
        
        db.run(`INSERT INTO user_settings (email, custom_keys) VALUES (?, '{}')`, 
            [email]);
        
        saveDB();
        
        const token = generateToken(email);
        return { success: true, token, user: { email, name: userName, plan: 'free' } };
    } catch (e) {
        console.error('Registration error:', e.message);
        return { success: false, error: 'Registration failed' };
    }
}

// Login user
function login(email, password) {
    if (!db) return { success: false, error: 'Database not ready' };
    
    const result = db.exec(`SELECT * FROM users WHERE email = '${email}'`);
    if (result.length === 0 || result[0].values.length === 0) {
        return { success: false, error: 'Invalid email or password' };
    }
    
    const user = { email: result[0].values[0][0], password: result[0].values[0][1], name: result[0].values[0][2], plan: result[0].values[0][3] };
    
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
    if (!db) return null;
    
    const result = db.exec(`SELECT email, name, plan, created_at FROM users WHERE email = '${email}'`);
    if (result.length === 0 || result[0].values.length === 0) return null;
    
    return {
        email: result[0].values[0][0],
        name: result[0].values[0][1],
        plan: result[0].values[0][2],
        created_at: result[0].values[0][3]
    };
}

// Get full user data with wallets and alerts
function getFullUserData(email) {
    const user = getUser(email);
    if (!user) return null;
    
    const wallets = db.exec(`SELECT chain, address, label FROM user_wallets WHERE email = '${email}'`);
    const priceAlerts = db.exec(`SELECT id, symbol, target, above, active FROM user_price_alerts WHERE email = '${email}'`);
    const settings = db.exec(`SELECT telegram_bot_token, telegram_chat_id, custom_keys FROM user_settings WHERE email = '${email}'`);
    
    // Convert wallets to chain-based format
    const walletsByChain = {};
    if (wallets.length > 0) {
        for (const w of wallets[0].values) {
            if (!walletsByChain[w[0]]) walletsByChain[w[0]] = [];
            walletsByChain[w[0]].push({ address: w[1], label: w[2] });
        }
    }
    
    // Convert price alerts
    const alerts = [];
    if (priceAlerts.length > 0) {
        for (const a of priceAlerts[0].values) {
            alerts.push({
                id: a[0],
                symbol: a[1],
                target: a[2],
                above: !!a[3],
                active: !!a[4]
            });
        }
    }
    
    let settingsData = {};
    if (settings.length > 0 && settings[0].values.length > 0) {
        settingsData = {
            telegram_bot_token: settings[0].values[0][0] || '',
            telegram_chat_id: settings[0].values[0][1] || '',
            custom_keys: settings[0].values[0][2] || '{}'
        };
    }
    
    return {
        ...user,
        wallets: walletsByChain,
        priceAlerts: alerts,
        telegram: {
            botToken: settingsData.telegram_bot_token || '',
            chatId: settingsData.telegram_chat_id || ''
        },
        customApiKeys: settingsData.custom_keys ? JSON.parse(settingsData.custom_keys) : { coingecko: '', etherscan: '' }
    };
}

// Update user
function updateUser(email, data) {
    if (!db) return false;
    
    // Don't allow direct password or plan change via this
    delete data.password;
    delete data.plan;
    delete data.email;
    
    const fields = Object.keys(data);
    if (fields.length === 0) return true;
    
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => data[f]);
    
    try {
        db.run(`UPDATE users SET ${setClause}, updated_at = datetime('now') WHERE email = ?`, [...values, email]);
        saveDB();
        return true;
    } catch (e) {
        console.error('Update user error:', e.message);
        return false;
    }
}

// Update user plan (called from webhook)
function updateUserPlan(email, plan) {
    if (!db) return false;
    
    try {
        db.run(`UPDATE users SET plan = ?, updated_at = datetime('now') WHERE email = ?`, [plan, email]);
        saveDB();
        console.log(`Updated ${email} to plan: ${plan}`);
        return true;
    } catch (e) {
        console.error('Update plan error:', e.message);
        return false;
    }
}

// Change password
function changePassword(email, oldPassword, newPassword) {
    if (!db) return { success: false, error: 'Database not ready' };
    
    const result = db.exec(`SELECT password FROM users WHERE email = '${email}'`);
    if (result.length === 0 || result[0].values.length === 0) {
        return { success: false, error: 'User not found' };
    }
    
    const currentPassword = result[0].values[0][0];
    if (!bcrypt.compareSync(oldPassword, currentPassword)) {
        return { success: false, error: 'Current password is incorrect' };
    }
    
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    try {
        db.run(`UPDATE users SET password = ?, updated_at = datetime('now') WHERE email = ?`, [hashedPassword, email]);
        saveDB();
        return { success: true };
    } catch (e) {
        return { success: false, error: 'Password change failed' };
    }
}

// Save user data (wallets, alerts, settings)
function saveUserData(email, data) {
    if (!db) return false;
    
    try {
        // Save wallets
        if (data.wallets) {
            db.run(`DELETE FROM user_wallets WHERE email = '${email}'`);
            for (const [chain, wallets] of Object.entries(data.wallets)) {
                for (const w of wallets) {
                    db.run(`INSERT INTO user_wallets (email, chain, address, label) VALUES (?, ?, ?, ?)`,
                        [email, chain, w.address, w.label]);
                }
            }
        }
        
        // Save price alerts
        if (data.priceAlerts) {
            db.run(`DELETE FROM user_price_alerts WHERE email = '${email}'`);
            for (const a of data.priceAlerts) {
                db.run(`INSERT INTO user_price_alerts (email, symbol, target, above, active) VALUES (?, ?, ?, ?, ?)`,
                    [email, a.symbol, a.target, a.above ? 1 : 0, a.active !== false ? 1 : 0]);
            }
        }
        
        // Save settings
        if (data.telegram || data.customApiKeys) {
            const current = db.exec(`SELECT telegram_bot_token, telegram_chat_id, custom_keys FROM user_settings WHERE email = '${email}'`);
            let telegram = { botToken: '', chatId: '' };
            let customKeys = '{}';
            
            if (current.length > 0 && current[0].values.length > 0) {
                telegram = { 
                    botToken: current[0].values[0][0] || '', 
                    chatId: current[0].values[0][1] || '' 
                };
                customKeys = current[0].values[0][2] || '{}';
            }
            
            if (data.telegram) {
                telegram = { ...telegram, ...data.telegram };
            }
            if (data.customApiKeys) {
                customKeys = JSON.stringify(data.customApiKeys);
            }
            
            db.run(`INSERT OR REPLACE INTO user_settings (email, telegram_bot_token, telegram_chat_id, custom_keys, updated_at) VALUES (?, ?, ?, ?, datetime('now'))`,
                [email, telegram.botToken, telegram.chatId, customKeys]);
        }
        
        saveDB();
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
