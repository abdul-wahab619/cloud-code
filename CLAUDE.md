# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
npm run dev          # Start local development server (http://localhost:8787)
npm run deploy       # Deploy to Cloudflare Workers
npm run cf-typegen   # Generate TypeScript types after wrangler config changes
```

**⚠️ Important:** Always run `npm run cf-typegen` after making changes to `wrangler.jsonc`. This regenerates the TypeScript types and updates `worker-configuration.d.ts` to match your bindings and configuration.

### Container Development Commands

```bash
cd container_src
npm run build        # Compile TypeScript to dist/
npm run watch        # Watch mode for TypeScript compilation
```

### Wrangler CLI Commands

```bash
npx wrangler dev                    # Start local development (same as npm run dev)
npx wrangler dev --remote          # Use remote Cloudflare resources
npx wrangler deploy                 # Deploy to production (same as npm run deploy)
npx wrangler login                  # Authenticate with Cloudflare
npx wrangler versions upload        # Upload new version with preview URL
```

## Architecture Overview

This is a **Cloudflare Workers Container project** that integrates **Claude Code** with **GitHub** for automated issue processing. The architecture has two main components:

### Worker Layer (`src/`)
TypeScript Cloudflare Worker that handles HTTP routing and GitHub webhook processing. Key components:

- **`src/index.ts`** - Main entry point with three Durable Object classes:
  - `GitHubAppConfigDO` - Stores encrypted GitHub app credentials and installation tokens using SQLite storage
  - `MyContainer` - Extends `@cloudflare/containers` `Container` class, manages container lifecycle
  - `InteractiveSessionDO` - Manages state for interactive Claude Code sessions

- **Request Router** routes paths to handlers:
  - `/gh-setup` - GitHub app OAuth flow initiation
  - `/gh-setup/callback` - OAuth callback handler
  - `/gh-status` - Configuration status endpoint
  - `/webhooks/github` - GitHub webhook receiver
  - `/interactive/*` - Interactive mode endpoints (see below)
  - `/container/*`, `/lb/*`, `/singleton/*`, `/error/*` - Container testing routes

- **Handlers** (`src/handlers/`):
  - `github_webhook.ts` - Signature verification and event routing
  - `github_webhooks/issues.ts` - Issue event processing, routes to Claude containers
  - `github_webhooks/installation.ts` - Installation events
  - `github_webhooks/installation_change.ts` - Repository added/removed events
  - `github_setup.ts` - GitHub app manifest generation
  - `oauth_callback.ts` - OAuth flow completion
  - `interactive.ts` - Interactive mode session management
  - `health.ts` - Health check and metrics endpoints
  - `github_status.ts` - Configuration status endpoint

- **Utilities**:
  - `crypto.ts` - AES-256-GCM encryption/decryption, JWT generation for GitHub App auth
  - `github_client.ts` - GitHub API wrapper using installation tokens
  - `fetch.ts` - Container communication helpers (`containerFetch`, `loadBalance`, `getRouteFromRequest`)
  - `log.ts` - Structured logging with context (`logWithContext`)
  - `types.ts` - TypeScript interfaces for GitHub webhooks and configuration

### Container Layer (`container_src/`)
Node.js server running in a Cloudflare Container, processes GitHub issues using Claude Code SDK:

- **`container_src/src/main.ts`** - HTTP server on port 8080:
  - `GET /` or `/container` - Health check endpoint
  - `POST /process-issue` - Main issue processing handler
  - `GET /error` - Error testing endpoint

- **Issue Processing Flow**:
  1. Receives issue context via environment variables or request body
  2. Clones repository to `/tmp/workspace/issue-{number}` using authenticated git
  3. Changes to workspace directory and invokes `@anthropic-ai/claude-code` `query()`
  4. Detects git changes using `simple-git`
  5. Creates feature branch, commits changes, pushes to remote
  6. Creates pull request via `ContainerGitHubClient` (or posts comment if PR creation fails)

- **`container_src/src/github_client.ts`** - GitHub API client using `@octokit/rest` for PRs and comments

## GitHub Integration Architecture

**GitHub App Manifest Flow** (one-click installation):
1. User visits `/gh-setup` → generates dynamic manifest URL
2. User installs app → GitHub redirects to `/gh-setup/callback` with `code`
3. Worker exchanges `code` for app config (app_id, private_key, webhook_secret)
4. Credentials are encrypted with AES-256-GCM before storage in Durable Object
5. User is redirected to `/gh-setup/install` for repository selection

**Webhook Processing Flow**:
1. GitHub sends webhook to `/webhooks/github`
2. Signature verified using stored `webhook_secret`
3. Routed to event handler (issues, installation, etc.)
4. For new issues: posts acknowledgment comment, spawns container with credentials
5. Container clones repo, runs Claude Code, creates PR

**Authentication Chain**:
```
GitHub App (JWT) → Installation Token → API Calls
```
- App JWT generated from `app_id` + `private_key` (RS256, 10min expiry)
- JWT exchanged for installation token (cached for 5min in SQLite)
- Installation token used for authenticated GitHub API calls

## Configuration Files

- **`wrangler.jsonc`** - Workers configuration with containers and Durable Objects bindings
- **`Dockerfile`** - Multi-stage Node.js 22 image with Claude Code CLI globally installed
- **`worker-configuration.d.ts`** - Auto-generated types from wrangler config
- **`.dev.vars`** - Local environment variables (git-ignored)

### Key Wrangler Patterns

```jsonc
{
  "compatibility_date": "2025-05-23",
  "compatibility_flags": ["nodejs_compat"],
  "containers": [{
    "class_name": "MyContainer",
    "image": "./Dockerfile",
    "max_instances": 10
  }],
  "durable_objects": {
    "bindings": [
      { "name": "MY_CONTAINER", "class_name": "MyContainer" },
      { "name": "GITHUB_APP_CONFIG", "class_name": "GitHubAppConfigDO" }
    ]
  },
  "migrations": [
    { "new_sqlite_classes": ["MyContainer"], "tag": "v1" },
    { "new_sqlite_classes": ["GitHubAppConfigDO"], "tag": "v2" }
  ]
}
```

## Container Communication Pattern

Containers communicate via HTTP requests to internal DO endpoints:

```typescript
// Get or create container by name
const id = env.MY_CONTAINER.idFromName('container-name');
const container = env.MY_CONTAINER.get(id);

// Send request to container
const response = await containerFetch(container, request, {
  containerName: 'container-name',
  route: '/process-issue'
});
```

**MyContainer.fetch()** override:
- Intercepts `/process-issue` requests to set environment variables dynamically
- Passes issue context (ANTHROPIC_API_KEY, GITHUB_TOKEN, ISSUE_NUMBER, etc.) to container

## Data Storage (SQLite in Durable Objects)

**GitHubAppConfigDO** maintains two tables:

1. `github_app_config` - App credentials and repository list
2. `installation_tokens` - Cached installation tokens with expiry

All sensitive data encrypted with AES-256-GCM before storage.

## Centralized API Key

The API key is centrally managed via the `ANTHROPIC_API_KEY` environment variable:
- Set as a Cloudflare Secret in production
- All users share the same API key
- Eliminates user setup friction (no /claude-setup flow needed)
- Works with Anthropic-compatible APIs (GLP, Z.ai, or direct Anthropic)

## Interactive Mode

The system supports **real-time interactive sessions** with Claude Code, enabling streaming output and bidirectional communication.

### Interactive Mode Endpoints

- **`POST /interactive/start`** - Start a new interactive session
  - Returns SSE stream of Claude's output in real-time
  - Request body: `{ prompt, repository?, options? }`

- **`GET /interactive/status?sessionId={id}`** - Check session status
- **`DELETE /interactive/{sessionId}`** - End an active session

### Starting an Interactive Session

```bash
curl -N -X POST https://your-worker.workers.dev/interactive/start \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Analyze this repository for security issues",
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
  }'
```

### SSE Event Types

| Event | Description |
|-------|-------------|
| `connected` | Connection established |
| `status` | Status updates (cloning repo, starting Claude, etc.) |
| `claude_start` | Beginning of a Claude turn |
| `claude_delta` | Streaming output from Claude |
| `claude_end` | End of a Claude turn |
| `input_request` | Claude is asking for user input |
| `file_change` | File changes detected |
| `complete` | Session completed successfully |
| `error` | Error occurred |

### Test Clients

- **HTML Client**: Open `interactive-client.html` in a browser
- **Node.js Client**: `node test-client.js --prompt "Analyze code" --repo "owner/repo"`

### Container Interactive Handler

The container (`container_src/src/interactive_session.ts`) handles interactive sessions:

```typescript
// Endpoint: POST /interactive-session
// Headers: X-Session-Id: {sessionId}
// Body: { sessionId, prompt, repository?, anthropicApiKey, githubToken?, options? }

// Streams SSE events with Claude's output in real-time
// Supports detecting when Claude asks for input
```

## Environment Variables

**Worker-level** (set in `wrangler.jsonc` or Cloudflare Secrets):
- `ANTHROPIC_API_KEY` - API key for Anthropic-compatible service (GLP, Z.ai, or direct Anthropic)
- `ENCRYPTION_KEY` - AES-256-GCM encryption key for GitHub credentials
- `RATE_LIMIT_KV` - KV namespace for rate limiting (optional)

**Container-level** (passed dynamically by Worker):
- `ANTHROPIC_API_KEY` - API key (from Worker env)
- `ANTHROPIC_AUTH_TOKEN` - Alias for ANTHROPIC_API_KEY
- `ANTHROPIC_BASE_URL` - API base URL (default: https://api.z.ai/api/anthropic)
- `API_TIMEOUT_MS` - Request timeout in milliseconds
- `GITHUB_TOKEN` - Installation token for API access
- `ISSUE_ID`, `ISSUE_NUMBER`, `ISSUE_TITLE`, `ISSUE_BODY`, `ISSUE_LABELS`
- `REPOSITORY_URL`, `REPOSITORY_NAME`
- `ISSUE_AUTHOR`

## Important Notes

- **Containers are Beta** - `@cloudflare/containers` version pinned to 0.0.8
- **Encryption key** - Currently static; should use proper key management in production
- **Container sleep timeout** - 45 seconds (`sleepAfter = '45s'`)
- **Default branch** - Container assumes repository default branch for PR creation
- **Workspace cleanup** - Temporary workspaces in `/tmp/workspace/` persist for container lifetime