# Staging Environment

## Overview

The staging environment is a pre-production deployment used for testing changes before they reach production.

## URLs

| Environment | URL |
|-------------|-----|
| Staging | https://cloud-code-staging.finhub.workers.dev |
| Production | https://cloud-code.finhub.workers.dev |

## Configuration

Staging uses a separate Cloudflare Workers deployment with isolated resources:

### Worker Configuration
- **Name**: `cloud-code-staging`
- **Container Name**: `cloud-code-staging`
- **Max Container Instances**: 10

### Isolated Resources
- **KV Namespace**: `5e008e38c0d9471ca124d9743e9f6b46` (staging-specific)
- **Durable Objects**: Separate DO instances per environment
- **Assets**: Separate asset deployment

### Shared Resources
For MVP, staging shares some configuration with production:
- GitHub App configuration (same app, different webhook URL can be configured)
- Cloudflare account: `d9700a3fcc05a01f5d81670ebbae817d`

## Deployment

### Deploy to Staging
```bash
npm run deploy:staging
```

Or manually:
```bash
npm run build:css
npx wrangler deploy --env staging
```

### Deployment Pipeline
```
develop branch → staging → cloud-code-staging.finhub.workers.dev
main branch → production → cloud-code.finhub.workers.dev
```

## Secrets

Staging requires the same secrets as production:

```bash
# Set staging secrets
npx wrangler secret put ANTHROPIC_API_KEY --env staging
npx wrangler secret put ENCRYPTION_KEY --env staging
```

**Note**: For MVP, staging uses the same secret values as production. This allows realistic testing with real GitHub repos and Claude API.

## Health Check

```bash
curl https://cloud-code-staging.finhub.workers.dev/health
```

## Testing

### Smoke Tests
```bash
# Health check
curl https://cloud-code-staging.finhub.workers.dev/health

# Metrics
curl https://cloud-code-staging.finhub.workers.dev/metrics

# Interactive session test
curl -X POST https://cloud-code-staging.finhub.workers.dev/interactive/start \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello", "repository": {"url": "https://github.com/owner/repo", "name": "owner/repo"}}'
```

### Pre-Production Checklist
Before promoting to production:
- [ ] All smoke tests pass
- [ ] Interactive mode works end-to-end
- [ ] GitHub webhooks process correctly
- [ ] Multi-turn conversations work
- [ ] No errors in logs
- [ ] Performance acceptable

## Rollback

If staging deployment has issues:
```bash
# List versions
npx wrangler versions list --env staging

# Rollback
npx wrangler versions rollback <version-id> --env staging
```

## Troubleshooting

### Secrets not configured
If health check shows `claudeApiKey: not configured`:
```bash
npx wrangler secret put ANTHROPIC_API_KEY --env staging
```

### Container not spawning
Check container logs:
```bash
npx wrangler tail --env staging
```

### GitHub webhooks failing
Verify GitHub App configuration includes staging webhook URL:
- Staging webhook URL: `https://cloud-code-staging.finhub.workers.dev/webhooks/github`

## Differences from Production

| Aspect | Staging | Production |
|--------|---------|------------|
| URL | `-staging` suffix | production domain |
| KV Namespace | Separate ID | Separate ID |
| Worker Name | `cloud-code-staging` | `cloud-code` |
| Container Name | `cloud-code-staging` | `cloud-code` |
| Secrets | Same as prod | Production values |
| GitHub App | Same app | Same app |
| Max Instances | 10 | 10 |

## Promotion to Production

After successful staging testing:

1. Merge `develop` to `main`
2. Deploy to production:
   ```bash
   npm run deploy
   ```
3. Run production smoke tests
4. Monitor for issues
