// ============================================================================
// LOAD LOCAL BUSINESS DATA - Your original CA/MN test data
// ============================================================================

const { Pool } = require('pg');

// Use Neon connection string from environment or .env
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const localBusinesses = [
  // ========= SAN JOSE, CA =========
  {
    member_id: 'member-local-001',
    name: 'James Warren',
    org: 'Chromatic Coffee',
    role: 'Owner',
    industry: 'Food & Beverage',
    city: 'San Jose',
    rev_driver: 'Wholesale + café coffee sales; online DTC subscriptions',
    current_constraint: 'Scaling production while maintaining roast quality and equipment uptime',
    assets: 'Award-winning roastery, strong brand, retail + wholesale footprint, DIY engineering culture',
    needs: 'B2B lead gen to Bay Area offices, ops automation (maintenance scheduling, inventory), loyalty program tuning',
    fun_fact: 'Part of the team behind one of Silicon Valley\'s best-known indie roasters since 2012',
    email: 'info@chromaticcoffee.com'
  },
  {
    member_id: 'member-local-002',
    name: 'Frank Nguyen',
    org: 'Academic Coffee',
    role: 'Owner',
    industry: 'Food & Beverage',
    city: 'San Jose',
    rev_driver: 'Cafe beverage + pastry sales; community events',
    current_constraint: 'Staffing/retention and cost control on premium ingredients',
    assets: 'Downtown SJ foot traffic, barista talent, distinct brand aesthetic',
    needs: 'Menu engineering analytics, local SEO, event partnerships (tech meetups, art nights)',
    fun_fact: 'Neighborhood coffee hub known for careful brewing and seasonal drinks',
    email: 'hello@academiccoffeesj.com'
  },
  {
    member_id: 'member-local-003',
    name: 'Brian Edwards',
    org: 'Hapa\'s Brewing Company',
    role: 'Co-Founder & Head Brewer',
    industry: 'Brewery',
    city: 'San Jose',
    rev_driver: 'Taproom sales, distribution to local accounts, events',
    current_constraint: 'Multi-site scheduling and production planning across taprooms',
    assets: 'Strong community following, diverse beer portfolio, founders\' media story',
    needs: 'CRM for club memberships, demand forecasting, food-truck & event optimization',
    fun_fact: 'Started homebrewing in 2007; opened the San Jose flagship in 2017',
    email: 'info@hapasbrewing.com'
  },

  // ========= MODESTO, CA =========
  {
    member_id: 'member-local-004',
    name: 'Brian Fiscalini',
    org: 'Fiscalini Farmstead Cheese',
    role: 'CEO',
    industry: 'Food Production',
    city: 'Modesto',
    rev_driver: 'Dairy + award-winning farmstead cheese sales; onsite shop + wholesale',
    current_constraint: 'National DTC growth while preserving farmstead identity and quality',
    assets: 'Vertically integrated dairy/plant, sustainability leadership (methane digester), heritage brand',
    needs: 'Channel expansion (specialty retail), DTC lifecycle marketing, culinary partnerships',
    fun_fact: 'Fourth-generation family operation powering the farm and neighbors with renewable energy',
    email: 'BrianFiscalini@fiscalinicheese.com'
  },
  {
    member_id: 'member-local-005',
    name: 'Ruhi Sheikh',
    org: 'Queen Bean Coffee & Social House',
    role: 'Co-Owner',
    industry: 'Food & Beverage',
    city: 'Modesto',
    rev_driver: 'Cafe sales, catering, community events',
    current_constraint: 'Modernizing ops and digital presence after ownership transition',
    assets: 'Beloved historic location with loyal community base',
    needs: 'Brand refresh assets, online ordering + loyalty, event marketing calendar',
    fun_fact: 'Preserved a downtown Modesto landmark coffee house through new ownership',
    email: 'hello@queenbeancoffee.co'
  },
  {
    member_id: 'member-local-006',
    name: 'Damon Robbins',
    org: 'Camp 4 Wine Café',
    role: 'Owner',
    industry: 'Restaurant',
    city: 'Modesto',
    rev_driver: 'Wine bar, panini/charcuterie, private events',
    current_constraint: 'Event pipeline forecasting and reservation management',
    assets: 'Food Network feature, strong wine curation, Yosemite Camp 4 heritage story',
    needs: 'Email marketing + ticketed events, menu & cost analytics, local PR',
    fun_fact: 'Named for Yosemite\'s Camp 4; opened in former Royal Robbins building',
    email: 'info@camp4wine.com'
  },

  // ========= MANKATO, MN =========
  {
    member_id: 'member-local-007',
    name: 'Dr. Tom Pooley',
    org: 'River Valley Dental of Mankato',
    role: 'Owner / President',
    industry: 'Healthcare',
    city: 'Mankato',
    rev_driver: 'Dental services; family & cosmetic dentistry',
    current_constraint: 'Balancing chair utilization with patient experience and staffing',
    assets: 'Established practice, multiple doctors/hygienists, strong reputation',
    needs: 'Automated reminders/recall, referral tracking, website UX/SEO tune-up',
    fun_fact: 'Longstanding local practice serving greater Mankato families',
    email: 'rvd@rvdofmankato.com'
  },
  {
    member_id: 'member-local-008',
    name: 'Tori Hagen',
    org: 'Kato Roofing, Inc.',
    role: 'CEO & Majority Owner',
    industry: 'Construction',
    city: 'Mankato',
    rev_driver: 'Commercial roofing projects; service/maintenance contracts',
    current_constraint: 'Bid competitiveness vs. margins amid materials volatility',
    assets: 'Union crew capacity, safety culture, regional name recognition',
    needs: 'Bid analytics, pipeline CRM, client education content on roof life-cycle',
    fun_fact: 'Family-founded firm now led by next-generation ownership',
    email: 'info@katoroofing.com'
  },
  {
    member_id: 'member-local-009',
    name: 'Jim Downs',
    org: 'Pagliai\'s Pizza (Mankato)',
    role: 'Owner',
    industry: 'Restaurant',
    city: 'Mankato',
    rev_driver: 'Dine-in & takeout pizza sales; local brand loyalty',
    current_constraint: 'Throughput at peaks and staffing for late hours',
    assets: 'Oldest pizzeria in town; thin-crust specialty; open kitchen',
    needs: 'Menu mix optimization, online ordering UX, loyalty/punch-card modernization',
    fun_fact: 'Serving Mankato pizza lovers since 1969',
    email: 'info@pagliaismankato.com'
  },
  {
    member_id: 'member-local-010',
    name: 'Anne Frentz',
    org: 'Tandem Bagels',
    role: 'Co-Owner',
    industry: 'Restaurant',
    city: 'Mankato',
    rev_driver: 'Bagel, sandwich, coffee sales; wholesale to local orgs',
    current_constraint: 'Labor scheduling across bake line and front of house',
    assets: 'Local brand equity, founders with prior bagel success, community ties',
    needs: 'Catering program relaunch, social content calendar, wholesale expansion',
    fun_fact: 'Co-founded Tandem; known for scratch-made bagels and a community vibe',
    email: 'info@tandembagels.com'
  },

  // ========= CONTROL GROUP =========
  {
    member_id: 'member-control-001',
    name: 'Shawn Wenner',
    org: 'Empire Pipe Services',
    role: 'Owner',
    industry: 'Utilities / Sewer Services',
    city: 'Mankato',
    rev_driver: 'Municipal sewer maintenance & rehab contracts',
    current_constraint: 'Crew utilization and winning regional bids',
    assets: 'Specialized equipment fleet, municipal relationships',
    needs: 'Bid support analytics, outreach to nearby towns, safety/training collateral',
    fun_fact: 'Listed contact for Empire Pipe on industry association directory',
    email: 'swenner@empire-pipe.com'
  },
  {
    member_id: 'member-control-002',
    name: 'Mark Kaler',
    org: 'Municipal Pipe Tool Company',
    role: 'Owner',
    industry: 'Utilities / CIPP',
    city: 'Hudson (serves MN/IA/SD/ND)',
    rev_driver: 'CIPP lining, cleaning/TV, equipment sales to municipalities',
    current_constraint: 'Scaling multi-state crews and equipment scheduling',
    assets: '50+ years track record, Midwest footprint, experienced PM team',
    needs: 'Territory marketing in MN/ND/SD, case studies, bid library build-out',
    fun_fact: 'Purchased the company in 2007; COO Sharon Waschkat leads operations',
    email: 'info@munipipe.com'
  },
  {
    member_id: 'member-control-003',
    name: 'Huelon "Herk" Usrey',
    org: 'Herk\'s Plumbing',
    role: 'Owner',
    industry: 'Plumbing',
    city: 'Modesto',
    rev_driver: 'Residential & light commercial plumbing service calls',
    current_constraint: 'Inbound lead variability and dispatcher scheduling efficiency',
    assets: 'Owner-operator reputation, fast response, local word-of-mouth',
    needs: 'Local SEO (GMB), call-script & routing, service plan memberships',
    fun_fact: 'Longtime Modesto plumbing business with strong local reviews',
    email: 'contact@herksplumbing.com'
  },
  {
    member_id: 'member-control-004',
    name: 'Glen Gilbert',
    org: 'Able Underground Construction',
    role: 'President',
    industry: 'Construction',
    city: 'San Jose',
    rev_driver: 'Underground utilities construction & repair',
    current_constraint: 'Backlog balancing and safety/compliance documentation workload',
    assets: 'Experienced crews, trenchless capabilities, municipal clients',
    needs: 'Bid templates, safety doc automation, field photo/QC workflows',
    fun_fact: 'Listed as President of Able Underground Construction in corporate records',
    email: 'info@ablesewer.com'
  }
];

