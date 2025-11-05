# NEWAIARCH — NEXUS V3.5: Stratified Mixture‑of‑Experts (SMoE) with Streaming MapReduce

**Goal:** Increase **accuracy first** and **speed second** as we scale the number of agents and layers—*without* collapsing under coordination overhead. NEXUS V3.5 generalizes V2 into a **stratified mixture‑of‑experts** with **micro‑agents**, **dynamic gating**, and **streaming MapReduce** orchestration.

---

## 0) Big Picture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                               NEXUS V3.5                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  L0: Normalize & Extract  → L1: Retrieve & Enrich → L2: Micro‑Agents (SMoE) │
│                                       ↘               ↘                     │
│  L3: Map Aggregators  →  L4: Conflict Adjudicator  →  L5: Score & Calibrate │
│           ↘                            ↘             ↘                      │
│  L6: Stream & Route  ←  L7: Caches & Telemetry  ←  L8: Feedback Learning    │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Agents increase 3+ degrees** vs V2 by:  
  1) **Breadth:** parallel **micro‑agents** per dimension (e.g., 4–8 synergy sub‑experts by industry, 3–5 risk sub‑experts by legal/brand/ops).  
  2) **Depth:** layered **map aggregators** and a **separate adjudicator** (voting + calibration).  
  3) **Routing:** **gating function** activates only the *useful* subset of agents; **hedged requests** and **early‑exit** keep latency low.

---

## 1) Data Contracts (Strongly Typed)

All agents accept/emit the same JSON schema so they can be composed arbitrarily.

```ts
// ./types.ts
export type FeatureVector = {
  // core entity features extracted in L0
  members: { aId: string; bId: string },
  industries: string[],
  geos: string[],
  revenueModels: string[],
  assetsA: string[], needsA: string[],
  assetsB: string[], needsB: string[],
  embeddings?: { a: number[]; b: number[] }, // 1536-dim (cached)
  nowISO: string,
};

export type AgentInput = {
  fv: FeatureVector,
  context: {
    webSnippets?: Array<{source:string; title:string; url:string; snippet:string; confidence:number}>,
    profiles?: any,
    cacheHints?: Record<string, string>,
  },
  budget: { ms: number; tokens: number },
};

export type AgentOutput = {
  agent: string,                         // unique name
  dims: Partial<{
    strategic_synergy: number,           // 0..100
    tactical_value: number,
    innovation_potential: number,
    risk_score: number,                  // 0..100 (higher=worse)
    network_effects: number,
    temporal_urgency: number
  }>,
  confidence: number,                    // 0..100
  evidence: Array<{type:'web'|'profile'|'calc'; ref:string; note:string; confidence:number}>,
  notes?: string,                        // brief rationale
  meta?: Record<string, any>
};
```

---

## 2) Layer Definitions

### L0 — Normalize & Extract (deterministic, fast)
- **Entity extraction** (names, roles, industries, cities).
- **Vector lookups** for embeddings from cache/DB.
- **Output:** `FeatureVector` + *entity graph seeds*.

```ts
// pseudo: normalize entities & fetch embeddings from cache
const L0_normalize = async (pair) => ({
  fv: await buildFeatureVector(pair),
  context: { profiles: await loadProfiles(pair), cacheHints: {} },
  budget: { ms: 200, tokens: 0 }
});
```

### L1 — Retrieve & Enrich (progressive RAG)
- **Progressive search tiers:** cache → curated KB → web (time‑boxed, hedged).
- **Deduplicate** and **score snippets**; attach to `context.webSnippets`.
- **Output:** `AgentInput` for downstream.

```ts
const L1_retrieve = async (input) => {
  const cached = await cache.getMany(keysFrom(input.fv));
  const kbHits = await kb.search(composeQuery(input.fv), {k:8});
  const web = await hedgedWebSearch(composeWebQueries(input.fv), 30000); // cancels slower path
  return withSnippets(input, rankAndFilter([...cached, ...kbHits, ...web]));
};
```

### L2 — Micro‑Agents (SMoE)
- **10–24 micro‑agents** total, but **gating** activates only the best **K** (typically 6–10).
- Examples: `Synergy/Agency`, `Synergy/Manufacturing`, `Risk/Legal`, `Risk/Brand`, `Network/Graph`, `Innovation/Collab`, `Geo/Locality`, `Timing/Market`, `Reranker/Embeddings`.
- Each returns partial `dims` plus `confidence` and evidence.

