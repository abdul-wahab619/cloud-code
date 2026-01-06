# Claude Code on Cloudflare Workers - User Guide

**Last Updated:** 2025-01-06

## Overview

Claude Code on Cloudflare Workers is a GitHub App integration that automatically processes issues using Claude AI. When you create an issue in a connected repository, Claude analyzes the problem, writes code to fix it, and creates a pull request.

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Interactive Mode](#interactive-mode)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)
- [API Reference](#api-reference)

---

## Quick Start

1. **Install the GitHub App** - Visit `/gh-setup` on your worker URL
2. **Configure Claude API** - Visit `/claude-setup` and add your Anthropic API key
3. **Create an Issue** - Create a new issue in any connected repository
4. **Review the PR** - Claude will create a pull request with the fix

---

## Installation

### Step 1: Deploy the Worker

```bash
# Clone the repository
git clone https://github.com/your-org/cloud-code.git
cd cloud-code

# Install dependencies
npm install

# Deploy to Cloudflare
npm run deploy
```

### Step 2: Configure GitHub App

1. Visit `https://your-worker.workers.dev/gh-setup`
2. Click "Install GitHub App"
3. Select repositories to connect
4. Authorize the app

### Step 3: Configure Claude API

1. Visit `https://your-worker.workers.dev/claude-setup`
2. Enter your Anthropic API key
3. Click "Save Configuration"

---

## Configuration

### Environment Variables

Set these via `wrangler secret put`:

| Variable | Description | Required |
|----------|-------------|----------|
| `ENCRYPTION_KEY` | AES-256 key for encrypting secrets | Yes (auto-generated) |
| `ANTHROPIC_API_KEY` | Claude API key (via UI) | Yes |

### Rate Limits

Default rate limits (configurable in `src/middleware.ts`):

| Limit | Value |
|-------|-------|
| Requests per minute | 60 |
| Requests per hour | 1,000 |
| Requests per day | 5,000 |

### Quotas

Default usage quotas (configurable in `src/quota.ts`):

| Quota | Value |
|-------|-------|
| Daily tokens | 1,000,000 |
| Daily cost (USD) | $50 |
| Concurrent sessions | 5 |

---

## Usage

### Automatic Issue Processing

Create a GitHub issue with a clear description:

```
Title: Fix authentication bug in login flow

The login form doesn't properly validate JWT tokens.
When a token expires, the user is not redirected to the login page.
```

Claude will:
1. Analyze the issue
2. Clone the repository
3. Identify the bug
4. Write a fix
5. Create a pull request

### Issue Best Practices

- **Be specific**: Describe the expected vs actual behavior
- **Include context**: Mention relevant files or components
- **Add examples**: Provide error messages or stack traces
- **Set labels**: Use `bug`, `enhancement`, `refactor` for guidance

### Supported Issue Types

| Type | Description |
|------|-------------|
| Bug fixes | Correct errors, edge cases, crashes |
| Features | Add new functionality following existing patterns |
| Refactoring | Improve code structure, performance |
| Tests | Add unit tests for existing code |
| Documentation | Update comments, README files |

---

## Interactive Mode

Interactive mode allows real-time conversations with Claude about your codebase.

### Starting a Session

```bash
curl -N -X POST https://your-worker.workers.dev/interactive/start \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Analyze the authentication flow for security issues",
    "repository": {
      "url": "https://github.com/owner/repo",
      "name": "owner/repo",
      "branch": "main"
    },
    "options": {
      "maxTurns": 10,
      "createPR": false
    }
  }'
```

### SSE Events

The response streams Server-Sent Events:

| Event | Description |
|-------|-------------|
| `connected` | Connection established |
| `status` | Status updates (cloning, processing) |
| `claude_start` | Claude started processing |
| `claude_delta` | Streaming output chunk |
| `claude_end` | Claude finished |
| `file_change` | Files were modified |
| `complete` | Session completed |
| `error` | An error occurred |

### Web Dashboard

Visit `https://your-worker.workers.dev/` for the interactive PWA dashboard.

---

## Monitoring

### Health Check

```bash
curl https://your-worker.workers.dev/health
```

Response:
```json
{
  "status": "healthy",
  "components": {
    "githubApp": { "configured": true },
    "claudeConfig": { "configured": true },
    "rateLimit": { "configured": true }
  },
  "quota": {
    "dailyTokens": 100000,
    "maxDailyTokens": 1000000,
    "remainingCost": 45.50,
    "allowed": true
  }
}
```

### Metrics Endpoint

```bash
curl https://your-worker.workers.dev/metrics
```

### Prometheus Metrics

```bash
curl https://your-worker.workers.dev/metrics/prometheus
```

---

## Troubleshooting

### Common Issues

#### Issue: PR not created

**Possible causes:**
- Claude couldn't complete the fix
- Token limit exceeded
- Repository permission issues

**Solution:** Check the issue comments for detailed error messages.

#### Issue: "Rate limit exceeded"

**Solution:** Wait for the rate limit window to reset, or increase limits in `src/middleware.ts`.

#### Issue: "Quota exceeded"

**Solution:** Daily quota reached. Wait for reset or increase quota in `src/quota.ts`.

#### Issue: Container timeout

**Solution:** Complex tasks may timeout. The timeout is set to 45 seconds in `src/index.ts`.

### Debug Mode

Enable additional logging:

```typescript
// In src/index.ts
const DEBUG = true;
```

### Getting Help

1. Check health endpoint: `/health`
2. Review logs in Cloudflare Dashboard
3. Check GitHub issue comments for errors
4. Open an issue on the repository

---

## API Reference

### Endpoints

#### `POST /interactive/start`

Start an interactive session.

**Request Body:**
```json
{
  "prompt": "Your question about the code",
  "repository": {
    "url": "https://github.com/owner/repo",
    "name": "owner/repo",
    "branch": "main"
  },
  "options": {
    "maxTurns": 10,
    "permissionMode": "bypassPermissions",
    "createPR": false
  }
}
```

**Response:** SSE stream of events

#### `GET /interactive/status?sessionId={id}`

Get session status.

**Response:**
```json
{
  "sessionId": "abc-123",
  "status": "processing",
  "currentTurn": 2,
  "createdAt": 1641234567890
}
```

#### `DELETE /interactive/{sessionId}`

End an active session.

#### `GET /health`

Health check with detailed system status.

#### `GET /metrics`

Application metrics.

#### `GET /gh-status`

Configuration status.

### Webhooks

#### `POST /webhooks/github`

Receives GitHub webhook events.

**Events handled:**
- `issues` - New/edited issues
- `installation` - App installed/updated
- `installation_repositories` - Repositories added/removed

---

## Security

### Encryption

All sensitive data (API keys, tokens) is encrypted using AES-256-GCM before storage in Durable Objects.

### Webhook Verification

GitHub webhooks are verified using HMAC signature verification.

### Rate Limiting

All API endpoints are rate-limited per IP/user.

### CORS

CORS is configured for allowed origins only.

---

## Development

### Local Development

```bash
npm run dev
```

### Running Tests

```bash
npm test
```

### Deployment

```bash
npm run deploy
```

---

## License

MIT License - See LICENSE file for details.