async function loadLocalBusinessData() {
  console.log('🗄️  Loading LOCAL BUSINESS DATA into Neon PostgreSQL...\n');

  try {
    // Clear existing data
    console.log('🧹 Clearing existing test data...');
    await pool.query('DELETE FROM intros');
    await pool.query('DELETE FROM vectors');
    await pool.query('DELETE FROM members');
    console.log('✅ Cleared\n');

    // Insert local businesses
    console.log('📝 Inserting local businesses...');
    let count = 0;

    for (const business of localBusinesses) {
      await pool.query(`
        INSERT INTO members (
          member_id, name, email, org, role, industry, city,
          assets, needs, rev_driver, current_constraint, fun_fact, consent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        business.member_id,
        business.name,
        business.email,
        business.org,
        business.role,
        business.industry,
        business.city,
        business.assets,
        business.needs,
        business.rev_driver,
        business.current_constraint,
        business.fun_fact,
        true
      ]);

      count++;
      console.log(`   ${count}. ${business.name} (${business.org}) - ${business.city}`);
    }

    console.log(`\n✅ Successfully loaded ${count} local businesses\n`);

    // Display summary
    console.log('📊 Local Business Data Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const industries = {};
    const cities = {};
    localBusinesses.forEach(b => {
      industries[b.industry] = (industries[b.industry] || 0) + 1;
      cities[b.city] = (cities[b.city] || 0) + 1;
    });

    console.log('\nIndustries represented:');
    Object.entries(industries).forEach(([industry, count]) => {
      console.log(`   ${industry}: ${count}`);
    });

    console.log('\nCities represented:');
    Object.entries(cities).forEach(([city, count]) => {
      console.log(`   ${city}: ${count}`);
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🚀 Ready to test NEXUS Production with YOUR data!');
    console.log('\nNext steps:');
    console.log('1. Go to admin panel: https://your-app.onrender.com/admin.html');
    console.log('2. Login (admin/admin)');
    console.log('3. Click "Generate All Embeddings"');
    console.log('4. View any dashboard, e.g.: https://your-app.onrender.com/matches.html?id=member-local-001');
    console.log('5. Generate Top 3 or Brainstorm matches');
    console.log('\n✨ NEXUS Production will analyze matches 10-20x faster with V2 rich output!\n');

  } catch (error) {
    console.error('❌ Error loading local business data:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  loadLocalBusinessData()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { loadLocalBusinessData, localBusinesses };