```ts
type GateScore = { agent: string; score: number };
const gate = (fv: FeatureVector): GateScore[] => {
  // Softmax over sparse features + prior agent success
  // score_i = α·f_i(fv) + β·priorWinRate_i + γ·(recency_i)
  // choose top‑K by expected value
};
const L2_run = async (in_:AgentInput) => {
  const chosen = gate(in_.fv).slice(0, K(in_));
  return await pLimitAll(chosen.map(runAgent), CONCURRENCY);
};
```

### L3 — Map Aggregators (dimension reducers)
- For each dimension, run a **map‑reduce**: combine outputs from its micro‑agents with **weights** and **robust stats** (trimmed mean / median).  
- Emits **dimension vectors** `D = [S, T, I, R, N, U]` and **per‑dim confidence** `Cdim`.

**Math (per dimension d):**  
Let agent scores be \( s_{d,j} \in [0,100] \), confidences \( c_{d,j}\in[0,1] \).  
Use a **trimmed, confidence‑weighted mean**:

\[
\tilde{s}_d \;=\; \frac{\sum_{j\in J_d^\tau} w_{d,j}\, s_{d,j}}{\sum_{j\in J_d^\tau} w_{d,j}},\quad
w_{d,j} = c_{d,j}^{\,\lambda},\quad J_d^\tau = \text{indices after trimming } \tau \text{ from both tails}
\]

Per‑dimension confidence:
\[
\tilde{c}_d \;=\; \min\!\left(1,\;\sqrt{\frac{1}{|J_d^\tau|}\sum_{j\in J_d^\tau} c_{d,j}^2}\right)
\]

### L4 — Conflict Adjudicator (voting + uncertainty)
Combine dimensions + disagreement structure with **Borda‑style voting** across agents and a **consensus penalty**.

- **Consensus weight:** \( W = (\bar{c})^{\rho} \) with \( \bar{c}=\frac{1}{D}\sum_d \tilde{c}_d \), \( \rho\in[1.2,2.0] \).
- **Disagreement penalty:** \( P = \exp(-\kappa \cdot \sigma_s) \) where \( \sigma_s \) = stdev of dimension means across agents.

### L5 — Score & Calibrate (entropy & Platt)
Base score (weights sum to 1):
\[
S_0 = 0.25S + 0.20T + 0.20I + 0.15(100-R) + 0.15N + 0.05U
\]
Uniqueness coefficient (entropy boost):  
\[
U_q = \min\!\Big(0.5,\; \alpha\,u + \beta\,z + \gamma\,m + \delta\,h \Big)
\]
- \(u\)=unexpected synergies count, \(z\)=unique insights, \(m\)=network multipliers, \(h\)=innovation bonus (indicator).
- Final before calibration: \( S_1 = S_0 \cdot (1 + U_q) \cdot W \cdot P \).

Optional **probability calibration** (Platt):
\[
p(\text{great}) = \sigma(a S_1 + b) = \frac{1}{1+\exp(-(a S_1 + b))}
\]
Use default \( (a,b) \) from heuristics; learn online in L8 when feedback exists.

### L6 — Stream & Route
- **Stream** partial artifacts as soon as each dimension converges (UX speed).
- **Route** results to UI panels: score card, intros, research notes, admin logs.

### L7 — Caches & Telemetry
- **Multilevel caches**: L0 embeddings (∞ TTL), L1 snippets (30–60 min TTL), L2 agent results (10 min TTL keyed by `(aId,bId,features)`), L3 reductions (5 min TTL).
- **Observability:** trace IDs, spans per layer; metrics: p50/p90 lat, token cost, agent win rates.

### L8 — Feedback Learning (safe online updates)
- Update **agent priors** and **gating** via **UCB1** bandit:  
  For agent \( i \): \(\hat{\mu}_i = \text{mean reward}\), \( n_i \)=plays, \( t \)=total plays
\[
\text{UCB}_i = \hat{\mu}_i + \sqrt{\frac{2\ln t}{n_i+1}}
\]
Use UCB to explore agents occasionally; otherwise exploit best performers.


---

## 3) Orchestrator — TypeScript‑style Pseudocode

