# Deployment Guide

## Prerequisites

1. **Cloudflare Account** with Workers enabled
2. **GitHub Account** for the GitHub App
3. **Anthropic API Key** for Claude access

## Initial Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create KV Namespace

```bash
npx wrangler kv namespace create CLOUD_CODE_RATE_LIMIT
```

Update `wrangler.jsonc` with the returned ID:
```json
{
  "kv_namespaces": [
    {
      "binding": "RATE_LIMIT_KV",
      "id": "your-namespace-id"
    }
  ]
}
```

### 3. Set Encryption Key

```bash
# Generate a secure key
openssl rand -base64 32

# Set as secret
echo "YOUR_BASE64_KEY" | npx wrangler secret put ENCRYPTION_KEY
```

### 4. Generate TypeScript Types

```bash
npm run cf-typegen
```

## Deployment

### Production Deployment

```bash
npm run deploy
```

### Staging Deployment

```bash
npm run deploy:staging
```

## Post-Deployment Configuration

### 1. Configure GitHub App

Visit `/gh-setup` on your worker URL to:
1. Generate GitHub App manifest
2. Install the app
3. Select repositories

### 2. Configure Claude API

Visit `/claude-setup` on your worker URL to:
1. Enter your Anthropic API key
2. Save the configuration

## Verification

### Health Check

```bash
curl https://your-worker.workers.dev/health | jq .
```

Expected output:
```json
{
  "status": "healthy",
  "components": {
    "githubApp": { "configured": true },
    "claudeConfig": { "configured": true },
    "rateLimit": { "configured": true }
  }
}
```

### Test GitHub Integration

1. Create a test issue in a connected repository
2. Watch for Claude's response comment
3. Verify the PR is created

### Test Interactive Mode

```bash
curl -N -X POST https://your-worker.workers.dev/interactive/start \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Say hello",
    "options": { "maxTurns": 1 }
  }'
```

## Rollback

If something goes wrong:

```bash
# List versions
npx wrangler versions list

# Rollback to a specific version
npx wrangler rollback <version-id>
```

## Monitoring

### View Logs

```bash
npx wrangler tail
```

### Check Metrics

```bash
curl https://your-worker.workers.dev/metrics | jq .
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install
      - run: npm run test:e2e
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

## Troubleshooting

### Container Build Fails

```bash
# Clear Docker cache and rebuild
docker system prune -af
npm run deploy
```

### KV Namespace Issues

```bash
# List KV namespaces
npx wrangler kv namespace list

# View KV contents
npx wrangler kv:key list --binding=RATE_LIMIT_KV
```

### Secret Issues

```bash
# List secrets (cannot view values)
npx wrangler secret list

# Replace a secret
npx wrangler secret put ENCRYPTION_KEY
```
