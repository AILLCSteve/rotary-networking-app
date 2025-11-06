  -- Local & Control Test Data for Rotary Networking App
  -- Your original CA/MN/IA business data

  -- Clear existing data first
  DELETE FROM intros;
  DELETE FROM vectors;
  DELETE FROM members;

  -- Insert your 14 local businesses
  INSERT INTO members (
    member_id, name, org, role, industry, city,
    rev_driver, current_constraint, assets, needs, fun_fact, email, consent
  ) VALUES

  -- ========= SAN JOSE, CA =========
  ('member-local-001', 'James Warren', 'Chromatic Coffee', 'Owner', 'Food & Beverage', 'San Jose',
   'Wholesale + café coffee sales; online DTC subscriptions',
   'Scaling production while maintaining roast quality and equipment uptime',
   'Award-winning roastery, strong brand, retail + wholesale footprint, DIY engineering culture',
   'B2B lead gen to Bay Area offices, ops automation (maintenance scheduling, inventory), loyalty program tuning',
   'Part of the team behind one of Silicon Valley''s best-known indie roasters since 2012',
   'info@chromaticcoffee.com', true),

  ('member-local-002', 'Frank Nguyen', 'Academic Coffee', 'Owner', 'Food & Beverage', 'San Jose',
   'Cafe beverage + pastry sales; community events',
   'Staffing/retention and cost control on premium ingredients',
   'Downtown SJ foot traffic, barista talent, distinct brand aesthetic',
   'Menu engineering analytics, local SEO, event partnerships (tech meetups, art nights)',
   'Neighborhood coffee hub known for careful brewing and seasonal drinks',
   'hello@academiccoffeesj.com', true),

  ('member-local-003', 'Brian Edwards', 'Hapa''s Brewing Company', 'Co-Founder & Head Brewer', 'Brewery', 'San
  Jose',
   'Taproom sales, distribution to local accounts, events',
   'Multi-site scheduling and production planning across taprooms',
   'Strong community following, diverse beer portfolio, founders'' media story',
   'CRM for club memberships, demand forecasting, food-truck & event optimization',
   'Started homebrewing in 2007; opened the San Jose flagship in 2017',
   'info@hapasbrewing.com', true),

  -- ========= MODESTO, CA =========
  ('member-local-004', 'Brian Fiscalini', 'Fiscalini Farmstead Cheese', 'CEO', 'Food Production', 'Modesto',
   'Dairy + award-winning farmstead cheese sales; onsite shop + wholesale',
   'National DTC growth while preserving farmstead identity and quality',
   'Vertically integrated dairy/plant, sustainability leadership (methane digester), heritage brand',
   'Channel expansion (specialty retail), DTC lifecycle marketing, culinary partnerships',
   'Fourth-generation family operation powering the farm and neighbors with renewable energy',
   'BrianFiscalini@fiscalinicheese.com', true),

  ('member-local-005', 'Ruhi Sheikh', 'Queen Bean Coffee & Social House', 'Co-Owner', 'Food & Beverage', 'Modesto',
   'Cafe sales, catering, community events',
   'Modernizing ops and digital presence after ownership transition',
   'Beloved historic location with loyal community base',
   'Brand refresh assets, online ordering + loyalty, event marketing calendar',
   'Preserved a downtown Modesto landmark coffee house through new ownership',
   'hello@queenbeancoffee.co', true),

  ('member-local-006', 'Damon Robbins', 'Camp 4 Wine Café', 'Owner', 'Restaurant', 'Modesto',
   'Wine bar, panini/charcuterie, private events',
   'Event pipeline forecasting and reservation management',
   'Food Network feature, strong wine curation, Yosemite Camp 4 heritage story',
   'Email marketing + ticketed events, menu & cost analytics, local PR',
   'Named for Yosemite''s Camp 4; opened in former Royal Robbins building',
   'info@camp4wine.com', true),

  -- ========= MANKATO, MN =========
  ('member-local-007', 'Dr. Tom Pooley', 'River Valley Dental of Mankato', 'Owner / President', 'Healthcare',
  'Mankato',
   'Dental services; family & cosmetic dentistry',
   'Balancing chair utilization with patient experience and staffing',
   'Established practice, multiple doctors/hygienists, strong reputation',
   'Automated reminders/recall, referral tracking, website UX/SEO tune-up',
   'Longstanding local practice serving greater Mankato families',
   'rvd@rvdofmankato.com', true),

  ('member-local-008', 'Tori Hagen', 'Kato Roofing, Inc.', 'CEO & Majority Owner', 'Construction', 'Mankato',
   'Commercial roofing projects; service/maintenance contracts',
   'Bid competitiveness vs. margins amid materials volatility',
   'Union crew capacity, safety culture, regional name recognition',
   'Bid analytics, pipeline CRM, client education content on roof life-cycle',
   'Family-founded firm now led by next-generation ownership',
   'info@katoroofing.com', true),

  ('member-local-009', 'Jim Downs', 'Pagliai''s Pizza (Mankato)', 'Owner', 'Restaurant', 'Mankato',
   'Dine-in & takeout pizza sales; local brand loyalty',
   'Throughput at peaks and staffing for late hours',
   'Oldest pizzeria in town; thin-crust specialty; open kitchen',
   'Menu mix optimization, online ordering UX, loyalty/punch-card modernization',
   'Serving Mankato pizza lovers since 1969',
   'info@pagliaismankato.com', true),

  ('member-local-010', 'Anne Frentz', 'Tandem Bagels', 'Co-Owner', 'Restaurant', 'Mankato',
   'Bagel, sandwich, coffee sales; wholesale to local orgs',
   'Labor scheduling across bake line and front of house',
   'Local brand equity, founders with prior bagel success, community ties',
   'Catering program relaunch, social content calendar, wholesale expansion',
   'Co-founded Tandem; known for scratch-made bagels and a community vibe',
   'info@tandembagels.com', true),

  -- ========= CONTROL GROUP =========
  ('member-control-001', 'Shawn Wenner', 'Empire Pipe Services', 'Owner', 'Utilities / Sewer Services', 'Mankato',
   'Municipal sewer maintenance & rehab contracts',
   'Crew utilization and winning regional bids',
   'Specialized equipment fleet, municipal relationships',
   'Bid support analytics, outreach to nearby towns, safety/training collateral',
   'Listed contact for Empire Pipe on industry association directory',
   'swenner@empire-pipe.com', true),

  ('member-control-002', 'Mark Kaler', 'Municipal Pipe Tool Company', 'Owner', 'Utilities / CIPP', 'Hudson (serves
  MN/IA/SD/ND)',
   'CIPP lining, cleaning/TV, equipment sales to municipalities',
   'Scaling multi-state crews and equipment scheduling',
   '50+ years track record, Midwest footprint, experienced PM team',
   'Territory marketing in MN/ND/SD, case studies, bid library build-out',
   'Purchased the company in 2007; COO Sharon Waschkat leads operations',
   'info@munipipe.com', true),

  ('member-control-003', 'Huelon "Herk" Usrey', 'Herk''s Plumbing', 'Owner', 'Plumbing', 'Modesto',
   'Residential & light commercial plumbing service calls',
   'Inbound lead variability and dispatcher scheduling efficiency',
   'Owner-operator reputation, fast response, local word-of-mouth',
   'Local SEO (GMB), call-script & routing, service plan memberships',
   'Longtime Modesto plumbing business with strong local reviews',
   'contact@herksplumbing.com', true),

  ('member-control-004', 'Glen Gilbert', 'Able Underground Construction', 'President', 'Construction', 'San Jose',
   'Underground utilities construction & repair',
   'Backlog balancing and safety/compliance documentation workload',
   'Experienced crews, trenchless capabilities, municipal clients',
   'Bid templates, safety doc automation, field photo/QC workflows',
   'Listed as President of Able Underground Construction in corporate records',
   'info@ablesewer.com', true);
