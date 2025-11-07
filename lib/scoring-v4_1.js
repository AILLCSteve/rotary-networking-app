// lib/scoring-v4_1.js
// V4.1 Scoring Module - Bulletproof scoring with comprehensive logging and validation

const fs = require('fs');
const path = require('path');
const { clamp, safeZ, assertValidScore, isValidScore } = require('./safety');

const MODEL_PATH = path.join(process.cwd(), 'models', 'glm-v1.json');

function loadModel(){
  const raw = fs.readFileSync(MODEL_PATH, 'utf8');
  return JSON.parse(raw);
}

function standardize(features, stats){
  const z = {};
  for (const [k, v] of Object.entries(features)) {
    if (stats[k]) {
      z[k] = safeZ(v, stats[k].mean, stats[k].std, 0);
    }
  }
  return z;
}

function logistic(x){
  return 1 / (1 + Math.exp(-x));
}

function glmScore(pairFeatures, opts={}){
  const model = loadModel();
  const beta = model.coefficients || {};
  const nonlin = model.nonlinear || {};
  const stats = model.feature_stats || {};

  console.log('[glmScore] Input features:', pairFeatures);

  const z = standardize(pairFeatures, stats);
  console.log('[glmScore] Z-scores:', z);

  // Linear predictor with step-by-step logging
  let eta = beta.intercept || 0;
  console.log(`[glmScore] eta = ${eta} (intercept)`);

  for (const [k, coef] of Object.entries(beta)) {
    if (k === 'intercept') continue;
    if (z[k] !== undefined) {
      const term = coef * z[k];
      eta += term;
      console.log(`  + ${k}: ${coef} * ${z[k]} = ${term} → eta=${eta}`);
      if (!isFinite(eta)) {
        throw new Error(`eta became non-finite after ${k}`);
      }
    }
  }

  // Non-linear terms
  if (z.cos_sim !== undefined && nonlin.cos_sim_sq) {
    const t = nonlin.cos_sim_sq * Math.pow(z.cos_sim, 2);
    eta += t;
    console.log(`  + cos_sim_sq: ${t} → eta=${eta}`);
  }
  if (z.need_asset_bidirectional !== undefined && nonlin.need_asset_bidirectional_sq) {
    const t = nonlin.need_asset_bidirectional_sq * Math.pow(z.need_asset_bidirectional, 2);
    eta += t;
    console.log(`  + need_asset_bidirectional_sq: ${t} → eta=${eta}`);
  }

  // Probability and calibrated probability
  const p = logistic(eta);
  const a = model.platt_calibration?.a ?? 1.0;
  const b = model.platt_calibration?.b ?? 0.0;
  const boundedP = Math.max(0.01, Math.min(0.99, p));
  const logit = (q) => Math.log(q / (1 - q));
  const p_cal = logistic(a * logit(boundedP) + b);

  // Base score and validate
  const S_base = 100 * p_cal;
  const baseScore = assertValidScore(S_base, 'GLM S_base');

  return {
    eta,
    p,
    p_cal,
    S_base: baseScore,
    explain: { z, beta, nonlin }
  };
}

function extractPairFeatures(m1, m2, similarity){
  const features = {};
  features.cos_sim = similarity || 0;

  // Industry same
  const ind1 = (m1.industry || '').toLowerCase();
  const ind2 = (m2.industry || '').toLowerCase();
  features.ind_same = (ind1 && ind1 === ind2) ? 1 : 0;

  // Geography same city
  const city1 = (m1.city || '').trim().toLowerCase();
  const city2 = (m2.city || '').trim().toLowerCase();
  features.geo_same_city = (city1 && city1 === city2) ? 1 : 0;

  // Business model pairs
  const rv1 = (m1.rev_driver || '').toLowerCase();
  const rv2 = (m2.rev_driver || '').toLowerCase();
  const isB2B1 = /b2b|enterprise|saas|consult|agency/.test(rv1);
  const isB2B2 = /b2b|enterprise|saas|consult|agency/.test(rv2);
  const isB2C1 = /retail|consumer|ecommerce|subscription/.test(rv1);
  const isB2C2 = /retail|consumer|ecommerce|subscription/.test(rv2);
  features.b2b_pair = (isB2B1 && isB2B2) ? 1 : 0;
  features.b2c_pair = (isB2C1 && isB2C2) ? 1 : 0;

  // Need-asset matching
  const needs1 = (m1.needs||'').split(',').map(s=>s.trim()).filter(Boolean);
  const needs2 = (m2.needs||'').split(',').map(s=>s.trim()).filter(Boolean);
  const assets1 = (m1.assets||'').split(',').map(s=>s.trim()).filter(Boolean);
  const assets2 = (m2.assets||'').split(',').map(s=>s.trim()).filter(Boolean);

  const matchCount = (A, B) => A.reduce((acc,a) =>
    acc + (B.some(b => a.toLowerCase().includes(b.toLowerCase()) ||
                       b.toLowerCase().includes(a.toLowerCase())) ? 1 : 0), 0);

  const m12 = matchCount(assets1, needs2);
  const m21 = matchCount(assets2, needs1);
  features.need_asset_bidirectional = Math.min(1, (m12>0 && m21>0) ? (m12+m21)/6 : 0);
  features.need_asset_unidirectional = Math.min(1, (m12+m21)/6);

  // Constraint overlap
  const c1 = (m1.current_constraint || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const c2 = (m2.current_constraint || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
  if (c1.length && c2.length) {
    const inter = c1.filter(w => c2.includes(w)).length;
    const uni = new Set([...c1, ...c2]).size;
    features.constraint_overlap = uni > 0 ? inter / uni : 0;
  } else {
    features.constraint_overlap = 0;
  }

  // Seniority pair
  const mapRole = r => /(founder|owner|ceo)/i.test(r||'') ? 1.0 :
                        /(director|vp|head)/i.test(r||'') ? 0.7 : 0.4;
  features.seniority_pair = (mapRole(m1.role) + mapRole(m2.role)) / 2;

  // Communication style affinity
  const text1 = `${m1.rev_driver||''} ${m1.current_constraint||''} ${m1.fun_fact||''}`.toLowerCase();
  const text2 = `${m2.rev_driver||''} ${m2.current_constraint||''} ${m2.fun_fact||''}`.toLowerCase();
  const reFormal = /professional|corporate|enterprise|strategic|executive|official/g;
  const f1 = (text1.match(reFormal) || []).length;
  const f2 = (text2.match(reFormal) || []).length;
  const formalDiff = Math.abs(f1 - f2);
  features.comm_style_affinity = 1 - Math.min(formalDiff, 1);

  // Final sanity check: no undefined or non-finite
  Object.entries(features).forEach(([k,v])=>{
    if (!isFinite(v)) {
      throw new Error(`Feature ${k} not finite: ${v}`);
    }
  });

  return features;
}

function scorePair(m1, m2, similarity){
  const { eta, p, p_cal, S_base, explain } = glmScore(extractPairFeatures(m1, m2, similarity));

  // V4.1 provides base score; production engine may apply uniqueness/consensus later
  return {
    S_base,
    final_score: S_base,
    variance: {
      model_ci95: [Math.max(0, S_base - 6), Math.min(100, S_base + 6)]
    },
    explain
  };
}

module.exports = {
  scorePair,
  extractPairFeatures,
  glmScore,
  loadModel
};
