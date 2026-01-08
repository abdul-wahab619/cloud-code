import { logWithContext } from "../log";

/**
 * Generate GitHub App installation URL
 * This redirects users to GitHub's app installation page where they can select additional repos
 */
export async function handleAddRepositories(request: Request, origin: string, env: any): Promise<Response> {
  logWithContext('ADD_REPOS', 'Handling add repositories request', { origin });

  try {
    // Get the current GitHub App configuration
    const configId = (env.GITHUB_APP_CONFIG as any).idFromName('github-app-config');
    const configDO = (env.GITHUB_APP_CONFIG as any).get(configId);

    const response = await configDO.fetch(new Request('http://internal/get'));
    const config = await response.json().catch(() => null);

    if (!config || !config.appId) {
      return new Response(JSON.stringify({
        error: 'GitHub App not configured. Please complete the initial setup first.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get installation token for API call
    const tokenResponse = await configDO.fetch(new Request('http://internal/get-installation-token'));
    const tokenData = tokenResponse.ok ? await tokenResponse.json() as { token: string } : null;

    let appSlug: string | null = null;

    // Try to get the app slug from GitHub API
    if (tokenData?.token) {
      try {
        const ghResponse = await fetch('https://api.github.com/app', {
          headers: {
            'Authorization': `Bearer ${tokenData.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Worker-GitHub-Integration'
          }
        });

        if (ghResponse.ok) {
          const appData = await ghResponse.json() as any;
          appSlug = appData.slug;
          logWithContext('ADD_REPOS', 'App slug retrieved', { appSlug });
        }
      } catch (e) {
        logWithContext('ADD_REPOS', 'Failed to get app slug from GitHub API', {
          error: e instanceof Error ? e.message : String(e)
        });
      }
    }

    // If we couldn't get the slug, use a generic installation URL
    // User will need to select the app manually
    const installUrl = appSlug
      ? `https://github.com/apps/${appSlug}/installations/new?state=${encodeURIComponent(origin + '/gh-setup/repo-callback')}`
      : `https://github.com/settings/installations/${config.installationId}`;

    logWithContext('ADD_REPOS', 'Generated installation URL', {
      hasAppSlug: !!appSlug,
      installUrl: appSlug ? installUrl : 'GitHub settings page'
    });

    // Create HTML page with redirect to GitHub installation
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Add Repositories - Claude Code</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 600px;
            margin: 40px auto;
            padding: 20px;
            text-align: center;
            line-height: 1.6;
            color: #333;
        }
        .header {
            margin-bottom: 30px;
        }
        .header h1 {
            color: #0969da;
        }
        .info-box {
            background: #f5f5f5;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .add-btn {
            display: inline-block;
            background: #238636;
            color: white;
            padding: 14px 28px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            font-size: 16px;
            margin: 20px 0;
            transition: background 0.2s;
        }
        .add-btn:hover {
            background: #2ea043;
        }
        .cancel-link {
            display: inline-block;
            margin-top: 20px;
            color: #666;
            text-decoration: none;
        }
        .cancel-link:hover {
            text-decoration: underline;
        }
        .current-repos {
            text-align: left;
            background: #fff;
            padding: 15px;
            border-radius: 6px;
            border: 1px solid #ddd;
        }
        .repo-item {
            padding: 8px 0;
            border-bottom: 1px solid #eee;
        }
        .repo-item:last-child {
            border-bottom: none;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Add Repositories</h1>
        <p>Select additional repositories to connect to Claude Code</p>
    </div>

    <div class="info-box">
        <h3>Current Repositories (${config.repositories?.length || 0})</h3>
        <div class="current-repos">
            ${config.repositories && config.repositories.length > 0
              ? config.repositories.map((r: any) => `<div class="repo-item">📁 ${r.full_name || r.name}</div>`).join('')
              : '<div class="repo-item">No repositories connected yet</div>'
            }
        </div>
    </div>

    <p>Click the button below to open GitHub where you can select additional repositories.</p>
    <p><strong>Note:</strong> This will open GitHub in a new tab. After adding repositories, return here and click "Refresh".</p>

    <a href="${installUrl}" target="_blank" class="add-btn">
        + Add Repositories on GitHub
    </a>

    <a href="/" class="cancel-link">← Back to Dashboard</a>

    <script>
        // Check if we're returning from installation
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('refresh') === 'true') {
            const message = document.createElement('div');
            message.style.cssText = 'background: #d4edda; color: #155724; padding: 15px; border-radius: 6px; margin: 20px 0;';
            message.textContent = '✓ Repositories updated! Please refresh the page.';
            document.querySelector('.info-box').before(message);

            setTimeout(() => {
                window.location.href = '/';
            }, 3000);
        }
    </script>
</body>
</html>`;

    return new Response(html, {
      headers: { 'Content-Type': 'text/html' }
    });

  } catch (error) {
    logWithContext('ADD_REPOS', 'Error handling add repositories', {
      error: error instanceof Error ? error.message : String(error)
    });

    return new Response(JSON.stringify({
      error: 'Failed to generate installation URL'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle callback after repository installation on GitHub
 * This endpoint refreshes the repository list and redirects back to the app
 */
export async function handleRepoCallback(request: Request, url: URL, env: any): Promise<Response> {
  logWithContext('REPO_CALLBACK', 'Handling repository installation callback', {
    hasInstallationId: !!url.searchParams.get('installation_id')
  });

  try {
    const installationId = url.searchParams.get('installation_id');

    if (!installationId) {
      return new Response('Missing installation_id parameter', { status: 400 });
    }

    // Update the stored configuration with the new installation
    const configId = (env.GITHUB_APP_CONFIG as any).idFromName('github-app-config');
    const configDO = (env.GITHUB_APP_CONFIG as any).get(configId);

    // Fetch and update repositories
    await configDO.fetch(new Request('http://internal/sync-installation', {
      method: 'POST',
      body: JSON.stringify({ installationId })
    }));

    logWithContext('REPO_CALLBACK', 'Repositories synced successfully', { installationId });

    // Redirect back to the add repositories page with success flag
    const origin = url.origin;
    return Response.redirect(`${origin}/gh-setup/add-repositories?success=true&installation_id=${installationId}`, 302);

  } catch (error) {
    logWithContext('REPO_CALLBACK', 'Error in repo callback', {
      error: error instanceof Error ? error.message : String(error)
    });

    // Redirect with error flag
    const origin = url.origin;
    return Response.redirect(`${origin}/gh-setup/add-repositories?error=true`, 302);
  }
}

/**
 * Refresh repositories from GitHub installation
 * Fetches the current list of repositories from GitHub and updates the stored config
 */
export async function handleRefreshRepositories(request: Request, env: any): Promise<Response> {
  logWithContext('REFRESH_REPOS', 'Handling repositories refresh request');

  try {
    const configId = (env.GITHUB_APP_CONFIG as any).idFromName('github-app-config');
    const configDO = (env.GITHUB_APP_CONFIG as any).get(configId);

    // Trigger a sync with GitHub
    const syncResponse = await configDO.fetch(new Request('http://internal/sync-installation', {
      method: 'POST'
    }));

    if (!syncResponse.ok) {
      throw new Error('Failed to sync repositories');
    }

    const syncData = await syncResponse.json();
    const repoCount = syncData.repositories?.length || 0;

    logWithContext('REFRESH_REPOS', 'Repositories refreshed successfully', { repoCount });

    return new Response(JSON.stringify({
      success: true,
      repositoryCount: repoCount,
      repositories: syncData.repositories
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    logWithContext('REFRESH_REPOS', 'Error refreshing repositories', {
      error: error instanceof Error ? error.message : String(error)
    });

    return new Response(JSON.stringify({
      error: 'Failed to refresh repositories'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
