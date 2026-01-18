/**
 * Error ID constants for Sentry tracking
 * These IDs help categorize and track errors in production
 */
export const ErrorIds = {
  // Storage errors
  STORAGE_GET_ITEM: 'storage_get_item',
  STORAGE_SET_ITEM: 'storage_set_item',
  STORAGE_REMOVE_ITEM: 'storage_remove_item',
  STORAGE_QUOTA_EXCEEDED: 'storage_quota_exceeded',
  STORAGE_PARSE_FAILED: 'storage_parse_failed',

  // Session errors
  SESSION_LOAD_FAILED: 'session_load_failed',
  SESSION_SAVE_FAILED: 'session_save_failed',
  SESSION_EXPIRED: 'session_expired',
  SESSION_NOT_FOUND: 'session_not_found',
  SESSION_DELETE_FAILED: 'session_delete_failed',

  // Chat errors
  CHAT_SEND_TIMEOUT: 'chat_send_timeout',
  CHAT_SEND_NETWORK: 'chat_send_network',
  CHAT_SEND_AUTH: 'chat_send_auth',
  CHAT_SEND_RATE_LIMIT: 'chat_send_rate_limit',
  CHAT_SEND_SERVER: 'chat_send_server',
  CHAT_SEND_UNKNOWN: 'chat_send_unknown',

  // SSE errors
  SSE_PARSE_ERROR: 'sse_parse_error',
  SSE_CONNECTION_ERROR: 'sse_connection_error',
  SSE_INCOMPLETE_CHUNK: 'sse_incomplete_chunk',

  // Clipboard errors
  CLIPBOARD_WRITE_FAILED: 'clipboard_write_failed',
  CLIPBOARD_NOT_SUPPORTED: 'clipboard_not_supported',
} as const;

export type ErrorId = typeof ErrorIds[keyof typeof ErrorIds];
