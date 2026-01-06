# Staging Environment Configuration

This file contains environment-specific configuration for staging.

## Deployment

Deploy to staging:
```bash
npm run deploy:staging
```

## Staging URL

https://cloud-code-staging.finhub.workers.dev

## Environment Variables

Staging uses the same secrets as production. Set them with:
```bash
wrangler secret put ENCRYPTION_KEY --env staging
```

## Differences from Production

| Feature | Production | Staging |
|---------|-----------|---------|
| URL | `cloud-code.finhub.workers.dev` | `cloud-code-staging.finhub.workers.dev` |
| Rate Limits | Standard | 2x production |
| Quotas | Standard | 2x production |
| Debug Logging | Disabled | Enabled |

## Testing on Staging

Run E2E tests against staging:
```bash
CLOUD_CODE_WORKER_URL=https://cloud-code-staging.finhub.workers.dev npm run test:e2e
```

## Rollback Procedure

If staging deployment fails:
```bash
wrangler versions list
wrangler rollback <version-id>
```
