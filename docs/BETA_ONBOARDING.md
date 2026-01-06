# Beta User Onboarding Guide

**Claude Code on Cloudflare Workers - Private Beta**

## Welcome to the Beta! 👋

Thank you for joining our private beta program. This guide will help you get started with Claude Code automated issue processing.

---

## Quick Start Checklist

### Step 1: Access the Application

- **Production**: https://cloud-code.finhub.workers.dev
- **Staging**: https://cloud-code-staging.finhub.workers.dev

Choose your environment and bookmark the URL.

---

### Step 2: Configure Claude API

1. Navigate to `/claude-setup` on your worker URL
2. Get your Anthropic API key from https://console.anthropic.com/
3. Enter the key and save
4. You should see a confirmation message

**Note:** Your API key is encrypted with AES-256-GCM before storage.

---

### Step 3: Install GitHub App

1. Navigate to `/gh-setup` on your worker URL
2. Click "Install GitHub App"
3. Authorize the application
4. Select the repositories you want Claude Code to access

**Required Permissions:**
- Read/write access to code
- Issue management
- Pull request creation

---

### Step 4: Test the Integration

Create a test issue in any connected repository:

```
Title: Test Claude Code

Body: Add a simple console.log statement to the main file
```

**What to expect:**
1. Claude acknowledges with a comment within 10 seconds
2. Processing begins (cloning repo, analyzing code)
3. A pull request is created with the solution
4. Final comment marks completion

**Processing time:** Typically 30-60 seconds for simple tasks.

---

## Features Available in Beta

### ✅ GitHub Issue Processing
- Automatic issue analysis
- Code generation and fixes
- Pull request creation
- Progress comments

### ✅ Interactive Mode
- Real-time Claude sessions
- Streaming output
- Direct repository manipulation

**To use:**
```bash
curl -N -X POST https://your-worker.workers.dev/interactive/start \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Your question here","options":{"maxTurns":1}}'
```

### ✅ Dashboard
- View system status
- Monitor active sessions
- Check GitHub integration status

Access at: `/dashboard/`

---

## Limits and Quotas (Beta)

| Resource | Limit |
|----------|-------|
| Daily tokens | 1,000,000 |
| Daily cost | $50 USD |
| Concurrent sessions | 5 |
| Requests per minute | 60 |
| Requests per hour | 1,000 |

---

## Known Limitations

### Current Limitations
- Single-user architecture (no multi-user support yet)
- No persistent session history beyond 24 hours
- Interactive sessions timeout after 45 seconds of inactivity
- Maximum repository size: ~500MB (due to container constraints)

### Working on It
- Multi-user authentication
- Persistent chat history
- Webhook event replay
- Custom .claude.md instructions per repository

---

## Troubleshooting

### Issue: "Claude API key not configured"

**Solution:** Visit `/claude-setup` and enter your Anthropic API key.

---

### Issue: GitHub webhooks not triggering

**Solution:**
1. Check `/gh-status` - both GitHub App and Claude Config should show "configured": true
2. Verify repository is selected in GitHub App settings
3. Check webhook delivery logs in repository settings

---

### Issue: Pull request not created

**Solution:**
1. Check the issue comments for error messages
2. Verify repository has appropriate permissions
3. Check `/health` endpoint for system status

---

### Issue: Container errors

**Solution:**
1. Check `/health` for container status
2. Try again (containers auto-retry)
3. Report persistent issues with details

---

## Getting Help

### Report Issues

Please report bugs and issues with:
1. Steps to reproduce
2. Expected vs actual behavior
3. System status from `/health`
4. Browser console errors (if UI related)

### Feedback Channels

- **GitHub Issues**: https://github.com/Andrejs1979/cloud-code/issues
- **Discussions**: https://github.com/Andrejs1979/cloud-code/discussions

### What Feedback We Want

- Feature requests
- Bug reports
- UX improvements
- Performance issues
- Security concerns

---

## Beta Timeline

| Phase | Dates | Focus |
|-------|-------|-------|
| Week 1 | Current | Onboarding, basic issue processing |
| Week 2 | Jan 13-17 | Interactive mode, feedback collection |
| Week 3 | Jan 20-24 | Bug fixes, feature refinements |
| Week 4 | Jan 27-31 | Performance optimization |

---

## Safety & Privacy

### Data Handling
- Your code is processed in ephemeral containers
- No code is stored after processing
- API keys are encrypted at rest
- Webhook signatures are verified

### Best Practices
- Don't expose sensitive API keys in issues
- Use separate branches for testing
- Review Claude's pull requests before merging
- Keep your Anthropic API key secure

---

## Next Steps

1. ✅ Complete setup (Steps 1-4 above)
2. ✅ Create your first test issue
3. ✅ Try interactive mode
4. ✅ Explore the dashboard
5. ✅ Share feedback!

---

**Thank you for being an early user! Your feedback shapes the future of this product.**
