// test-v4_1.js
// Basic unit tests for V4.1 scoring system

const { extractPairFeatures, glmScore } = require('./lib/scoring-v4_1');
const { isValidScore, safeZ, safeDivide } = require('./lib/safety');

console.log('🧪 Running V4.1 Unit Tests...\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.error(`❌ ${name}: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

// Test 1: Safety utilities prevent NaN/Infinity
test('safeDivide handles division by zero', () => {
  assert(safeDivide(10, 0, 999) === 999, 'Should return fallback on division by zero');
  assert(safeDivide(10, 2) === 5, 'Should return correct division');
});

test('safeZ handles zero std deviation', () => {
  assert(safeZ(10, 5, 0, 999) === 999, 'Should return fallback when std=0');
  assert(Math.abs(safeZ(10, 5, 2) - 2.5) < 0.001, 'Should compute correct z-score');
});

test('isValidScore rejects invalid scores', () => {
  assert(!isValidScore(NaN), 'Should reject NaN');
  assert(!isValidScore(Infinity), 'Should reject Infinity');
  assert(!isValidScore(-1), 'Should reject negative');
  assert(!isValidScore(101), 'Should reject > 100');
  assert(isValidScore(50), 'Should accept valid score');
  assert(isValidScore(0), 'Should accept 0');
  assert(isValidScore(100), 'Should accept 100');
});

// Test 2: Feature extraction produces finite values
test('extractPairFeatures returns all finite values', () => {
  const m1 = {
    industry: 'Technology',
    city: 'San Francisco',
    rev_driver: 'B2B SaaS',
    needs: 'funding,mentorship',
    assets: 'technology,network',
    current_constraint: 'scaling challenges',
    role: 'Founder'
  };
  const m2 = {
    industry: 'Finance',
    city: 'New York',
    rev_driver: 'B2B Enterprise',
    needs: 'technology',
    assets: 'funding,expertise',
    current_constraint: 'market expansion',
    role: 'Director'
  };

  const features = extractPairFeatures(m1, m2, 0.75);

  assert(typeof features.cos_sim === 'number' && isFinite(features.cos_sim), 'cos_sim should be finite');
  assert(typeof features.ind_same === 'number' && isFinite(features.ind_same), 'ind_same should be finite');
  assert(typeof features.b2b_pair === 'number' && isFinite(features.b2b_pair), 'b2b_pair should be finite');
  assert(typeof features.need_asset_bidirectional === 'number' && isFinite(features.need_asset_bidirectional), 'need_asset_bidirectional should be finite');

  // Check bounds
  Object.entries(features).forEach(([k, v]) => {
    assert(v >= 0 && v <= 1, `Feature ${k}=${v} should be in [0,1]`);
  });
});

// Test 3: GLM score is always in [0, 100]
test('glmScore produces score in valid range', () => {
  const m1 = {
    industry: 'Technology',
    city: 'San Francisco',
    rev_driver: 'B2B SaaS',
    needs: 'funding',
    assets: 'technology',
    current_constraint: 'scaling',
    role: 'CEO'
  };
  const m2 = {
    industry: 'Technology',
    city: 'San Francisco',
    rev_driver: 'B2B SaaS',
    needs: 'technology',
    assets: 'funding',
    current_constraint: 'scaling',
    role: 'Founder'
  };

  const features = extractPairFeatures(m1, m2, 0.8);
  const result = glmScore(features);

  assert(typeof result.S_base === 'number', 'S_base should be a number');
  assert(isFinite(result.S_base), 'S_base should be finite');
  assert(result.S_base >= 0 && result.S_base <= 100, `S_base=${result.S_base} should be in [0,100]`);
  assert(result.explain.z, 'Should include z-scores in explain');
});

// Test 4: Edge cases
test('glmScore handles zero similarity', () => {
  const m1 = { industry: 'Tech', city: 'NYC', rev_driver: 'B2B', needs: '', assets: '', current_constraint: '', role: 'CEO' };
  const m2 = { industry: 'Tech', city: 'NYC', rev_driver: 'B2B', needs: '', assets: '', current_constraint: '', role: 'CEO' };

  const features = extractPairFeatures(m1, m2, 0);
  const result = glmScore(features);

  assert(isFinite(result.S_base), 'Should handle zero similarity');
  assert(result.S_base >= 0 && result.S_base <= 100, 'Score should still be in range');
});

test('glmScore handles perfect similarity', () => {
  const m1 = { industry: 'Tech', city: 'NYC', rev_driver: 'B2B SaaS', needs: 'funding', assets: 'technology', current_constraint: 'growth', role: 'Founder' };
  const m2 = { industry: 'Tech', city: 'NYC', rev_driver: 'B2B SaaS', needs: 'technology', assets: 'funding', current_constraint: 'growth', role: 'Founder' };

  const features = extractPairFeatures(m1, m2, 1.0);
  const result = glmScore(features);

  assert(isFinite(result.S_base), 'Should handle perfect similarity');
  assert(result.S_base >= 0 && result.S_base <= 100, 'Score should still be in range');
});

// Summary
console.log(`\n${'='.repeat(50)}`);
console.log(`Tests Passed: ${passed}/${passed + failed}`);
console.log(`Tests Failed: ${failed}/${passed + failed}`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('✅ All tests passed!\n');
}
