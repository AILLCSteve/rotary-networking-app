// ============================================================================
// LOAD TEST DATA - Populate database with local business test data
// ============================================================================

const db = require('./db');

const testBusinesses = [
  {
    name: 'Sarah Martinez',
    email: 'sarah@techstart.local',
    org: 'TechStart Solutions',
    role: 'CEO & Founder',
    industry: 'Technology',
    city: 'San Francisco',
    assets: 'Software development, Cloud infrastructure, AI/ML expertise',
    needs: 'Marketing partnerships, Sales channels, Enterprise clients',
    rev_driver: 'SaaS subscriptions',
    current_constraint: 'Limited marketing budget',
    fun_fact: 'Built first app at age 14'
  },
  {
    name: 'Michael Chen',
    email: 'michael@greenleaf.local',
    org: 'GreenLeaf Consulting',
    role: 'Managing Partner',
    industry: 'Environmental Services',
    city: 'Portland',
    assets: 'Sustainability audits, Green certifications, Corporate training',
    needs: 'Tech solutions for reporting, Client referrals, Industry partnerships',
    rev_driver: 'Consulting fees',
    current_constraint: 'Manual data collection processes',
    fun_fact: 'Climbed Mount Kilimanjaro last year'
  },
  {
    name: 'Jennifer Wu',
    email: 'jennifer@creativestudio.local',
    org: 'Creative Studio Agency',
    role: 'Creative Director',
    industry: 'Marketing & Advertising',
    city: 'Los Angeles',
    assets: 'Brand design, Content creation, Social media strategy',
    needs: 'Development partners, Data analytics, Client introductions',
    rev_driver: 'Retainer contracts',
    current_constraint: 'Need technical expertise for digital campaigns',
    fun_fact: 'Won 3 national advertising awards'
  },
  {
    name: 'David Thompson',
    email: 'david@manufacturepro.local',
    org: 'ManufacturePro Inc',
    role: 'Operations Director',
    industry: 'Manufacturing',
    city: 'Detroit',
    assets: 'Production capacity, Supply chain expertise, Quality control',
    needs: 'Automation solutions, New markets, Logistics optimization',
    rev_driver: 'Product sales',
    current_constraint: 'Aging equipment needs modernization',
    fun_fact: 'Restored a 1967 Mustang'
  },
  {
    name: 'Lisa Anderson',
    email: 'lisa@healthfirst.local',
    org: 'HealthFirst Clinic',
    role: 'Medical Director',
    industry: 'Healthcare',
    city: 'Boston',
    assets: 'Patient care, Medical expertise, Community health programs',
    needs: 'Healthcare IT systems, Patient engagement tools, Partnerships',
    rev_driver: 'Patient services',
    current_constraint: 'Legacy patient records system',
    fun_fact: 'Speaks 4 languages'
  },
  {
    name: 'Robert Garcia',
    email: 'robert@financewise.local',
    org: 'FinanceWise Advisors',
    role: 'Senior Financial Advisor',
    industry: 'Financial Services',
    city: 'New York',
    assets: 'Wealth management, Tax planning, Investment strategies',
    needs: 'Client referrals, Technology platforms, Marketing support',
    rev_driver: 'Advisory fees',
    current_constraint: 'Compliance complexity',
    fun_fact: 'Marathon runner (completed 15 marathons)'
  },
  {
    name: 'Emily Rodriguez',
    email: 'emily@legalpartners.local',
    org: 'Legal Partners LLP',
    role: 'Partner Attorney',
    industry: 'Legal Services',
    city: 'Chicago',
    assets: 'Corporate law, Contract negotiation, IP protection',
    needs: 'Business referrals, Legal tech solutions, Industry connections',
    rev_driver: 'Billable hours',
    current_constraint: 'Document management inefficiencies',
    fun_fact: 'Published legal thriller novelist'
  },
  {
    name: 'James Park',
    email: 'james@constructbuild.local',
    org: 'ConstructBuild Corp',
    role: 'Project Manager',
    industry: 'Construction',
    city: 'Austin',
    assets: 'Commercial construction, Project management, Skilled workforce',
    needs: 'Design partnerships, Material suppliers, Smart building tech',
    rev_driver: 'Project contracts',
    current_constraint: 'Supply chain delays',
    fun_fact: 'Built tree houses as a hobby'
  },
  {
    name: 'Amanda Foster',
    email: 'amanda@edunext.local',
    org: 'EduNext Learning',
    role: 'Head of Curriculum',
    industry: 'Education',
    city: 'Seattle',
    assets: 'Curriculum design, Teacher training, E-learning platforms',
    needs: 'Technology integration, Content partnerships, Funding sources',
    rev_driver: 'Course subscriptions',
    current_constraint: 'Limited tech resources',
    fun_fact: 'Former professional dancer'
  },
  {
    name: 'Kevin Patel',
    email: 'kevin@retailexpress.local',
    org: 'RetailExpress Group',
    role: 'Store Operations Manager',
    industry: 'Retail',
    city: 'Miami',
    assets: 'Retail locations, Inventory systems, Customer service',
    needs: 'E-commerce platform, Marketing automation, Supplier connections',
    rev_driver: 'Retail sales',
    current_constraint: 'Online presence weak',
    fun_fact: 'Competitive chess player'
  },
  {
    name: 'Rachel Kim',
    email: 'rachel@foodventures.local',
    org: 'FoodVentures Catering',
    role: 'Executive Chef',
    industry: 'Food & Beverage',
    city: 'San Diego',
    assets: 'Culinary expertise, Event catering, Kitchen facilities',
    needs: 'Corporate clients, Event partnerships, Kitchen automation',
    rev_driver: 'Catering contracts',
    current_constraint: 'Seasonal demand fluctuations',
    fun_fact: 'Trained in Paris at Le Cordon Bleu'
  },
  {
    name: 'Thomas Wright',
    email: 'thomas@transportlogix.local',
    org: 'TransportLogix',
    role: 'Fleet Manager',
    industry: 'Transportation & Logistics',
    city: 'Dallas',
    assets: 'Delivery fleet, Route optimization, Warehousing',
    needs: 'Technology upgrades, New contracts, Fuel efficiency solutions',
    rev_driver: 'Delivery fees',
    current_constraint: 'Rising fuel costs',
    fun_fact: 'Cross-country motorcycle trip veteran'
  }
];

