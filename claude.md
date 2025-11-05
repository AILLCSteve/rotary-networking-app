# CLAUDE.md — Pragmatic Engineering + NEXUS V3.5 Ideology

This replaces the previous `claude.md.md`. It preserves core principles (SOLID, DRY, KISS/YAGNI, Clean Code, DDD, Testing) and **adds** architecture practices for **multi‑agent AI systems** like NEXUS V3.5.

---

## 1) North Stars

- **Clarity over cleverness.** Code is read more than it’s written.  
- **Accuracy before speed.** Then optimize latency without sacrificing truth.  
- **Small surfaces, strong contracts.** Types and schemas are your safety rails.  
- **Observable from day 1.** If we can’t see it, we can’t fix it.

---

## 2) Core Codecraft (recap)

- **SOLID**: SRP, OCP, LSP, ISP, DIP. Keep modules cohesive and extendable.  
- **DRY / KISS / YAGNI**: Remove duplication, prefer simple designs, avoid speculative features.  
- **Clean Code & Tests**: Short functions, expressive names, tests are FIRST (Fast, Independent, Repeatable, Self‑validating, Timely).  
- **DDD**: Ubiquitous language, rich domain model, bounded contexts.

> Tip: Comments explain **why**, not what. Favor intention‑revealing names.

---

## 3) The NEXUS V3.5 Ideology (for AI‑Driven Systems)

1) **Stratified Mixture‑of‑Experts (SMoE)**: Many micro‑agents, only the right subset runs.  
2) **Streaming MapReduce**: Map (agents) → Reduce (dimension aggregators) → Adjudicate → Score.  
3) **Deterministic shells over nondeterministic cores**: Pure wrappers control prompts, seeds, budgets, and timeouts.  
4) **Evidence‑first outputs**: Every claim bears a source, link, or calculation.  
5) **Feedback tight‑loop**: Online learning updates routing and weights safely.

**Design guardrails:**
- Same input/output schema for all agents.  
- Time‑boxed, token‑bounded calls with retries + jitter.  
- Partial results stream; UI never stalls.  
- Telemetry mandatory: traces, logs, and metrics per layer.

---

## 4) Five Advanced Engineering Practices (NEW)

### A. Determinism & Idempotency
- **Deterministic orchestration** (sorted keys, fixed seeds, stable prompts).  
- **Idempotent endpoints** keyed by request‑ID; safe to retry.  
- **Why**: Reproducible incidents, safe replays, reliable cache hits.
- **Checklist**: fixed prompt templates; versioned schemas; pure functions at layer edges.

### B. Resilience Patterns
- **Timeouts** (per layer), **circuit breakers** (per provider), **retries with jitter**, **hedged requests** for tail‑latency, **bulkheads** to isolate failures.  
- **Do**: `Promise.race(timeout)`, abort controllers, p-limit.  
- **Don’t**: Infinite retries; unbounded parallelism.

### C. Observability‑First
- **OpenTelemetry** traces per request.  
- **Structured logs** with `traceId`, `layer`, `agent`, `duration`, `tokens`.  
- **Metrics**: p50/p90 latency, error rate, token cost, agent win‑rate.  
- **Dashboards**: Red/Yellow/Green SLOs.

### D. Performance Engineering
- **Multilevel caching** (embeddings ∞, snippets 30–60m, agent outputs 10m).  
- **Gating & Early‑Exit** to keep expected active agents small.  
- **Streaming UX**: first content in <1s; steady updates after.  
- **Load‑shedding** under pressure; backpressure on queues.

### E. Security & Secrets
- **Least privilege** DB roles; **parameterized SQL**.  
- **Secret management** via environment or vault; **no secrets in logs**.  
- **Input validation/sanitization** for prompts and web results.  
- **Audit trails** on admin actions.

---

## 5) Code Patterns You Should Reach For

**Typed contracts** (TS types/schemas) → **Pure functions** per layer → **Adapters** for side‑effects (web, DB).  
**p-limit** for concurrency, **AbortController** for timeouts, **Promise.allSettled** for partial success.

```ts
// Example skeleton
const limit = pLimit(8);
const withTimeout = (p, ms) => Promise.race([p, sleep(ms).then(()=>{throw new Error('timeout')})]);

async function runAgent(agent, input) {
  return withTimeout(limit(() => agent.exec(input)), agent.budget.ms);
}
```

---

## 6) Testing Strategy

- **Characterization tests** around legacy behavior.  
- **Golden files** for prompts/responses (mask tokens; fixtures).  
- **Contract tests** for agent schemas (Zod/TypeBox).  
- **Load tests** for p95 across layers with synthetic pairs.  
- **Chaos tests**: kill provider, flip circuit breaker, validate graceful degradation.

---

## 7) Documentation that Stays Fresh

- **ADRs** for architectural decisions and trade‑offs.  
- **Runbooks** for incidents (timeouts, API quota, cold starts).  
- **Prompt registry** with versions and diff history.  
- **Dashboards** linked from README; SLOs documented.

---

## 8) Ready‑to‑Paste Prompts (Examples)

- **Agent Persona Prefix (Innovation/Collab)**  
  “You evaluate **non‑obvious partnerships** between two businesses. Return 3 concrete collaboration avenues with **sources** and **risk notes**. Output strictly in the AgentOutput schema.”

- **Quality Controller (L4)**  
  “Given agent outputs + sources, remove claims lacking evidence, normalize numbers, and emit per‑statement confidence in 0–1.”

- **Synthesis (L3/L4)**  
  “Combine dimension scores using **trimmed confidence‑weighted mean**; produce short narrative explaining *why* the top 3 factors drove the score.”

---

## 9) Operational SLOs

- **Correctness:** <2% unsupported claims.  
- **Latency:** p50 < 2.5 min, p90 < 3.5 min per match.  
- **Stability:** 99.9% successful generation during events.  
- **Cost:** Token budget per match bounded; alarms if exceeded.

---

## 10) One‑Page Checklist (ship room)

- [ ] Types & schemas committed, versioned  
- [ ] Timeouts, retries, breakers configured  
- [ ] Caches & keys set (L0–L3)  
- [ ] Prompts in registry; hashed  
- [ ] Traces, logs, metrics visible  
- [ ] Golden tests pass; load p95 green  
- [ ] Runbook links in README  
- [ ] Security: secrets, SQL params, admin creds rotated
```