-- Test data for Rotary Networking App
-- Mock entries using well-known business people
-- Run this in Neon SQL Editor to populate test data

INSERT INTO members (member_id, name, org, role, industry, city, rev_driver, current_constraint, assets, needs, fun_fact, email, consent) VALUES

-- Tech Entrepreneurs
('member-test-001', 'Elon Musk', 'Tesla & SpaceX', 'CEO', 'Technology', 'Austin',
'Electric vehicle sales and space launch services',
'Need marketing expertise to improve brand perception and customer experience',
'Engineering innovation, manufacturing at scale, AI/autonomous systems, battery technology, rocket science',
'Public relations, brand management, customer service consulting, reputation management',
'Founded multiple billion-dollar companies including PayPal, Tesla, SpaceX, and Neuralink',
'elon@tesla.com', true),

('member-test-002', 'Mark Zuckerberg', 'Meta', 'CEO & Founder', 'Technology', 'San Francisco',
'Advertising revenue from social media platforms and VR hardware sales',
'Navigating regulatory challenges and need legal expertise for global operations',
'Social media platforms, AI research, VR/AR technology, massive user data, advertising algorithms',
'Legal counsel, regulatory compliance, government relations, crisis management',
'Built Facebook in a Harvard dorm room and grew it to 3 billion users',
'mark@meta.com', true),

-- Marketing & Media
('member-test-003', 'Gary Vaynerchuk', 'VaynerMedia', 'CEO & Chairman', 'Digital Marketing', 'New York',
'Social media marketing services and brand consulting',
'Need enterprise software solutions and automation to scale operations',
'Social media strategy, content creation, brand building, influencer marketing, video production',
'AI automation tools, CRM systems, enterprise software, workflow optimization',
'Built Wine Library from $3M to $60M in 5 years using YouTube',
'gary@vaynermedia.com', true),

('member-test-004', 'Oprah Winfrey', 'OWN Network', 'Founder & CEO', 'Media', 'Los Angeles',
'TV network revenue, production deals, and personal brand partnerships',
'Expanding digital presence and streaming capabilities',
'Media production, personal branding, audience engagement, storytelling, philanthropy network',
'Streaming technology, digital platform development, tech infrastructure, app development',
'First Black female billionaire and most influential woman in media history',
'oprah@own.tv', true),

-- E-commerce & Retail
('member-test-005', 'Jeff Bezos', 'Amazon', 'Founder & Chairman', 'E-commerce', 'Seattle',
'E-commerce sales, AWS cloud services, and subscription revenue',
'Looking to expand into new markets and need local business connections',
'Cloud infrastructure, logistics, e-commerce platform, AI, massive distribution network',
'Local market expertise, real estate opportunities, regional partnerships, community connections',
'Started Amazon in a garage and built it into a $1.5 trillion company',
'jeff@amazon.com', true),

('member-test-006', 'Sara Blakely', 'Spanx', 'Founder & CEO', 'Consumer Products', 'Atlanta',
'Direct-to-consumer apparel sales and retail partnerships',
'Need digital marketing and e-commerce optimization to compete online',
'Product innovation, retail distribution, brand recognition, manufacturing partnerships',
'E-commerce platform development, digital advertising, social media marketing, influencer strategy',
'Started Spanx with $5,000 and became youngest self-made female billionaire',
'sara@spanx.com', true),

-- Real Estate & Finance
('member-test-007', 'Barbara Corcoran', 'The Corcoran Group', 'Founder & Shark Tank Investor', 'Real Estate', 'New York',
'Real estate investments and Shark Tank portfolio companies',
'Looking for tech startups that solve real estate problems',
'Investment capital, real estate expertise, media platform, business mentorship, deal negotiation',
'PropTech solutions, property management software, smart building technology, CRM systems',
'Turned $1,000 loan into $66M real estate empire',
'barbara@barbaracorcoran.com', true),

