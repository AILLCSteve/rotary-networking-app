#!/bin/bash
# QUICK START SCRIPT - Run this to set up the app quickly
# Make executable with: chmod +x quickstart.sh

echo "🚀 Rotary Networking App - Quick Start Setup"
echo "==========================================="
echo ""

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

echo "✓ Node.js found: $(node --version)"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Check for .env file
if [ ! -f .env ]; then
    echo ""
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please edit .env and add your OpenAI API key"
    echo "   Get one at: https://platform.openai.com/api-keys"
fi

# Initialize database
echo ""
echo "🗄️  Initializing database..."
npm run init-db

# Run setup test
echo ""
echo "🔍 Running setup verification..."
npm run test-setup

echo ""
echo "==========================================="
echo "✅ Setup complete!"
echo ""
echo "To start the application:"
echo "  npm start"
echo ""
echo "Then open in your browser:"
echo "  Registration: http://localhost:3000"
echo "  Admin Panel:  http://localhost:3000/admin.html"
echo "  Dashboard:    http://localhost:3000/dashboard.html"
echo ""
echo "Default admin login:"
echo "  Email: admin@rotary.local"
echo "  Password: rotary2024"
echo ""
echo "⚠️  Remember to:"
echo "  1. Add your OpenAI API key to .env"
echo "  2. Change the admin password for production"
echo "  3. Use HTTPS in production"
echo ""
echo "Good luck with your event! 🎉"
