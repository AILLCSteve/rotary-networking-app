// test-setup.js
// Quick test script to verify the application is set up correctly

const fs = require('fs');
const path = require('path');

console.log('🔍 Rotary Networking App - Setup Verification\n');

let errors = [];
let warnings = [];

// Check Node.js version
const nodeVersion = process.version;
console.log(`✓ Node.js version: ${nodeVersion}`);
if (parseInt(nodeVersion.slice(1).split('.')[0]) < 14) {
    warnings.push('Node.js version 14 or higher is recommended');
}

// Check if .env file exists
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    console.log('✓ .env file found');
    
    // Check for OpenAI API key
    require('dotenv').config();
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
        console.log('✓ OpenAI API key configured');
    } else {
        warnings.push('OpenAI API key not configured - AI features will not work');
    }
} else {
    errors.push('.env file not found - copy .env.example to .env and configure');
}

// Check if database exists
const dbPath = path.join(__dirname, 'networking.db');
if (fs.existsSync(dbPath)) {
    console.log('✓ Database file found');
    
    // Check database is readable
    try {
        const sqlite3 = require('sqlite3').verbose();
        const db = new sqlite3.Database(dbPath);
        
        db.get("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'", (err, row) => {
            if (!err && row.count > 0) {
                console.log(`✓ Database initialized with ${row.count} tables`);
            } else {
                errors.push('Database exists but appears to be empty - run: npm run init-db');
            }
            db.close();
            
            // Print summary after async check
            printSummary();
        });
    } catch (e) {
        errors.push('Cannot read database file - check permissions');
        printSummary();
    }
} else {
    errors.push('Database not found - run: npm run init-db');
    printSummary();
}

// Check required dependencies
const requiredPackages = ['express', 'sqlite3', 'bcrypt', 'openai'];
console.log('\n📦 Checking dependencies:');
requiredPackages.forEach(pkg => {
    try {
        require.resolve(pkg);
        console.log(`✓ ${pkg} installed`);
    } catch (e) {
        errors.push(`Package ${pkg} not installed - run: npm install`);
    }
});

// Check public files
console.log('\n📁 Checking public files:');
const publicFiles = ['index.html', 'matches.html', 'admin.html', 'dashboard.html', 'styles.css'];
publicFiles.forEach(file => {
    const filePath = path.join(__dirname, 'public', file);
    if (fs.existsSync(filePath)) {
        console.log(`✓ ${file} found`);
    } else {
        errors.push(`Missing public file: ${file}`);
    }
});

function printSummary() {
    console.log('\n' + '='.repeat(50));
    
    if (errors.length === 0 && warnings.length === 0) {
        console.log('✅ All checks passed! Your app is ready to run.');
        console.log('\nStart the server with: npm start');
        console.log('Then open: http://localhost:3000');
    } else {
        if (errors.length > 0) {
            console.log('\n❌ ERRORS (must fix):');
            errors.forEach(err => console.log(`   - ${err}`));
        }
        
        if (warnings.length > 0) {
            console.log('\n⚠️  WARNINGS (should address):');
            warnings.forEach(warn => console.log(`   - ${warn}`));
        }
        
        console.log('\nFix the issues above and run this test again.');
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('\n📖 Quick Start Guide:');
    console.log('1. Copy .env.example to .env and add your OpenAI API key');
    console.log('2. Run: npm run init-db');
    console.log('3. Run: npm start');
    console.log('4. Open http://localhost:3000 in your browser');
    console.log('\n🔐 Admin Panel: http://localhost:3000/admin.html');
    console.log('   Default login: admin@rotary.local / rotary2024');
}

// If database check is synchronous or fails, print summary here
if (!fs.existsSync(dbPath)) {
    // Summary already printed above for missing database
}