('member-test-008', 'Kevin O''Leary', 'O''Leary Funds', 'Chairman', 'Finance', 'Boston',
'Investment fund management and business acquisitions',
'Seeking high-growth SaaS and fintech companies for investment',
'Investment capital, financial expertise, business valuation, exit strategies, media presence',
'SaaS startups, fintech innovations, scalable business models, tech entrepreneurs',
'Sold The Learning Company to Mattel for $4.2 billion',
'kevin@olearyventures.com', true),

-- Fashion & Consumer Brands
('member-test-009', 'Daymond John', 'FUBU & The Shark Group', 'Founder & CEO', 'Fashion', 'New York',
'Brand consulting, licensing deals, and speaking engagements',
'Need manufacturing and supply chain partners to scale portfolio companies',
'Brand development, licensing, celebrity endorsements, retail connections, marketing strategies',
'Manufacturing partners, supply chain optimization, logistics, distribution networks',
'Started FUBU in his mother house with a $40 budget',
'daymond@thesharkgroup.com', true),

-- Beauty & Wellness
('member-test-010', 'Alli Webb', 'Drybar', 'Co-Founder', 'Beauty', 'Los Angeles',
'Blowout services, product sales, and franchise operations',
'Modernizing booking systems and need tech solutions for customer experience',
'Franchise expertise, brand loyalty, customer experience design, retail product development',
'Booking software, CRM systems, mobile app development, payment processing, automation',
'Grew Drybar to 100+ locations in 8 years with no outside funding',
'alli@thedrybar.com', true),

-- Professional Services
('member-test-011', 'Neil Patel', 'NP Digital', 'Co-Founder', 'Digital Marketing', 'Seattle',
'SEO consulting, content marketing, and SaaS marketing tools',
'Looking for strategic technology partnerships and AI capabilities',
'SEO expertise, content strategy, data analytics, conversion optimization, marketing automation',
'AI/ML development, proprietary technology, software engineering, cloud infrastructure',
'Named top 10 marketer by Forbes and advises Amazon and Google',
'neil@neilpatel.com', true),

-- Food & Hospitality
('member-test-012', 'Guy Fieri', 'Guy Fieri Restaurant Group', 'Owner & TV Host', 'Food & Hospitality', 'Los Angeles',
'Restaurant revenue, TV production deals, and brand licensing',
'Need better online ordering systems and delivery technology',
'Restaurant operations, food concepts, TV presence, brand recognition, event catering',
'Online ordering platforms, delivery tech, restaurant management software, mobile apps',
'Host of Food Network shows and operates 70+ restaurants worldwide',
'guy@guyfieri.com', true),

-- Technology & Innovation
('member-test-013', 'Whitney Wolfe Herd', 'Bumble', 'Founder & CEO', 'Technology', 'Austin',
'Premium subscriptions and in-app purchases',
'Expanding into B2B networking space and need enterprise connections',
'Mobile app development, user growth strategies, community building, women-focused marketing',
'B2B partnerships, enterprise clients, corporate networking solutions, strategic alliances',
'Became youngest woman to take a company public at age 31',
'whitney@bumble.com', true),

-- Business Consulting
('member-test-014', 'Marcus Lemonis', 'Camping World & The Profit', 'CEO', 'Retail & Consulting', 'Chicago',
'RV sales and business turnaround consulting',
'Looking for struggling businesses with potential for turnaround investment',
'Business turnaround expertise, retail operations, supply chain management, capital investment',
'Deal sourcing, financial analysis, business valuation, investment opportunities',
'Turned around 100+ businesses on The Profit TV show',
'marcus@marcuslemonis.com', true),

-- Online Education
('member-test-015', 'Marie Forleo', 'Marie Forleo International', 'Founder & CEO', 'Online Education', 'New York',
'Online course sales and coaching programs',
'Need scalable tech infrastructure for global course delivery',
'Content creation, video production, community engagement, email marketing, personal branding',
'Learning management systems, video streaming, payment processing, cloud infrastructure, automation',
'B-School online program has generated over $100M in revenue',
'marie@marieforleo.com', true);

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Test data inserted successfully!';
  RAISE NOTICE '15 well-known business people added to the database';
  RAISE NOTICE 'You can now test AI matching and introductions';
END $$;
