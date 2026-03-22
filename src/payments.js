const axios = require('axios');
const fs = require('fs');
const path = require('path');

const LEMON_API_KEY = process.env.LEMON_SQUEEZY_API_KEY;
const LEMON_STORE_ID = process.env.LEMON_STORE_ID;
const LEMON_CONFIGURED = !!LEMON_API_KEY && !!LEMON_STORE_ID;

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
        variantId: process.env.LEMON_PRO_VARIANT_ID || '1432426',
        features: ['25 Wallets', 'Unlimited Alerts', 'All 9 Chains', 'Email + Telegram', '30-day History', 'Custom Whale Lists']
    },
    enterprise: {
        id: 'enterprise',
        name: 'Abyss Control',
        price: 29.99,
        interval: 'month',
        variantId: process.env.LEMON_ENTERPRISE_VARIANT_ID || '1432437',
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
    return createSimpleCheckout(userEmail, planId, successUrl, cancelUrl);
}

// Simpler checkout - uses Lemon Squeezy hosted checkout URL
async function createSimpleCheckout(userEmail, planId, successUrl, cancelUrl) {
    const plan = PLANS[planId];
    if (!plan || !plan.variantId) {
        return { success: false, error: 'Plan not configured' };
    }
    
    try {
        // Create checkout via Lemon Squeezy API
        const checkoutData = {
            data: {
                type: "checkouts",
                attributes: {
                    checkout_data: {
                        email: userEmail,
                        custom: {
                            user_email: userEmail,
                            plan_id: planId
                        },
                        redirect_url: successUrl
                    }
                },
                relationships: {
                    store: {
                        data: {
                            type: "stores",
                            id: LEMON_STORE_ID
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
        
        const response = await lemon.post('/checkouts', checkoutData);
        const checkoutUrl = response.data.data.attributes.url;
        
        return { success: true, url: checkoutUrl };
        
    } catch (e) {
        console.log('Lemon Squeezy checkout error:', e.response?.data || e.message);
        // Fallback to hosted checkout URL
        const storeSlug = 'whale-wink';
        const checkoutUrl = `https://${storeSlug}.lemonsqueezy.com/checkout/buy/${plan.variantId}?checkout[custom][user_email]=${encodeURIComponent(userEmail)}&checkout[custom][plan_id]=${planId}&checkout[redirect]=${encodeURIComponent(successUrl)}`;
        
        return { success: true, url: checkoutUrl };
    }
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
async function handleWebhook(eventName, payload) {
    console.log('Lemon Squeezy webhook:', eventName);
    
    try {
        switch (eventName) {
            case 'subscription_created':
            case 'subscription_updated': {
                const { custom_data, customer_email, status } = payload;
                const email = custom_data?.user_email || customer_email;
                const planId = custom_data?.plan_id;
                
                if (email && planId && status === 'active') {
                    updateUserPlan(email, planId);
                    console.log(`✅ Subscription activated for ${email}: ${planId}`);
                }
                break;
            }
            
            case 'subscription_cancelled':
            case 'subscription_expired': {
                const { custom_data, customer_email } = payload;
                const email = custom_data?.user_email || customer_email;
                
                if (email) {
                    updateUserPlan(email, 'free');
                    console.log(`✅ Subscription cancelled for ${email}: reverted to free`);
                }
                break;
            }
            
            case 'order_created': {
                // New purchase
                const { custom_data, customer_email } = payload;
                const email = custom_data?.user_email || customer_email;
                const planId = custom_data?.plan_id;
                
                if (email && planId) {
                    updateUserPlan(email, planId);
                    console.log(`✅ Order processed for ${email}: ${planId}`);
                }
                break;
            }
            
            default:
                console.log('Unhandled webhook event:', eventName);
        }
        
        return { received: true };
    } catch (e) {
        console.error('Webhook error:', e.message);
        return { error: e.message };
    }
}

// Update user plan
function updateUserPlan(email, plan) {
    try {
        // Map plan names
        let mappedPlan = plan;
        if (plan === 'pro') mappedPlan = 'deep';
        if (plan === 'enterprise') mappedPlan = 'abyss';
        
        // Use auth module to update
        const auth = require('./auth');
        return auth.updateUserPlan(email, mappedPlan);
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
