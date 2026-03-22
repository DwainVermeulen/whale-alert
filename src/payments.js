const axios = require('axios');
const fs = require('fs');
const path = require('path');

const LEMON_API_KEY = process.env.LEMON_SQUEEZY_API_KEY;
const LEMON_CONFIGURED = !!LEMON_API_KEY;

const lemon = LEMON_API_KEY ? axios.create({
    baseURL: 'https://api.lemonsqueezy.com/v1',
    headers: {
        'Authorization': `Bearer ${LEMON_API_KEY}`,
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json'
    }
}) : null;

// Plans configuration
const PLANS = {
    free: {
        id: null,
        name: 'Surface Scan',
        price: 0,
        features: ['5 Wallets', '3 Price Alerts', '3 Chains (ETH, BTC, SOL)', 'Telegram Alerts', '24hr History']
    },
    pro: {
        id: 'pro',
        name: 'Deep Dive',
        price: 9.99,
        interval: 'month',
        variantId: process.env.LEMON_PRO_VARIANT_ID || null,
        features: ['25 Wallets', 'Unlimited Alerts', 'All 9 Chains', 'Email + Telegram', '30-day History', 'Custom Whale Lists']
    },
    enterprise: {
        id: 'enterprise',
        name: 'Abyss Control',
        price: 29.99,
        interval: 'month',
        variantId: process.env.LEMON_ENTERPRISE_VARIANT_ID || null,
        features: ['100 Wallets', 'All Deep Dive features', '90-day History', 'SMS Alerts', 'Multi-user (5 seats)', 'Export to CSV']
    }
};

// Get plans (public)
function getPlans() {
    return Object.entries(PLANS).map(([key, plan]) => ({
        id: key,
        name: plan.name,
        price: plan.price,
        interval: plan.interval || null,
        features: plan.features,
        available: LEMON_CONFIGURED && !!plan.variantId
    }));
}

// Create checkout session
async function createCheckoutSession(userEmail, planId, successUrl, cancelUrl) {
    if (!LEMON_CONFIGURED) {
        return { success: false, error: 'Lemon Squeezy not configured. Add LEMON_SQUEEZY_API_KEY to .env' };
    }
    
    const plan = PLANS[planId];
    if (!plan || !plan.variantId) {
        return { success: false, error: 'Invalid plan or variant not configured' };
    }
    
    try {
        // Create checkout via Lemon Squeezy
        const checkoutData = {
            data: {
                type: "checkouts",
                attributes: {
                    checkout_data: {
                        email: userEmail,
                        custom: {
                            user_email: userEmail,
                            plan_id: planId
                        }
                    },
                    preview: false,
                    return_url: successUrl,
                    cancel_url: cancelUrl
                },
                relationships: {
                    store: {
                        data: {
                            type: "stores",
                            id: "get_from_your_lemon_squeezy_dashboard"
                        }
                    },
                    variant: {
                        data: {
                            type: "variants",
                            id: plan.variantId
                        }
                    }
                }
            }
        };
        
        // Note: You need your Store ID from Lemon Squeezy
        // For now, return instructions
        return { 
            success: false, 
            error: 'Please add your Lemon Squeezy Store ID to .env (LEMON_STORE_ID). You can find it in your store URL or API response.' 
        };
        
    } catch (e) {
        console.log('Lemon Squeezy error:', e.message);
        return { success: false, error: e.message };
    }
}

// Simpler checkout for now - returns a placeholder URL
// Real implementation needs store ID from Lemon Squeezy
async function createSimpleCheckout(userEmail, planId, successUrl, cancelUrl) {
    const plan = PLANS[planId];
    if (!plan || !plan.variantId) {
        return { success: false, error: 'Plan not configured' };
    }
    
    // Generate a simple checkout URL (Lemon Squeezy allows this)
    const checkoutUrl = `https://my-store.lemonsqueezy.com/checkout/buy/${plan.variantId}?checkout[custom][user_email]=${encodeURIComponent(userEmail)}&checkout[custom][plan_id]=${planId}`;
    
    return { success: true, url: checkoutUrl };
}

// Get subscription status (mock for now)
async function getSubscription(userEmail) {
    try {
        // For now, return free plan - real implementation would check Lemon Squeezy API
        return { plan: 'free' };
    } catch (e) {
        return { plan: 'free', error: e.message };
    }
}

// Verify checkout (mock)
async function verifySession(sessionId) {
    return { success: false, error: 'Not implemented' };
}

// Create customer portal session
async function createPortalSession(userEmail, returnUrl) {
    return { success: false, error: 'Not implemented yet' };
}

// Handle webhook
async function handleWebhook(payload, signature) {
    // Would verify webhook signature and process events
    console.log('Lemon Squeezy webhook received');
    return { received: true };
}

// Update user plan
function updateUserPlan(email, plan) {
    try {
        const users = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'users.json'), 'utf8'));
        if (users[email]) {
            users[email].plan = plan;
            fs.writeFileSync(path.join(__dirname, '..', 'users.json'), JSON.stringify(users, null, 2));
            console.log(`✅ Updated user ${email} to plan: ${plan}`);
            return true;
        }
        return false;
    } catch (e) {
        console.error('Error updating user plan:', e.message);
        return false;
    }
}

module.exports = {
    PLANS,
    getPlans,
    createCheckoutSession,
    createSimpleCheckout,
    createPortalSession,
    getSubscription,
    handleWebhook,
    verifySession,
    updateUserPlan
};