```ts
// ./orchestrator.ts
import pLimit from "p-limit";

const LIMIT = 8; // global concurrency
const limit = pLimit(LIMIT);

export async function generateMatch(pair: {aId:string,bId:string}) {
  const l0 = await L0_normalize(pair);
  const l1 = await L1_retrieve(l0);

  // L2: choose and run micro‑agents with gating + hedged requests
  const agentResults = await runL2(l1);

  // L3: dimension reducers
  const dims = reduceDimensions(agentResults);

  // L4: adjudicate disagreement & compute consensus
  const { consensusW, penaltyP } = adjudicate(agentResults, dims);

  // L5: score + calibrate
  const scored = scoreAndCalibrate(dims, { consensusW, penaltyP });

  // L6: stream + route
  streamPartialResults(scored, agentResults);

  // L7: cache + telemetry hooks
  recordMetrics(scored, agentResults);

  // L8: update bandit stats on feedback later (async hook)
  return scored;
}

async function runL2(input: AgentInput): Promise<AgentOutput[]> {
  const plan = gate(input.fv).slice(0, K(input));          // choose micro‑agents
  const runs = plan.map(({agent}) => limit(() => runAgent(agent, input)));
  const settled = await Promise.allSettled(runs);
  return settled
    .filter(s => s.status === "fulfilled")
    .map(s => s.value as AgentOutput);
}
```

---

## 4) Hedged Requests & Early‑Exit

```ts
// Hedged web search: kick off two providers with small stagger; cancel loser.
async function hedgedWebSearch(queries: string[], timeoutMs: number) {
  const p1 = providerA.search(queries, { timeoutMs });
  await wait(120); // small hedge
  const p2 = providerB.search(queries, { timeoutMs });

  return await Promise.race([
    Promise.allSettled([p1, p2]).then(pickBest),
    timeout(timeoutMs).then(() => [])
  ]);
}

// Early exit: if S_1 already exceeds A+ threshold with high consensus, stop slow agents.
function earlyExitCheck(scoreSoFar:number, consensus:number) {
  return (scoreSoFar >= 90 && consensus >= 0.9);
}
```

---

## 5) Formal Speed Model (Why it Scales Up)

Let \(L\) be layers, each with max parallel time \(T_\ell\). Without early exits:
\[
T_{\text{total}} \approx \sum_{\ell=0}^{L} \max_{i\in \text{parallel}(\ell)} T_{\ell,i}
\]
Increasing agents **does not** add linearly if they stay in the same parallel block.
Gating reduces **expected** active agents \( \mathbb{E}[K] \), and hedging caps slow tails.
With early‑exit, expected time reduces further:
\[
\mathbb{E}[T] \;\le\; \sum_{\ell} \Big(\Pr[\neg \text{exit}_\ell]\cdot \max T_{\ell}\Big)
\]

**Net effect:** As you add agents, **accuracy increases** (more perspectives), while **latency stays bounded** by the maximum within a few parallel strata—not the sum of all agents.

---

## 6) Final Score Function (Drop‑in Code)

```ts
// ./score.ts
export function finalScore(dims:{S:number,T:number,I:number,R:number,N:number,U:number},
                           consensusW:number, penaltyP:number,
                           uniqueness:{u:number,z:number,m:number,h:boolean}) {

  const S0 = 0.25*dims.S + 0.20*dims.T + 0.20*dims.I + 0.15*(100 - dims.R)
           + 0.15*dims.N + 0.05*dims.U;

  const Uq = Math.min(0.5,
    0.05*uniqueness.u +
    0.05*uniqueness.z +
    (uniqueness.h ? 0.10 : 0) +
    0.03*uniqueness.m
  );

  const raw = S0 * (1 + Uq) * consensusW * penaltyP;
  return Math.min(100, raw);
}
```

---

## 7) Deployment Notes

- **Idempotent** endpoints with **request‑ID** for retries.
- **Timeouts** per layer (`AbortController`), **circuit breakers** per provider.
- **p-limit** to cap concurrency; **work queues** for bulk all‑pairs.
- **Multilevel caching** keys: `L2:{agent}:{aId}:{bId}:{f-hash}` etc.
- **Telemetry**: OpenTelemetry traces; custom metrics per agent (win rate, p95 latency, token usage).

---

## 8) How to Grow Even Further (V4+)

- **Knowledge Graph** builder in L1; **Graph‑aware features** for Network Effects.
- **Learned gating** (logistic/GBDT) trained on historical win rate.
- **Model ensemble** (OpenAI + Claude + local) under the same SMoE shell.
- **Calibration** via isotonic regression once enough labeled outcomes exist.
- **Sharded all‑pairs** with **vector pre‑filter** + **bipartite matching** for event‑wide optimization.

---

## 9) Minimal Integration Diff (server.js)

```js
// Old: generateMatchV2(memberA, memberB)
// New:
app.get('/api/v3.5/generate-match/:a/:b', async (req, res) => {
  const result = await orchestrator.generateMatch({ aId: req.params.a, bId: req.params.b });
  res.json(result);
});
```

**Outcome:** More agents, more layers, *less* latency growth. Accuracy climbs via diversity + calibration; speed preserved by gating, hedging, caches, and early‑exit.