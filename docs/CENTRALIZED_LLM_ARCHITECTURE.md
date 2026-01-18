# Centralized LLM Architecture

**Document Version:** 1.0
**Last Updated:** 2026-01-08
**Status:** ✅ Implemented

---

## Overview

Cloud Code uses a **centralized LLM supply model** where the service provides LLM access to all users, rather than requiring users to bring their own API keys. This is a deliberate architectural and business decision that differentiates us from competitors like Claude Code, Kilo, Clio, and Cursor.

### What This Means

- **Users:** No API key setup. No account creation with Anthropic/OpenAI. No billing configuration. Just sign in and code.
- **Service:** We centrally manage LLM API keys, handle rate limiting, and absorb the compute costs.
- **Architecture:** Single `ANTHROPIC_API_KEY` stored as Cloudflare Secret, shared across all user sessions.

---

## Why This Approach?

### 1. Zero Setup Friction

**Competitor approach (BYO-key):**
```
1. Sign up for service
2. Create Anthropic/OpenAI account
3. Generate API key
4. Copy-paste API key into service settings
5. Hope you didn't leak the key
6. Monitor usage separately
```

**Our approach (LLMs included):**
```
1. Sign in with GitHub
2. Start coding
```

### 2. Competitive Advantages

| Factor | BYO-Key Model | Our Model (Included) |
|--------|---------------|---------------------|
| Setup time | ~5-10 minutes | ~10 seconds |
| Friction points | 4-5 steps | 1 step |
| Support burden | API key issues | Zero key issues |
| Churn risk | High (complex setup) | Low (instant value) |
| Pricing clarity | Confusing (API + service) | Simple (free) |

### 3. Business Model Alignment

- **GitHub App model:** Users already trust us with repo access (one-click install)
- **Freemium tier:** Free usage drives adoption and repo connections
- **Enterprise path:** Later monetize through team features, not per-user LLM access

---

## Implementation

### Environment Variables

**Worker-level** (`wrangler.jsonc` Secrets):
```bash
ANTHROPIC_API_KEY=sk-ant-xxxxx  # Central key for all users
ENCRYPTION_KEY=xxx               # For GitHub credentials
```

**Container-level** (passed dynamically):
```bash
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}  # Inherited from worker
ANTHROPIC_AUTH_TOKEN=${ANTHROPIC_API_KEY}
ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic
```

### Key Locations

1. **Worker entry point** (`src/index.ts`):
   - `ANTHROPIC_API_KEY` read from env
   - Passed to containers via environment variables

2. **Container handler** (`container_src/src/main.ts`):
   - Receives API key via env vars
   - Passes to Claude Code SDK

3. **No user-facing API key UI** - intentionally omitted

---

## Cost Management

### Current Approach

- **Single central key** for all users
- **Cost absorbed** during growth/beta phase
- **Usage monitoring** via Cloudflare analytics

### Future Considerations

When scale requires cost controls, options include:

1. **Per-user rate limiting** (quotas via Durable Objects)
2. **Tiered plans** (free = X tokens/month, pro = unlimited)
3. **Caching layer** (reduce redundant LLM calls)
4. **Model routing** (use cheaper models for simple tasks)

**Important:** Even with paid tiers, we maintain the "LLMs included" model - users never manage API keys directly.

---

## Security Considerations

### Key Storage

- **Location:** Cloudflare Workers Secret (encrypted at rest)
- **Access:** Only Worker runtime can access
- **Rotation:** Manual via Cloudflare dashboard
- **Scope:** Single key shared across all sessions

### Abuse Prevention

| Threat | Mitigation |
|--------|-----------|
| Key scraping | Server-side only, never exposed to client |
| Unlimited usage | Rate limiting per session (Durable Objects) |
| Bot abuse | GitHub App authentication required |
| DoS | Cloudflare DDoS protection |

---

## Comparison to Alternatives

### Option 1: User-Provided Keys (Claude Code model)

**Pros:**
- No cost to service
- Unlimited scaling

**Cons:**
- ❌ High setup friction
- ❌ Support burden (API key issues)
- ❌ Churn during setup
- ❌ Security risk (users leak keys)

### Option 2: Hybrid (Free tier + BYO-key for power users)

**Pros:**
- Low friction for casual users
- Cost containment

**Cons:**
- ❌ Confusing pricing (when do I need a key?)
- ❌ Feature disparity between tiers
- ❌ Still need key management UI

### Option 3: Fully Centralized (Our approach) ✅

**Pros:**
- ✅ Zero setup friction
- ✅ Simple pricing ("free")
- ✅ Better UX (no key management)
- ✅ Lower support burden

**Cons:**
- Service absorbs LLM costs
- Requires cost controls at scale

---

## User Experience

### Onboarding Flow

```
┌─────────────────────────────────────────────┐
│  1. User clicks "Install GitHub App"        │
│  2. GitHub OAuth (one-click)                │
│  3. Redirected to app, authenticated        │
│  4. Can immediately start coding sessions   │
│  5. No API key step                         │
└─────────────────────────────────────────────┘
```

### Pricing Page Copy

```
┌─────────────────────────────────────────────┐
│  Cloud Code Pricing                         │
│                                             │
│  Free                                      │
│  ✓ Unlimited coding sessions               │
│  ✓ LLM access included                     │
│  ✓ No API key setup                        │
│  ✓ GitHub App integration                  │
│                                             │
│  No credit card required.                   │
│  No per-token billing.                      │
└─────────────────────────────────────────────┘
```

---

## Migration Path

If we ever need to change this model:

### To Tiered Model (No User Keys)

1. Introduce free/pro tiers
2. Free tier: X tokens/month
3. Pro tier: Unlimited tokens
4. Still no API keys - we manage everything

### To Bring-Your-Own-Key (Not Recommended)

Only if cost becomes unsustainable:
1. Add optional API key field in settings
2. Fall back to central key for users without keys
3. Maintain "LLMs included" as default experience

---

## Frequently Asked Questions

**Q: Isn't this expensive?**
A: Yes, we absorb LLM costs. But it drives adoption and reduces churn. We can monetize later via teams/enterprise features.

**Q: What about abuse?**
A: GitHub App authentication provides identity. We rate-limit per user. Cloudflare provides DDoS protection.

**Q: Can users bring their own keys?**
A: Not currently. The "LLMs included" model is a core differentiator. We may add optional BYO-key for power users later.

**Q: What happens when you run out of quota?**
A: We monitor usage and will add rate limits before hitting hard limits. Users see friendly "rate limited" messages, not errors.

**Q: Do you support other LLM providers?**
A: We use Anthropic-compatible APIs (can route to GLP, Z.ai, or direct Anthropic). Single key abstraction makes provider switching easy.

---

## References

- Architecture: `/CLAUDE.md` - Centralized API Key section
- Competition: `/docs/UX-Test-Scenario-Multi-Repo.md` - Competitive analysis
- Worker config: `wrangler.jsonc` - Environment bindings
- Container source: `container_src/src/main.ts` - Key usage

---

**Document Owner:** Product Team
**Last Review:** 2026-01-08
**Next Review:** When introducing paid tiers
