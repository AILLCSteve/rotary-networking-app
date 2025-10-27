# Rotary Networking App

AI-powered business networking platform for Rotary Club events. Matches members using semantic analysis and GPT-4 to create personalized connection recommendations.

## Features

- **Smart Registration:** Capture member profiles with business needs and assets
- **AI Matching:** Semantic similarity using OpenAI embeddings
- **Intelligent Scoring:** 100-point system combining multiple compatibility factors
- **GPT-4 Rationales:** Personalized connection advice for top matches
- **Admin Dashboard:** Real-time monitoring and member management
- **Live Stats:** Track registrations and matches during events

## Tech Stack

- **Backend:** Node.js + Express
- **Database:** PostgreSQL (Neon)
- **AI:** OpenAI (text-embedding-3-small + GPT-4o/GPT-3.5-turbo)
- **Deployment:** Render

## Quick Start

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete deployment instructions.

### Local Development

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your keys:
# - OPENAI_API_KEY
# - DATABASE_URL (Neon Postgres)
# - SESSION_SECRET

# Start server
npm start
```

## Deployment

This app is designed for **Render + Neon Postgres**. See [DEPLOYMENT.md](DEPLOYMENT.md) for step-by-step instructions.

## Environment Variables

- `OPENAI_API_KEY` - Your OpenAI API key
- `DATABASE_URL` - PostgreSQL connection string (Neon)
- `SESSION_SECRET` - Random string for session encryption
- `NODE_ENV` - Set to `production` for deployment
- `PORT` - Server port (set automatically by Render)

## API Endpoints

- `GET /healthz` - Health check
- `POST /api/register` - Register new member
- `GET /api/member/:memberId` - Get member dashboard
- `POST /api/generate-top3/:memberId` - Generate top 3 matches (GPT-4)
- `POST /api/generate-brainstorm/:memberId` - Generate broader matches (GPT-3.5)
- `POST /api/admin/login` - Admin authentication
- `GET /api/admin/members` - List all members (admin)
- `GET /api/dashboard/stats` - Live event statistics

## License

MIT

