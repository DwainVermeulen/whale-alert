# Whale Wink - Deployment Guide

## Backend (Server)

### Option 1: Render.com (Free)
1. Go to [render.com](https://render.com)
2. Connect your GitHub account
3. Create a new **Web Service**
   - Repository: `DwainVermeulen/whale-alert`
   - Branch: `main`
   - Build Command: `npm install`
   - Start Command: `node src/server.js`
4. Add Environment Variables:
   - `TELEGRAM_BOT_TOKEN` - Your Telegram bot token
   - `TELEGRAM_CHAT_ID` - Your Telegram chat ID
   - `ETHERSCAN_API_KEY` - From etherscan.io
   - `STRIPE_SECRET_KEY` - From stripe.com
   - `STRIPE_PUBLISHABLE_KEY` - From stripe.com
   - `JWT_SECRET` - Generate a random string

### Option 2: Railway
1. Go to [railway.app](https://railway.app)
2. Connect GitHub → New Project → Deploy from GitHub repo
3. Add the same environment variables

### Option 3: Fly.io
```bash
fly launch
fly deploy
```

---

## Frontend (Landing + Dashboard)

### Vercel (Recommended - Free)
1. Go to [vercel.com](https://vercel.com)
2. Import `DwainVermeulen/whale-alert`
3. Settings:
   - Build Command: `echo "Static"`
   - Output Directory: `.`
4. Deploy!

---

## Mobile Web App

### Vercel
1. In `mobile/App.tsx`, update `const API` to your production server URL
2. Run: `cd mobile && npx expo export --platform web`
3. Deploy the `mobile/dist` folder to Vercel

---

## Environment Variables Reference

```env
# Required
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
ETHERSCAN_API_KEY=your_etherscan_key
JWT_SECRET=random_secure_string

# Stripe (for payments)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_ENTERPRISE_PRICE_ID=price_...

# Web Push (optional)
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email
SMTP_PASS=your_app_password
```

---

## Production URL

After deployment, update the mobile app:
- Edit `mobile/App.tsx`
- Change `const API` to your production server URL
- Rebuild and redeploy
