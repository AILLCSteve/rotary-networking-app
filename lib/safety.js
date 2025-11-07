// lib/safety.js
// Defensive math utilities to prevent NaN/Infinity propagation

function clamp(x, lo=0, hi=100){
  return Math.max(lo, Math.min(hi, x));
}

function isFiniteNumber(x){
  return typeof x === 'number' && isFinite(x);
}

function safeDivide(num, den, fallback=0){
  if (!isFiniteNumber(num) || !isFiniteNumber(den) || den === 0) return fallback;
  const r = num / den;
  return isFinite(r) ? r : fallback;
}

function safeZ(value, mean, std, fallback=0){
  if (!isFiniteNumber(value) || !isFiniteNumber(mean) || !isFiniteNumber(std) || std === 0)
    return fallback;
  const z = (value - mean) / std;
  return isFinite(z) ? z : fallback;
}

function assertValidScore(score, context){
  if (typeof score !== 'number') throw new Error(`${context}: non-number`);
  if (isNaN(score)) throw new Error(`${context}: NaN`);
  if (!isFinite(score)) throw new Error(`${context}: infinite`);
  if (score < 0 || score > 100) throw new Error(`${context}: out of range [0,100]`);
  return score;
}

function isValidScore(score){
  return isFiniteNumber(score) && score >= 0 && score <= 100;
}

module.exports = {
  clamp,
  isFiniteNumber,
  safeDivide,
  safeZ,
  assertValidScore,
  isValidScore
};