async function loadTestData() {
  console.log('🗄️  Loading test business data...\n');

  try {
    // Clear existing data
    console.log('🧹 Clearing existing test data...');
    await db.run('DELETE FROM intros');
    await db.run('DELETE FROM vectors');
    await db.run('DELETE FROM members');
    console.log('✅ Cleared\n');

    // Insert test businesses
    console.log('📝 Inserting test businesses...');
    let count = 0;

    for (const business of testBusinesses) {
      const memberId = `test-${business.email.split('@')[0]}`;

      await db.run(`
        INSERT INTO members (
          member_id, name, email, org, role, industry, city,
          assets, needs, rev_driver, current_constraint, fun_fact, consent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        memberId,
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
      console.log(`   ${count}. ${business.name} (${business.org})`);
    }

    console.log(`\n✅ Successfully loaded ${count} test businesses\n`);

    // Display summary
    console.log('📊 Test Data Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const industries = {};
    testBusinesses.forEach(b => {
      industries[b.industry] = (industries[b.industry] || 0) + 1;
    });

    console.log('\nIndustries represented:');
    Object.entries(industries).forEach(([industry, count]) => {
      console.log(`   ${industry}: ${count}`);
    });

    console.log('\nCities represented:');
    const cities = [...new Set(testBusinesses.map(b => b.city))];
    console.log(`   ${cities.join(', ')}`);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🚀 Ready to test NEXUS Production!');
    console.log('\nNext steps:');
    console.log('1. Start server: npm start');
    console.log('2. Go to admin panel: http://localhost:3000/admin.html');
    console.log('3. Login (admin/admin)');
    console.log('4. Click "Generate All Embeddings"');
    console.log('5. View any dashboard: http://localhost:3000/matches.html?id=test-sarah');
    console.log('6. Generate Top 3 or Brainstorm matches');
    console.log('\n✨ NEXUS Production will analyze matches 10-20x faster!\n');

  } catch (error) {
    console.error('❌ Error loading test data:', error);
    throw error;
  } finally {
    await db.close();
  }
}

// Run if called directly
if (require.main === module) {
  loadTestData()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { loadTestData, testBusinesses };
