const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'whale-alert-secret-key-change-in-production';
const USERS_FILE = path.join(__dirname, '..', 'users.json');

// Default user data structure
const defaultUserData = {
    wallets: {},
    priceAlerts: [],
    telegram: { botToken: '', chatId: '' },
    customApiKeys: { coingecko: '', etherscan: '' },
    priceAlertsConfig: []
};

// Load users from file
function loadUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        }
    } catch (e) {
        console.log('⚠️ Error loading users:', e.message);
    }
    return {};
}

// Save users to file
function saveUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (e) {
        console.log('⚠️ Error saving users:', e.message);
    }
}

let users = loadUsers();

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
    if (users[email]) {
        return { success: false, error: 'Email already registered' };
    }
    
    const hashedPassword = bcrypt.hashSync(password, 10);
    users[email] = {
        password: hashedPassword,
        name: name || email.split('@')[0],
        createdAt: new Date().toISOString(),
        plan: 'free', // free, pro, enterprise
        ...JSON.parse(JSON.stringify(defaultUserData))
    };
    
    saveUsers(users);
    
    const token = generateToken(email);
    return { success: true, token, user: { email, name: users[email].name, plan: 'free' } };
}

// Login user
function login(email, password) {
    const user = users[email];
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
    const user = users[email];
    if (!user) return null;
    
    const { password, ...userData } = user;
    return userData;
}

// Update user data
function updateUser(email, data) {
    if (!users[email]) return false;
    
    // Don't allow direct password overwrite (use separate function)
    delete data.password;
    delete data.email;
    delete data.plan;
    
    users[email] = { ...users[email], ...data };
    saveUsers(users);
    return true;
}

// Change password
function changePassword(email, oldPassword, newPassword) {
    const user = users[email];
    if (!user) {
        return { success: false, error: 'User not found' };
    }
    
    if (!bcrypt.compareSync(oldPassword, user.password)) {
        return { success: false, error: 'Current password is incorrect' };
    }
    
    users[email].password = bcrypt.hashSync(newPassword, 10);
    saveUsers(users);
    return { success: true };
}

// Get user-specific data file path
function getUserDataFile(email) {
    const userDir = path.join(__dirname, '..', 'userdata');
    if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
    }
    return path.join(userDir, `${email.replace(/[^a-z0-9]/gi, '_')}.json`);
}

// Load user-specific data
function loadUserData(email) {
    const filePath = getUserDataFile(email);
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (e) {
        console.log('⚠️ Error loading user data:', e.message);
    }
    return JSON.parse(JSON.stringify(defaultUserData));
}

// Save user-specific data
function saveUserData(email, data) {
    const filePath = getUserDataFile(email);
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (e) {
        console.log('⚠️ Error saving user data:', e.message);
    }
}

module.exports = {
    register,
    login,
    verifyToken,
    getUser,
    updateUser,
    changePassword,
    loadUserData,
    saveUserData,
    defaultUserData,
    JWT_SECRET
};
