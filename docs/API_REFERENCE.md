# Claude Code Worker - API Reference

**Version:** 1.0.0
**Base URL:** `https://your-worker.workers.dev`

## Authentication

Most endpoints do not require authentication. GitHub webhook endpoints verify requests using HMAC signature.

---

## Endpoints

### Health & Status

#### GET /health

Check system health and status.

**Response:**
```json
{
  "status": "healthy" | "degraded" | "unhealthy",
  "timestamp": "2025-01-06T00:00:00.000Z",
  "uptime": 1234567890,
  "version": "1.0.0",
  "environment": "production",
  "components": {
    "durableObjects": { "status": "operational", "message": "string" },
    "containers": { "status": "operational", "message": "string" },
    "githubApp": { "status": "configured" | "not configured", "configured": true },
    "claudeConfig": { "status": "configured" | "not configured", "configured": true },
    "rateLimit": { "status": "configured" | "not configured", "configured": true }
  },
  "metrics": {
    "requests": {
      "total": 1000,
      "byRoute": { "/path": 100 },
      "byStatus": { "200": 950, "500": 50 },
      "successRate": 0.95
    },
    "containers": {
      "active": 2,
      "total": 10,
      "errors": 1
    },
    "averageResponseTime": 150,
    "errorRate": 0.05
  },
  "quota": {
    "dailyTokens": 50000,
    "maxDailyTokens": 1000000,
    "remainingTokens": 950000,
    "dailyCost": 2.50,
    "maxDailyCost": 50,
    "remainingCost": 47.50,
    "activeSessions": 1,
    "maxConcurrentSessions": 5,
    "allowed": true,
    "reason": "string"
  },
  "github": {
    "appId": "123456",
    "installationId": "789012",
    "repositoryCount": 5,
    "totalWebhooks": 100,
    "lastWebhookAt": "2025-01-06T00:00:00.000Z"
  }
}
```

**Status Codes:**
- `200` - Healthy or Degraded
- `503` - Unhealthy

---

### Metrics

#### GET /metrics

Get application metrics.

**Response:**
```json
{
  "requests": {
    "total": 1000,
    "byRoute": { "/webhooks/github": 500 },
    "byStatus": { "200": 950 }
  },
  "containers": {
    "active": 2,
    "total": 10,
    "errors": 1
  },
  "averageResponseTime": 150,
  "deploymentStartTime": "2025-01-01T00:00:00.000Z",
  "uptime": 432000000,
  "version": "1.0.0",
  "webhookStats": {
    "totalWebhooks": 100,
    "lastWebhookAt": "2025-01-06T00:00:00.000Z"
  }
}
```

#### GET /metrics/prometheus

Get metrics in Prometheus format.

**Response:** `text/plain`

```
# HELP claude_code_requests_total Total number of requests
# TYPE claude_code_requests_total counter
claude_code_requests_total 1000

# HELP claude_code_containers_active Number of active containers
# TYPE claude_code_containers_active gauge
claude_code_containers_active 2

# HELP claude_code_average_response_time_ms Average response time in milliseconds
# TYPE claude_code_average_response_time_ms gauge
claude_code_average_response_time_ms 150.00
```

---

### Configuration

#### GET /gh-status

Get GitHub and Claude configuration status.

**Response:**
```json
{
  "github": {
    "configured": true,
    "appId": "2601422",
    "owner": "username",
    "repositoryCount": 5
  },
  "claude": {
    "configured": true,
    "setupAt": "2025-01-01T00:00:00.000Z"
  }
}
```

#### GET /gh-setup

Initiate GitHub App OAuth flow.

**Query Parameters:**
- `redirect_url` (optional) - Custom redirect URL

**Response:** HTML page with GitHub App installation link

#### GET /gh-setup/callback

OAuth callback handler (internal).

#### POST /claude-setup

Store Claude API key (encrypted).

**Request Body:**
```json
{
  "anthropicApiKey": "sk-ant-..."
}
```

**Response:** `200 OK`

**Error Responses:**
- `400` - Invalid API key format
- `500` - Internal error

---

### Interactive Mode

#### POST /interactive/start

