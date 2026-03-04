const fs = require('fs');
const path = require('path');

const ANALYTICS_FILE = path.join(__dirname, '..', 'analytics.json');

// Default analytics structure
const defaultAnalytics = {
    users: {}, // userId -> { logins: [], actions: [], lastActive: null }
    totals: {
        logins: 0,
        registrations: 0,
        walletsAdded: 0,
        alertsCreated: 0,
        checkouts: 0,
        apiCalls: 0
    },
    daily: {} // "2026-03-04" -> { logins: 0, apiCalls: 0, etc }
};

// Load analytics
function loadAnalytics() {
    try {
        if (fs.existsSync(ANALYTICS_FILE)) {
            const data = JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf8'));
            // Convert plain objects back to Sets for activeUsers
            if (data.daily) {
                for (const key of Object.keys(data.daily)) {
                    if (data.daily[key].activeUsers && !(data.daily[key].activeUsers instanceof Set)) {
                        data.daily[key].activeUsers = new Set(Object.keys(data.daily[key].activeUsers));
                    }
                }
            }
            return data;
        }
    } catch (e) {
        console.log('⚠️ Error loading analytics:', e.message);
    }
    return JSON.parse(JSON.stringify(defaultAnalytics));
}

// Save analytics
function saveAnalytics(data) {
    try {
        // Deep clone and convert Sets to arrays for JSON serialization
        const toSave = JSON.parse(JSON.stringify(data));
        for (const key of Object.keys(toSave.daily || {})) {
            if (toSave.daily[key].activeUsers instanceof Set) {
                toSave.daily[key].activeUsers = Array.from(toSave.daily[key].activeUsers);
            }
        }
        fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(toSave, null, 2));
    } catch (e) {
        console.log('⚠️ Error saving analytics:', e.message);
    }
}

let analytics = loadAnalytics();

// Get today's date key
function todayKey() {
    return new Date().toISOString().slice(0, 10);
}

// Initialize daily if needed
function ensureDaily(key = todayKey()) {
    if (!analytics.daily[key]) {
        analytics.daily[key] = {
            logins: 0,
            registrations: 0,
            walletsAdded: 0,
            alertsCreated: 0,
            checkouts: 0,
            apiCalls: 0,
            activeUsers: new Set()
        };
    } else if (!(analytics.daily[key].activeUsers instanceof Set)) {
        // Convert plain object to Set if loaded from file
        analytics.daily[key].activeUsers = new Set(Object.keys(analytics.daily[key].activeUsers || {}));
    }
}

// Track an event
function track(event, userId = null, details = {}) {
    const key = todayKey();
    ensureDaily(key);
    
    // Update totals
    if (analytics.totals[event] !== undefined) {
        analytics.totals[event]++;
    }
    
    // Update daily
    if (analytics.daily[key][event] !== undefined) {
        analytics.daily[key][event]++;
    }
    
    // Track active users
    if (userId) {
        analytics.daily[key].activeUsers.add(userId);
        
        if (!analytics.users[userId]) {
            analytics.users[userId] = {
                logins: 0,
                actions: [],
                firstSeen: key,
                lastActive: key
            };
        }
        
        analytics.users[userId].lastActive = key;
        
        if (event === 'logins') {
            analytics.users[userId].logins++;
        }
        
        // Track user actions
        if (details.action) {
            analytics.users[userId].actions.push({
                type: details.action,
                timestamp: new Date().toISOString(),
                details: details
            });
            
            // Keep only last 100 actions per user
            if (analytics.users[userId].actions.length > 100) {
                analytics.users[userId].actions = analytics.users[userId].actions.slice(-100);
            }
        }
    }
    
    saveAnalytics(analytics);
}

// Increment API calls (called by middleware)
function trackApiCall(userId = null) {
    const key = todayKey();
    ensureDaily(key);
    analytics.totals.apiCalls++;
    analytics.daily[key].apiCalls++;
    
    if (userId) {
        analytics.daily[key].activeUsers.add(userId);
    }
    
    // Save periodically (not every call)
    if (analytics.totals.apiCalls % 100 === 0) {
        saveAnalytics(analytics);
    }
}

// Get analytics summary
function getSummary(days = 7) {
    const keys = [];
    const now = new Date();
    for (let i = 0; i < days; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        keys.push(d.toISOString().slice(0, 10));
    }
    
    const summary = {
        totals: analytics.totals,
        period: { days },
        daily: [],
        topUsers: []
    };
    
    // Get daily data for period
    for (const key of keys) {
        if (analytics.daily[key]) {
            const d = analytics.daily[key];
            summary.daily.push({
                date: key,
                ...d,
                activeUsers: d.activeUsers ? d.activeUsers.size : 0
            });
        } else {
            summary.daily.push({ date: key, activeUsers: 0 });
        }
    }
    summary.daily.reverse();
    
    // Get top users by activity
    const userActivity = Object.entries(analytics.users)
        .map(([email, data]) => ({
            email,
            actions: data.actions.length,
            lastActive: data.lastActive,
            firstSeen: data.firstSeen
        }))
        .sort((a, b) => b.actions - a.actions)
        .slice(0, 10);
    
    summary.topUsers = userActivity;
    
    return summary;
}

// Get user-specific analytics
function getUserAnalytics(userId) {
    const user = analytics.users[userId];
    if (!user) {
        return null;
    }
    
    return {
        ...user,
        actions: user.actions.slice(-50) // Last 50 actions
    };
}

module.exports = {
    track,
    trackApiCall,
    getSummary,
    getUserAnalytics
};
