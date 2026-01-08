# Cloud Code - Product Requirements Document (PRD)

**Version:** 1.0
**Last Updated:** 2026-01-08
**Status:** ✅ MVP Live
**Product Owner:** Cloud Code Team
**Document Owner:** Product Team

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Vision & Mission](#vision--mission)
3. [Problem Statement](#problem-statement)
4. [Solution Overview](#solution-overview)
5. [Target Users](#target-users)
6. [Key Features](#key-features)
7. [Competitive Positioning](#competitive-positioning)
8. [Technical Architecture](#technical-architecture)
9. [User Experience](#user-experience)
10. [Business Model](#business-model)
11. [Go-to-Market Strategy](#go-to-market-strategy)
12. [Product Roadmap](#product-roadmap)
13. [Success Metrics](#success-metrics)
14. [Risks & Mitigations](#risks--mitigations)
15. [Appendix](#appendix)

---

## Executive Summary

**Cloud Code** is a remote-first AI coding companion that runs entirely in the cloud. Unlike traditional AI coding tools that require local installation, Cloud Code executes code in Cloudflare Containers and provides native mobile apps for iOS and Android.

**Key Differentiators:**
- ☁️ **Remote execution** - Code runs where it deploys (Cloudflare Containers)
- 📱 **Native mobile apps** - True iOS/Android apps via Expo
- 💰 **LLMs included** - No API key setup required
- 🔄 **Multi-repo processing** - Handle multiple repositories in parallel

**Current Status:** MVP is live at https://cloud-code.finhub.workers.dev with GitHub App integration, interactive sessions, and native mobile apps in development.

---

## Vision & Mission

### Vision
A world where developers can code, review, and ship from any device—anywhere, anytime—without local setup or hardware constraints.

### Mission
Democratize AI-assisted coding by providing a zero-setup, cloud-based development environment accessible from web, iOS, and Android.

### Core Values
- **Accessibility First** - No expensive hardware, no complex setup
- **Mobile-First** - Code from your phone, not just your desktop
- **Privacy by Design** - GitHub App model, user data stays in GitHub
- **Developer Experience** - Fast, reliable, fun to use

---

## Problem Statement

### The Problem

Modern AI coding tools suffer from four critical limitations:

1. **Local Execution Required**
   - Requires powerful hardware (GPU, RAM)
   - Drains battery and generates heat
   - Platform-dependent (macOS, Windows, Linux)
   - "It works on my machine" problems

2. **No Mobile Support**
   - CLI tools don't work on phones
   - IDE plugins require desktop IDEs
   - "Responsive web" is not a mobile app
   - Cannot code on-the-go

3. **Setup Friction**
   - Install Node.js, Python, or other runtimes
   - Configure git and SSH keys
   - Create API accounts and generate keys
   - 5-10 minutes before first use

4. **Per-Tool Pricing**
   - $8-20/month per tool
   - Each tool needs separate subscription
   - API key management overhead
   - Unclear total cost of ownership

### Impact

- **Developers** can't quickly fix bugs from their phones
- **Teams** waste time on environment setup
- **Businesses** pay for multiple overlapping tools
- **Mobile users** are completely excluded from AI coding

---

## Solution Overview

Cloud Code is a **remote-first AI coding platform** that:

1. **Executes code in Cloudflare Containers** - No local compute required
2. **Provides native mobile apps** - iOS and Android via Expo
3. **Supplies LLMs centrally** - No API key setup
4. **Integrates via GitHub App** - One-click repository connection

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Layer                              │
├──────────────┬──────────────┬──────────────────────────────────┤
│   Web App    │  iOS App     │         Android App              │
│  (React)     │  (Expo/RN)   │         (Expo/RN)                │
└──────┬───────┴──────┬───────┴────────────────┬─────────────────┘
       │              │                      │
       └──────────────┴──────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Worker                            │
│  ┌────────────────┬──────────────┬──────────────────────────┐  │
│  │   HTTP Router  │    GitHub    │   Interactive Session   │  │
│  │                │    Webhooks  │        Management       │  │
│  └────────────────┴──────────────┴──────────────────────────┘  │
│  ┌────────────────┬──────────────┬──────────────────────────┐  │
│  │     GitHub     │  Encryption  │      Rate Limiting      │  │
│  │   App Config   │   Service    │                         │  │
│  │      (DO)      │              │                          │  │
│  └────────────────┴──────────────┴──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              Cloudflare Container (Node.js)                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Claude Code SDK Integration                      │  │
│  │  - Repository cloning (authenticated git)                │  │
│  │  - Code analysis and generation                          │  │
│  │  - Git operations (branch, commit, push)                 │  │
│  │  - Pull request creation                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    External Services                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │    GitHub    │  │  Anthropic   │  │  Cloudflare Services │  │
│  │     API      │  │     API      │  │  (DO, KV, D1)       │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Target Users

### Primary Users

| Persona | Description | Pain Points | Goals |
|---------|-------------|-------------|-------|
| **Mobile Developer** | Codes on phone/tablet | Can't use CLI tools on mobile | Review PRs, fix bugs on-the-go |
| **Remote Developer** | Works from coffee shops, travel | Laptop not always available | Ship from anywhere |
| **Hobbyist** | Personal projects, limited hardware | Expensive hardware required | Code without powerful machine |
| **Team Lead** | Reviews code, manages multiple repos | Needs quick oversight | Monitor progress remotely |

### Secondary Users

| Persona | Description | Use Case |
|---------|-------------|----------|
| **Startup CTO** | Evaluates tools for team | Low-overhead AI coding |
| **Open Source Maintainer** | Manages community repos | Automate issue triage |
| **Enterprise Dev** | Corporate environment | No install policy compliance |

### User Segments

**By Geography:**
- North America (40%) - Early adopters, mobile-heavy
- Europe (30%) - Privacy-conscious, GitHub App preferred
- Asia-Pacific (20%) - Mobile-first markets
- Other (10%)

**By Role:**
- Full-stack developers (50%)
- Frontend/backend specialists (30%)
- Engineering managers/leads (15%)
- Students/learners (5%)

---

## Key Features

### 1. GitHub App Integration ✅

**Description:** One-click GitHub App installation for repository connection.

**Capabilities:**
- OAuth flow for authentication
- Installation token management (cached 5min)
- Repository selection and sync
- Webhook-based issue processing
- Automatic PR creation

**User Flow:**
```
1. User clicks "Install GitHub App"
2. GitHub OAuth authorization
3. Select repositories to connect
4. Webhooks configured automatically
5. Ready to process issues
```

**Status:** ✅ Live

---

### 2. Interactive Sessions ✅

**Description:** Real-time streaming sessions with Claude AI.

**Capabilities:**
- Server-Sent Events (SSE) streaming
- Multi-turn conversations
- Real-time output display
- File change detection
- Branch, commit, and push automation
- PR creation on completion

**Endpoints:**
- `POST /interactive/start` - Start session
- `GET /interactive/status?sessionId={id}` - Check status
- `DELETE /interactive/{sessionId}` - Cancel session

**Status:** ✅ Live

---

### 3. Multi-Repo Processing ✅

**Description:** Process multiple repositories simultaneously.

**Capabilities:**
- Parallel container spawning
- Aggregate status display
- Per-repo success/failure tracking
- Concurrent session management

**Status:** ✅ Live

---

### 4. Native Mobile Apps 🚧

**Description:** iOS and Android apps via Expo/React Native.

**Capabilities:**
- Cross-platform code sharing (95%+)
- Native navigation and gestures
- Offline-first architecture (planned)
- Push notifications (planned)

**Screens:**
- Dashboard (stats overview)
- Repositories (add, remove, refresh)
- Issues (list, filter, create)
- Sessions (active and historical)
- Settings (GitHub connection)

**Status:** 🚧 In Development (Expo app structured)

---

### 5. Test Mode ✅

**Description:** Development/testing mode with mock data.

**Capabilities:**
- Enable via `?test=true` parameter
- Mock repositories (5 fake repos)
- Mock SSE stream
- No GitHub auth required

**Use Cases:**
- UX testing without backend
- Frontend development
- Demo environments

**Status:** ✅ Live

---

### 6. Automatic Issue Processing ✅

**Description:** GitHub webhook-triggered automatic issue handling.

**Capabilities:**
- Issue creation webhook listener
- Automatic repo cloning
- Claude analysis and code generation
- PR creation with changes
- Comment on issues (acknowledgment, status)

**Status:** ✅ Live

---

### 7. Error Boundaries & Toast Notifications ✅

**Description:** Production-grade error handling and user feedback.

**Capabilities:**
- Per-tab error boundaries
- Graceful fallback UIs
- Toast notifications (success, error, warning, info)
- Swipe-to-dismiss
- Auto-dismiss with progress bar

**Status:** ✅ Live

---

## Competitive Positioning

### Competitive Landscape

| Product | Where Code Runs | Interface | Mobile App | Multi-repo | Price | GitHub | Setup |
|---------|-----------------|-----------|-------------|------------|-------|--------|-------|
| **Cloud Code** | ☁️ **Cloudflare Containers** | Web ✅ | ✅ **Expo/RN** | ✅ Parallel | 💰 **Free (LLMs included)** | ✅ GitHub App | **Zero install** |
| Claude Code | 💻 Your machine | CLI | ❌ None | ❌ Single | $8/mo | Manual | Node + CLI + git |
| Kilo | 💻 Your machine | CLI / Web | ❌ Desktop-only | ❌ Single | $20/mo | Git-based | Local install |
| Clio | 💻 Your machine | CLI | ❌ None | ❌ Single | €10/mo | Git-based | Local install |
| GitHub Copilot | 💻 Your IDE | IDE Plugin | ❌ IDE only | ❌ | $10-20/mo | ✅ | VS Code / JetBrains |
| Cursor | 💻 Your IDE | IDE | ❌ IDE only | ❌ | $20/mo | ✅ | VS Code install |

### Unique Selling Propositions

1. **☁️ Remote Execution by Default**
   - No local compute required
   - No battery drain
   - Works on any device

2. **📱 Native Mobile Apps**
   - True iOS/Android apps (not just responsive web)
   - Code on-the-go
   - Full feature parity planned

3. **💰 LLMs Included**
   - No API key setup
   - Centralized cost management
   - Zero setup friction

4. **🔄 Multi-Repo Parallel Processing**
   - Handle 2-3 repos simultaneously
   - Aggregate progress tracking

5. **✅ GitHub App Native Integration**
   - One-click repo connection
   - Webhook automation
   - Enterprise-friendly

### Competitive Advantages by Competitor

| vs. | Advantages |
|-----|------------|
| **Claude Code** | Remote + Mobile app + Web UI + Multi-repo + LLMs included |
| **Kilo** | Cloud execution + Native mobile + Parallel + Free |
| **Clio** | Cloud execution + GitHub App + Mobile app + Free |
| **Copilot** | Remote + Mobile + Claude (better reasoning) + Free |
| **Cursor** | Cloud-based + Mobile app + No IDE + Free |

---

## Technical Architecture

### Technology Stack

#### Backend (Cloudflare Worker)
- **Runtime:** Cloudflare Workers (Node.js compat)
- **Language:** TypeScript
- **Storage:** Durable Objects (SQLite)
- **Secrets:** Cloudflare Secrets
- **Container:** @cloudflare/containers (beta)

#### Container (Code Execution)
- **Base:** Node.js 22 (Alpine)
- **AI SDK:** @anthropic-ai/claude-code
- **Git:** authenticated git operations
- **GitHub:** @octokit/rest

#### Frontend (Web)
- **Framework:** React
- **Styling:** TailwindCSS
- **HTTP:** ky
- **State:** Zustand
- **Routing:** React Router

#### Mobile (iOS/Android)
- **Framework:** Expo (React Native)
- **Navigation:** Expo Router
- **State:** Zustand (shared with web)
- **Styling:** React Native + NativeWind

### System Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                  │
├─────────────────────────────────┬──────────────────────────────────────────┤
│  Web (React + Tailwind)         │  Mobile (Expo + React Native)            │
│  - Dashboard                    │  - Native navigation                     │
│  - Repository management        │  - Native gestures                       │
│  - Interactive sessions         │  - Platform-specific UI                  │
│  - Issue tracking               │  - Offline-first (planned)               │
└────────────┬────────────────────┴────────────────────┬─────────────────────┘
             │                                         │
             └─────────────────┬───────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                         CLOUDFLARE WORKER                                  │
│  ┌────────────────┬─────────────────┬──────────────────────────────────┐   │
│  │   HTTP Router  │   GitHub Webhook│   Interactive Session DO         │   │
│  │                │   Handlers      │                                  │   │
│  │  /gh-setup     │                 │  - Session state                 │   │
│  │  /gh-status    │  - Issues       │  - Turn tracking                 │   │
│  │  /webhooks/*   │  - Installation │  - Output streaming              │   │
│  │  /interactive/*│  - PR creation  │  - Cancellation                  │   │
│  │  /api/*        │                 │                                  │   │
│  └────────────────┴─────────────────┴──────────────────────────────────┘   │
│  ┌────────────────┬─────────────────┬──────────────────────────────────┐   │
│  │   GitHub App   │   Encryption    │   Rate Limiting (KV)             │   │
│  │   Config DO    │   Service       │                                  │   │
│  │                │                 │                                  │   │
│  │  - App creds   │  - AES-256-GCM  │  - Per-user limits               │   │
│  │  - Install     │  - Key wrapping │  - Quota tracking                │   │
│  │    tokens      │                 │                                  │   │
│  └────────────────┴─────────────────┴──────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                      CLOUDFLARE CONTAINER                                  │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │                    CONTAINER MANAGER (DO)                           │   │
│  │  - Spawns containers on demand                                     │   │
│  │  - Manages lifecycle (sleep after 45s)                             │   │
│  │  - Passes environment variables                                    │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                               │                                            │
│                               ▼                                            │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │                    NODE.JS CONTAINER                                │   │
│  │  - HTTP server on port 8080                                        │   │
│  │  - /process-issue endpoint                                         │   │
│  │  - /interactive-session endpoint                                   │   │
│  │  - Claude Code SDK integration                                     │   │
│  │  - Git operations (clone, branch, commit, push)                    │   │
│  │  - PR creation via GitHub API                                      │   │
│  └────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL APIS                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────────┐  │
│  │  GitHub API  │  │ Anthropic API│  │   Cloudflare Services            │  │
│  │              │  │              │  │                                  │  │
│  │  - Webhooks  │  │  - Claude    │  │  - Durable Objects               │  │
│  │  - Issues    │  │  - Messages  │  │  - KV                            │  │
│  │  - PRs       │  │  - Streaming │  │  - Containers                    │  │
│  │  - Repos     │  │              │  │  - Secrets                       │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

### Data Models

#### GitHubAppConfigDO (Durable Object)
```typescript
interface GitHubAppConfig {
  appId: string;
  privateKey: string;  // encrypted
  webhookSecret: string;  // encrypted
  installations: Installation[];
}

interface InstallationToken {
  installationId: number;
  token: string;
  expiresAt: Date;
}
```

#### InteractiveSessionDO (Durable Object)
```typescript
interface Session {
  id: string;
  prompt: string;
  repository?: { url: string; name: string; branch?: string };
  status: 'starting' | 'running' | 'completed' | 'error';
  output: string[];
  turns: number;
  createdAt: Date;
}
```

---

## User Experience

### User Journey

``┌─────────────────────────────────────────────────────────────────────────┐
│                          USER JOURNEY MAP                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. DISCOVERY                                                           │
│     ├─ Word of mouth / GitHub / Twitter                                 │
│     ├─ Visit landing page                                               │
│     └─ See: "Code from your phone. Zero setup."                         │
│                                                                         │
│  2. SIGN UP                                                             │
│     ├─ Click "Install GitHub App"                                      │
│     ├─ GitHub OAuth (one-click)                                        │
│     ├─ Select repositories                                             │
│     └─ Redirected to dashboard                                         │
│                                                                         │
│  3. FIRST USE                                                           │
│     ├─ See connected repositories                                      │
│     ├─ See dashboard stats                                             │
│     ├─ Start interactive session OR create issue                       │
│     └─ See real-time Claude output                                     │
│                                                                         │
│  4. ONGOING USE                                                         │
│     ├─ Monitor active sessions                                         │
│     ├─ Review and merge PRs                                            │
│     ├─ Add/remove repositories                                        │
│     └─ View session history                                            │
│                                                                         │
│  5. MOBILE USE                                                          │
│     ├─ Download iOS/Android app                                        │
│     ├─ Sign in with GitHub                                             │
│     ├─ Full feature parity                                             │
│     └─ Code on-the-go                                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Screen Flows

#### Web App

``┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Landing    │───▶│  GitHub     │───▶│  Dashboard  │───▶│  Session    │
│  Page       │    │  Auth       │    │  (Tabs)     │    │  Running    │
└─────────────┘    └─────────────┘    └──────┬──────┘    └─────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
            ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
            │  Repos      │    │  Issues     │    │  Settings   │
            │  (Add/Rem)  │    │  (List)     │    │  (GitHub)   │
            └─────────────┘    └─────────────┘    └─────────────┘
```

#### Mobile App (Planned)

``┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Splash     │───▶│  GitHub     │───▶│  Dashboard  │───▶│  Session    │
│  Screen     │    │  Auth       │    │  (Tabs)     │    │  Fullscreen  │
└─────────────┘    └─────────────┘    └──────┬──────┘    └─────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
            ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
            │  Repos      │    │  Issues     │    │  Profile    │
            │  (Swipe)    │    │  (Pull)     │    │  (Settings) │
            └─────────────┘    └─────────────┘    └─────────────┘
```

### UI Design Principles

1. **Dark Mode First** - Developer-friendly, reduces eye strain
2. **Mobile-First** - Design for smallest screen first
3. **Touch-Friendly** - 44pt minimum tap targets
4. **Immediate Feedback** - Loading states, progress indicators
5. **Progressive Disclosure** - Show info as needed
6. **Accessibility** - WCAG AA compliance

---

## Business Model

### Revenue Streams (Future)

| Stream | Description | Timeline |
|--------|-------------|----------|
| **Free Tier** | LLMs included, rate-limited | Now |
| **Pro Tier** | Higher limits, priority queue | Q2 2026 |
| **Team Tier** | Shared workspaces, collaboration | Q3 2026 |
| **Enterprise** | SSO, audit logs, dedicated support | Q4 2026 |

### Pricing Strategy

#### Phase 1: Growth (Current)
- **Price:** Free
- **Includes:** Unlimited sessions, LLM access
- **Limit:** Rate limiting for abuse prevention
- **Goal:** Maximize adoption, repo connections

#### Phase 2: Monetization (Future)
- **Free:** 100 sessions/month, single repo
- **Pro:** $9/month - Unlimited sessions, 10 repos, priority
- **Team:** $29/user/month - Shared workspaces, 50 repos
- **Enterprise:** Custom - SSO, unlimited, SLA

### Cost Structure

| Cost Category | Description | Monthly (Est.) |
|---------------|-------------|----------------|
| LLM API | Claude API usage | $500-2,000 |
| Cloudflare | Workers, Containers, DO | $100-300 |
| Development | Engineering time | $10,000+ |
| Operations | Domain, monitoring | $50-100 |

---

## Go-to-Market Strategy

### Launch Phases

#### Phase 1: Beta (Current) ✅
- **Target:** GitHub developers, early adopters
- **Channels:** GitHub Marketplace, Twitter/X, Hacker News
- **Goal:** 100 users, 500 repos connected
- **Metrics:** Activation rate, session completion

#### Phase 2: Public Launch
- **Target:** Broader developer community
- **Channels:** Product Hunt, Reddit, dev communities
- **Goal:** 1,000 users, 5,000 repos
- **Metrics:** DAU/MAU, retention

#### Phase 3: Mobile Launch
- **Target:** Mobile-first developers
- **Channels:** App Store, Play Store, mobile ads
- **Goal:** 5,000 mobile users
- **Metrics:** App downloads, mobile engagement

### Marketing Messages

**Primary:** "Code from your phone. Zero setup."

**Secondary:**
- "The only AI coding tool with native mobile apps"
- "No laptop? No problem."
- "AI coding that runs in the cloud"

### Distribution Channels

1. **GitHub Marketplace** - Primary acquisition channel
2. **Social Media** - Twitter/X, LinkedIn, Reddit
3. **Dev Communities** - Discord, Slack, Discord servers
4. **Content Marketing** - Blog posts, tutorials
5. **App Stores** - iOS App Store, Google Play (future)

---

## Product Roadmap

### Q1 2026 (Current - MVP)

| Feature | Status | Priority |
|---------|--------|----------|
| GitHub App integration | ✅ Live | P0 |
| Interactive sessions | ✅ Live | P0 |
| Multi-repo processing | ✅ Live | P0 |
| Test mode | ✅ Live | P1 |
| Error boundaries | ✅ Live | P1 |
| Toast notifications | ✅ Live | P1 |
| Web dashboard | ✅ Live | P0 |

### Q2 2026

| Feature | Status | Priority |
|---------|--------|----------|
| Mobile apps (iOS/Android) | 🚧 In Progress | P0 |
| User accounts & authentication | 📋 Planned | P0 |
| Session history & replay | 📋 Planned | P1 |
| Custom model selection | 📋 Planned | P2 |
| Pro tier launch | 📋 Planned | P0 |

### Q3 2026

| Feature | Status | Priority |
|---------|--------|----------|
| Team workspaces | 📋 Planned | P0 |
| Collaborative sessions | 📋 Planned | P1 |
| Slack integration | 📋 Planned | P1 |
| Usage analytics dashboard | 📋 Planned | P2 |

### Q4 2026

| Feature | Status | Priority |
|---------|--------|----------|
| Enterprise tier | 📋 Planned | P0 |
| SSO (SAML) | 📋 Planned | P0 |
| Audit logs | 📋 Planned | P1 |
| Dedicated support | 📋 Planned | P1 |

---

## Success Metrics

### Product Metrics

| Metric | Definition | Target (Q1 2026) | Target (Q2 2026) |
|--------|------------|------------------|------------------|
| **Total Users** | Registered accounts | 100 | 1,000 |
| **Active Users** | DAU | 20 | 200 |
| **Repos Connected** | Unique repositories | 500 | 5,000 |
| **Sessions Created** | Total sessions | 1,000 | 10,000 |
| **Session Success Rate** | % completed without error | 85% | 90% |
| **Mobile Downloads** | App installs | N/A | 500 |

### Engagement Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Activation Rate** | Users who start a session within 24h | 50% |
| **Retention (D7)** | Users active 7 days after signup | 30% |
| **Retention (D30)** | Users active 30 days after signup | 15% |
| **Avg Session Duration** | Time spent in active session | 5-10 min |
| **Sessions/User/Week** | Frequency of use | 2+ |

### Technical Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Uptime** | Service availability | 99.5% |
| **P95 Latency** | Session start time | <5s |
| **Error Rate** | Failed sessions | <5% |
| **Container Spawn Time** | Time to ready container | <3s |

---

## Risks & Mitigations

### Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Cloudflare Containers beta changes | High | Medium | Monitor updates, have fallback |
| LLM API rate limits | High | Low | Implement caching, rate limiting |
| Durable Object scaling issues | Medium | Low | Load testing, monitor metrics |
| Mobile app rejection | Low | Low | Follow App Store guidelines |

### Business Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| LLM costs unsustainable | High | Medium | Implement rate limits, tiered pricing |
| Competitor copies features | Medium | High | Focus on mobile-first, move fast |
| Low user adoption | High | Medium | Marketing push, improve onboarding |
| GitHub App policy changes | Medium | Low | Diversify integration options |

### Operational Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| API key leakage | Critical | Low | Secret rotation, monitoring |
| Abuse / DoS | High | Medium | Rate limiting, Cloudflare protection |
| Data breach | Critical | Low | Encryption, minimal data storage |

---

## Appendix

### Glossary

| Term | Definition |
|------|------------|
| **Durable Object (DO)** | Cloudflare's strongly-consistent stateful compute primitive |
| **Container** | Isolated compute environment for code execution |
| **SSE** | Server-Sent Events for real-time streaming |
| **GitHub App** | OAuth-based GitHub integration model |
| **Webhook** | HTTP callback triggered by GitHub events |
| **Expo** | React Native development platform |
| **Claude Code** | Anthropic's AI coding CLI tool |

### References

- **Architecture:** `/CLAUDE.md`
- **API Reference:** `/docs/API_REFERENCE.md`
- **User Guide:** `/docs/USER_GUIDE.md`
- **LLM Architecture:** `/docs/CENTRALIZED_LLM_ARCHITECTURE.md`
- **UX Testing:** `/docs/UX-Test-Scenario-Multi-Repo.md`

### Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-08 | Initial PRD creation |

---

**Document Status:** ✅ Approved
**Next Review:** 2026-02-01
**Review Cadence:** Monthly
