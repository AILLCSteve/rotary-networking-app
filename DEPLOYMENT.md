# Rotary Networking App - Deployment Guide

## Overview

This AI-powered networking app matches Rotary club members using OpenAI embeddings and GPT-4 to generate personalized connection recommendations.

**Stack:**
- Backend: Node.js + Express
- Database: PostgreSQL (Neon)
- AI: OpenAI API (embeddings + GPT-4o/GPT-3.5-turbo)
- Hosting: Render (Web Service)

---

## Prerequisites

1. **OpenAI API Key** - Get from https://platform.openai.com/api-keys
2. **Neon Postgres Database** - Sign up at https://neon.tech
3. **Render Account** - Sign up at https://render.com (paid plan recommended for no cold starts)
4. **GitHub Account** - For deploying from repository

---

## Step 1: Set Up Neon Database

1. Go to https://neon.tech and create a new project
2. Choose a region close to your presentation location
3. Copy the **pooled connection string** (not the direct connection string)
   - It should look like: `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`
4. Go to the Neon SQL Editor
5. Run the migration script from `migrations/001_init.sql` to create all tables

**Quick way to run migration:**
```bash
psql "$DATABASE_URL" -f migrations/001_init.sql
```

Or paste the contents of `migrations/001_init.sql` directly into the Neon SQL Editor.

---

## Step 2: Prepare GitHub Repository

1. **Install dependencies locally:**
   ```bash
   npm install
   ```

2. **Initialize git (if not already):**
   ```bash
   git init
   git add .
   git commit -m "Initial commit - ready for deployment"
   ```

3. **Push to GitHub:**
   ```bash
   # Create a new repo on GitHub first, then:
   git remote add origin https://github.com/YOUR_USERNAME/rotary-networking.git
   git branch -M main
   git push -u origin main
   ```

---

## Step 3: Deploy to Render

### 3.1 Create Web Service

1. Go to https://dashboard.render.com
2. Click **New** → **Web Service**
3. Connect your GitHub repository
4. Configure the service:
   - **Name:** rotary-networking (or your choice)
   - **Region:** Same as Neon DB region (for best performance)
   - **Branch:** main
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Select a **paid plan** (to avoid cold starts during your presentation)

### 3.2 Set Environment Variables

In the Render dashboard, go to **Environment** and add:

```
OPENAI_API_KEY=sk-proj-...your-actual-key...
DATABASE_URL=postgresql://...your-neon-connection-string...
SESSION_SECRET=generate-a-random-string-here
NODE_ENV=production
```

**Generate a strong SESSION_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3.3 Deploy

1. Click **Create Web Service**
2. Wait for the first build to complete (~2-3 minutes)
3. Your app will be live at: `https://your-app-name.onrender.com`

---

## Step 4: Verify Deployment

### Test Health Check
```bash
curl https://your-app-name.onrender.com/healthz
```

Expected response:
```json
{"status":"ok","timestamp":"2025-01-26T..."}
```

### Test Registration
```bash
curl -X POST https://your-app-name.onrender.com/api/register   -H "Content-Type: application/json"   -d '{
    "name":"Test User",
    "org":"Test Company",
    "role":"CEO",
    "industry":"Technology",
    "city":"Seattle",
    "rev_driver":"SaaS subscriptions",
    "current_constraint":"Marketing",
    "assets":"software development",
    "needs":"marketing",
    "email":"test@example.com",
    "consent":true
  }'
```

### Access Admin Dashboard
1. Go to: `https://your-app-name.onrender.com/admin.html`
2. Login with:
   - **Username:** admin
   - **Password:** admin
3. **IMPORTANT:** Change the admin password after first login!

---

## Step 5: Load Test Data (Optional)

To populate the database with sample members for demonstration:

```bash
# Register multiple members
curl -X POST https://your-app-name.onrender.com/api/register -H "Content-Type: application/json" -d @test-data/member1.json
curl -X POST https://your-app-name.onrender.com/api/register -H "Content-Type: application/json" -d @test-data/member2.json
# ... repeat for more members
```

---

## Step 6: Pre-Presentation Checklist

### 5 Minutes Before Your Talk

1. **Health Check:**
   ```bash
   curl https://your-app-name.onrender.com/healthz
   ```

2. **Test Registration Flow:**
   - Visit `https://your-app-name.onrender.com`
   - Register a test member
   - Verify you get a member ID back

3. **Test AI Matching:**
   - Generate top 3 matches for a member
   - Verify AI rationales are being generated

4. **Check Logs:**
   - Open Render dashboard → Your service → Logs
   - Keep this tab open during presentation

5. **Backup Network:**
   - Have a mobile hotspot ready as backup
   - Test the app works on your phone's network

---

## Architecture Overview

```
User Browser
    ↓
Render Web Service (Express)
    ↓
    ├─→ OpenAI API (Embeddings + GPT-4)
    └─→ Neon Postgres DB
```

### Key Features

- **AI-Powered Matching:** Uses text-embedding-3-small for semantic similarity
- **Smart Scoring:** 100-point system combining:
  - Semantic similarity (40 pts)
  - Complementary needs/assets (30 pts)
  - Location match (15 pts)
  - Industry synergy (10 pts)
  - Constraint alignment (5 pts)
- **GPT-4 Rationales:** Top 3 matches use GPT-4o for highest quality
- **GPT-3.5 Brainstorm:** Broader matches use GPT-3.5-turbo for speed
- **Real-time Admin Dashboard:** Monitor registrations and matches live

---

## Troubleshooting

### Database Connection Fails
- Verify `DATABASE_URL` has `?sslmode=require` at the end
- Check Neon dashboard shows database is active
- Run migration script if tables don't exist

### OpenAI API Errors
- Verify `OPENAI_API_KEY` is set correctly
- Check you have credits at https://platform.openai.com/usage
- Monitor rate limits if making many requests

### App Not Loading
- Check Render logs for errors
- Verify environment variables are set
- Ensure build completed successfully

### Slow Performance
- Upgrade to a paid Render instance to avoid cold starts
- Choose same region for Render and Neon
- Pre-warm the app before your presentation

---

## Cost Estimates (Per Presentation)

- **Render:** ~$7/month (Starter plan, cancel after presentation)
- **Neon:** Free tier (sufficient for demo)
- **OpenAI:**
  - Embeddings: ~$0.0001 per member
  - GPT-4o rationales: ~$0.01-0.02 per match
  - Total for 20 members: ~$2-5

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Set up local .env
cp .env.example .env
# Edit .env with your keys

# 3. Run locally (using Neon DB)
npm start

# 4. Or use nodemon for development
npm run dev
```

---

## Support

For issues or questions:
- Check Render logs first
- Verify all environment variables
- Test health endpoint
- Review OpenAI usage dashboard

Good luck with your presentation! 🎉