Start a new interactive Claude Code session.

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "sessionId": "optional-custom-session-id",
  "prompt": "Your question or instruction",
  "repository": {
    "url": "https://github.com/owner/repo",
    "name": "owner/repo",
    "branch": "main"
  },
  "anthropicApiKey": "sk-ant-...", // Optional, uses stored key if omitted
  "anthropicBaseUrl": "https://api.anthropic.com", // Optional
  "githubToken": "ghp_...", // Optional for PR creation
  "options": {
    "maxTurns": 10, // Default: 10
    "permissionMode": "acceptEdits", // Default: "acceptEdits"
    "createPR": false // Default: false
  }
}
```

**Response:** Server-Sent Events (SSE) stream

**Event Types:**

| Event | Data | Description |
|-------|------|-------------|
| `connected` | `{ message, timestamp }` | Connection established |
| `status` | `{ message, timestamp }` | Status update |
| `claude_start` | `{ turn, prompt, timestamp }` | Claude started |
| `claude_delta` | `{ turn, content, timestamp }` | Streaming output |
| `claude_end` | `{ turn, timestamp }` | Claude finished |
| `file_change` | `{ message, workspaceDir, timestamp }` | Files modified |
| `complete` | `{ sessionId, turns, timestamp }` | Session complete |
| `error` | `{ message, timestamp }` | Error occurred |

**Example:**
```bash
curl -N -X POST https://your-worker.workers.dev/interactive/start \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain how authentication works",
    "repository": {
      "name": "owner/repo"
    }
  }'
```

#### GET /interactive/status?sessionId={id}

Get session status.

**Query Parameters:**
- `sessionId` (required) - Session identifier

**Response:**
```json
{
  "sessionId": "abc-123",
  "status": "processing" | "completed" | "error",
  "currentTurn": 2,
  "repository": {
    "name": "owner/repo",
    "branch": "main"
  },
  "createdAt": 1641234567890,
  "lastActivityAt": 1641234599999,
  "completedAt": 1641234600000,
  "errorMessage": "string"
}
```

#### DELETE /interactive/{sessionId}

End an active session.

**Path Parameters:**
- `sessionId` - Session identifier

**Response:** `200 OK`

---

### GitHub Webhooks

#### POST /webhooks/github

GitHub webhook endpoint.

**Headers:**
- `X-Hub-Signature-256` - HMAC signature for verification

**Events Handled:**
- `issues` - Issue opened/edited
- `installation` - App installed
- `installation_repositories` - Repositories added/removed

**Request Body:** GitHub webhook payload

**Response:** `200 OK` (always, to prevent GitHub retries)

---

### Container Testing

#### GET /container

Basic container health check.

**Response:** `200 OK` with "Container is healthy"

#### POST /container/process-issue

Process a GitHub issue (internal).

#### GET /lb

Load balanced container test.

#### GET /singleton

Singleton container test.

---

## Error Responses

All errors return JSON with the following structure:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "timestamp": "2025-01-06T00:00:00.000Z"
}
```

**Error Codes:**

| Code | Status | Description |
|------|--------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `QUOTA_EXCEEDED` | 429 | Daily quota exceeded |
| `UNAUTHORIZED` | 401 | Missing or invalid credentials |
| `NOT_FOUND` | 404 | Resource not found |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Rate Limiting

Requests are rate-limited based on:

| Window | Limit |
|--------|-------|
| Per minute | 60 |
| Per hour | 1,000 |
| Per day | 5,000 |

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1704508800
```

---

## CORS

Allowed origins (configurable):
- `https://cloud-code.finhub.workers.dev`
- `http://localhost:8787`
- `http://localhost:3000`

Allowed headers:
- `Content-Type`
- `Authorization`
- `X-Requested-With`

---

## WebSocket Support (SSE)

Interactive mode uses Server-Sent Events (SSE).

**Client Example:**

```javascript
const eventSource = new EventSource(
  'https://your-worker.workers.dev/interactive/start',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: 'Analyze this code',
      repository: { name: 'owner/repo' }
    })
  }
);

eventSource.addEventListener('claude_delta', (e) => {
  console.log('Claude output:', e.data);
});

eventSource.addEventListener('complete', (e) => {
  console.log('Session complete:', JSON.parse(e.data));
  eventSource.close();
});

eventSource.addEventListener('error', (e) => {
  console.error('Session error:', e);
  eventSource.close();
});
```

---

## SDK / Library Integration

### JavaScript/TypeScript

```typescript
import { ClaudeCodeWorker } from '@cloud-code/worker-sdk';

const client = new ClaudeCodeWorker({
  baseUrl: 'https://your-worker.workers.dev',
  apiKey: process.env.CLOUD_CODE_KEY
});

// Start interactive session
const session = await client.interactive.start({
  prompt: 'Refactor this function',
  repository: 'owner/repo'
});

for await (const chunk of session.stream()) {
  console.log(chunk.content);
}
```

---

## Changelog

### Version 1.0.0 (2025-01-06)

- Initial release
- GitHub issue processing
- Interactive mode with SSE
- Rate limiting and quotas
- Health monitoring
