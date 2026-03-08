const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const fs = require('fs');
const path = require('path');

const STRIPE_CONFIGURED = !!process.env.STRIPE_SECRET_KEY;

// Stripe price IDs (from Stripe Dashboard)
const PLANS = {
    free: {
        id: null,
        name: 'Free',
        price: 0,
        features: ['5 Wallets', '3 Price Alerts', 'All Chains', 'Telegram Alerts']
    },
    pro: {
        id: process.env.STRIPE_PRO_PRICE_ID || 'price_pro',
        name: 'Pro',
        price: 9.99,
        interval: 'month',
        features: ['Unlimited Wallets', 'Unlimited Alerts', 'Custom API Keys', 'Priority Support']
    },
    enterprise: {
        id: process.env.STRIPE_ENTERPRISE_PRICE_ID || 'price_enterprise',
        name: 'Enterprise',
        price: 49.99,
        interval: 'month',
        features: ['Everything in Pro', 'API Access', 'White-label', 'Dedicated Support']
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
        priceId: plan.id,
        available: STRIPE_CONFIGURED && !!plan.id
    }));
}

// Create checkout session
async function createCheckoutSession(userEmail, planId, successUrl, cancelUrl) {
    if (!STRIPE_CONFIGURED) {
        return { success: false, error: 'Stripe not configured. Add STRIPE_SECRET_KEY to .env' };
    }
    
    const plan = PLANS[planId];
    if (!plan || !plan.id) {
        return { success: false, error: 'Invalid plan' };
    }
    
    try {
        // Find or create customer
        let customer;
        const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
        
        if (customers.data.length > 0) {
            customer = customers.data[0];
        } else {
            customer = await stripe.customers.create({
                email: userEmail,
                metadata: { source: 'whale-alert' }
            });
        }
        
        // Create checkout session
        const session = await stripe.checkout.sessions.create({
            customer: customer.id,
            payment_method_types: ['card'],
            line_items: [{
                price: plan.id,
                quantity: 1
            }],
            mode: 'subscription',
            success_url: successUrl + '?session_id={CHECKOUT_SESSION_ID}',
            cancel_url: cancelUrl,
            metadata: {
                userEmail,
                planId
            }
        });
        
        return { success: true, sessionId: session.id, url: session.url };
    } catch (e) {
        console.log('Stripe error:', e.message);
        return { success: false, error: e.message };
    }
}

// Create customer portal session
async function createPortalSession(userEmail, returnUrl) {
    if (!STRIPE_CONFIGURED) {
        return { success: false, error: 'Stripe not configured' };
    }
    
    try {
        let customer;
        const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
        
        if (customers.data.length === 0) {
            return { success: false, error: 'No subscription found' };
        }
        
        customer = customers.data[0];
        
        const session = await stripe.billingPortal.sessions.create({
            customer: customer.id,
            return_url: returnUrl
        });
        
        return { success: true, url: session.url };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// Get subscription status
async function getSubscription(userEmail) {
    try {
        const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
        
        if (customers.data.length === 0) {
            return { plan: 'free' };
        }
        
        const customer = customers.data[0];
        const subscriptions = await stripe.subscriptions.list({
            customer: customer.id,
            status: 'active',
            limit: 1
        });
        
        if (subscriptions.data.length === 0) {
            return { plan: 'free' };
        }
        
        const sub = subscriptions.data[0];
        const priceId = sub.items.data[0].price.id;
        
        // Find plan by price ID
        let plan = 'free';
        for (const [key, p] of Object.entries(PLANS)) {
            if (p.id === priceId) {
                plan = key;
                break;
            }
        }
        
        return {
            plan,
            customerId: customer.id,
            subscriptionId: sub.id,
            currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString()
        };
    } catch (e) {
        return { plan: 'free', error: e.message };
    }
}

// Handle webhook
async function handleWebhook(payload, signature) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    try {
        const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
        
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                console.log('Checkout completed:', session.id);
                const email = session.metadata?.userEmail;
                const planId = session.metadata?.planId;
                if (email && planId) {
                    updateUserPlan(email, planId);
                }
                break;
            }
            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                console.log('Subscription updated:', subscription.id);
                break;
            }
            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                console.log('Subscription cancelled:', subscription.id);
                break;
            }
            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                console.log('Payment failed:', invoice.id);
                break;
            }
        }
        
        return { received: true, event };
    } catch (e) {
        return { error: e.message, event: null };
    }
}

// Verify checkout session
async function verifySession(sessionId) {
    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        return {
            success: true,
            customerId: session.customer,
            subscriptionId: session.subscription,
            status: session.payment_status
        };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// Update user plan in database
function updateUserPlan(email, plan) {
    try {
        const users = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'users.json'), 'utf8'));
        if (users[email]) {
            users[email].plan = plan;
            require('fs').writeFileSync(require('path').join(__dirname, '..', 'users.json'), JSON.stringify(users, null, 2));
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
    createPortalSession,
    getSubscription,
    handleWebhook,
    verifySession,
    updateUserPlan
};
