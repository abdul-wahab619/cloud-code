import { logWithContext } from "../log";
import { handleInstallationEvent, handleInstallationRepositoriesEvent, handleIssuesEvent } from "./github_webhooks";

// Route webhook events to specific handlers
async function routeWebhookEvent(event: string, data: any, configDO: any, env: any): Promise<Response> {
  logWithContext('EVENT_ROUTER', 'Routing webhook event', {
    event,
    action: data.action,
    repository: data.repository?.full_name
  });

  switch (event) {
    case 'installation':
      return handleInstallationEvent(data, configDO);

    case 'installation_repositories':
      return handleInstallationRepositoriesEvent(data, configDO);

    case 'issues':
      return handleIssuesEvent(data, env, configDO);

    default:
      logWithContext('EVENT_ROUTER', 'Unhandled webhook event', {
        event,
        availableEvents: ['installation', 'installation_repositories', 'issues']
      });
      return new Response('Event acknowledged', { status: 200 });
  }
}

// HMAC-SHA256 signature verification for GitHub webhooks
async function verifyGitHubSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }

  const sigHex = signature.replace('sha256=', '');

  // Create HMAC-SHA256 hash
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const messageBuffer = new TextEncoder().encode(payload);
  const hashBuffer = await crypto.subtle.sign('HMAC', key, messageBuffer);
  const hashArray = new Uint8Array(hashBuffer);
  const computedHex = Array.from(hashArray)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison
  return sigHex === computedHex;
}

// Main webhook processing handler
export async function handleGitHubWebhook(request: Request, env: any): Promise<Response> {
  const startTime = Date.now();

  try {
    // Get webhook payload and headers
    const payload = await request.text();
    const signature = request.headers.get('x-hub-signature-256');
    const event = request.headers.get('x-github-event');
    const delivery = request.headers.get('x-github-delivery');

    logWithContext('WEBHOOK', 'Received GitHub webhook', {
      event,
      delivery,
      hasSignature: !!signature,
      payloadSize: payload.length,
      headers: {
        userAgent: request.headers.get('user-agent'),
        contentType: request.headers.get('content-type')
      }
    });

    if (!signature || !event || !delivery) {
      logWithContext('WEBHOOK', 'Missing required webhook headers', {
        hasSignature: !!signature,
        hasEvent: !!event,
        hasDelivery: !!delivery
      });
      return new Response('Missing required headers', { status: 400 });
    }

    // Parse the payload to get app/installation info
    let webhookData;
    try {
      webhookData = JSON.parse(payload);
      logWithContext('WEBHOOK', 'Webhook payload parsed successfully', {
        hasInstallation: !!webhookData.installation,
        hasRepository: !!webhookData.repository,
        action: webhookData.action
      });
    } catch (error) {
      logWithContext('WEBHOOK', 'Invalid JSON payload', {
        error: error instanceof Error ? error.message : String(error),
        payloadPreview: payload.substring(0, 200)
      });
      return new Response('Invalid JSON payload', { status: 400 });
    }

    // Handle ping webhooks early - they don't need installation info or signature verification
    if (event === 'ping') {
      logWithContext('WEBHOOK', 'Received ping webhook', {
        zen: webhookData.zen,
        hookId: webhookData.hook_id
      });
      return new Response(JSON.stringify({
        message: 'Webhook endpoint is active',
        zen: webhookData.zen
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Since we store config at a well-known 'github-app-config' ID, use that directly
    // This allows us to handle webhooks from any app installation for this worker
    const configStorageId = 'github-app-config';
    logWithContext('WEBHOOK', 'Using well-known config storage ID', { configStorageId });

    // Get app configuration and decrypt webhook secret
    const id = (env.GITHUB_APP_CONFIG as any).idFromName(configStorageId);
    const configDO = (env.GITHUB_APP_CONFIG as any).get(id);

    const configResponse = await configDO.fetch(new Request('http://internal/get-credentials'));

    logWithContext('WEBHOOK', 'Config DO response', {
      status: configResponse.status,
      configStorageId
    });

    if (!configResponse.ok) {
      logWithContext('WEBHOOK', 'No app configuration found', { configStorageId });
      return new Response('App not configured', { status: 404 });
    }

    const credentials = await configResponse.json();
    if (!credentials || !credentials.webhookSecret) {
      logWithContext('WEBHOOK', 'No webhook secret found', {
        configStorageId,
        hasCredentials: !!credentials,
        credentialKeys: credentials ? Object.keys(credentials) : []
      });
      return new Response('Webhook secret not found', { status: 500 });
    }

    logWithContext('WEBHOOK', 'Webhook secret retrieved successfully');

    // Verify the webhook signature
    logWithContext('WEBHOOK', 'Verifying webhook signature');

    const isValid = await verifyGitHubSignature(payload, signature, credentials.webhookSecret);

    logWithContext('WEBHOOK', 'Signature verification result', { isValid });

    if (!isValid) {
      logWithContext('WEBHOOK', 'Invalid webhook signature', {
        signaturePrefix: signature.substring(0, 15) + '...',
        delivery
      });
      return new Response('Invalid signature', { status: 401 });
    }

    // Log successful webhook delivery
    await configDO.fetch(new Request('http://internal/log-webhook', {
      method: 'POST',
      body: JSON.stringify({ event, delivery, timestamp: new Date().toISOString() })
    }));

    // Route to appropriate event handler
    logWithContext('WEBHOOK', 'Routing to event handler', { event });

    const eventResponse = await routeWebhookEvent(event, webhookData, configDO, env);

    const processingTime = Date.now() - startTime;
    logWithContext('WEBHOOK', 'Webhook processing completed', {
      event,
      delivery,
      processingTimeMs: processingTime,
      responseStatus: eventResponse.status
    });

    return eventResponse;

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logWithContext('WEBHOOK', 'Webhook processing error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      processingTimeMs: processingTime
    });
    return new Response('Internal server error', { status: 500 });
  }
}