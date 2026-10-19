const secretEnvironmentVariables = [
  'DATABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'AUTH_SECRET',
  'CRON_SECRET',
  'GEMINI_API_KEY',
] as const;

function sanitizeErrorMessage(message: string) {
  let sanitized = message;
  for (const name of secretEnvironmentVariables) {
    const value = process.env[name];
    if (value && value.length >= 4) sanitized = sanitized.replaceAll(value, '[REDACTED]');
  }
  return sanitized
    .replace(/(postgres(?:ql)?:\/\/)[^\s"'`]+/gi, '$1[REDACTED]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[REDACTED]')
    .slice(0, 1000);
}

export function logServerError(context: string, error: unknown) {
  const details: string[] = [];
  const seen = new Set<object>();
  let current: unknown = error;

  while (current && typeof current === 'object' && !seen.has(current) && details.length < 3) {
    seen.add(current);
    const item = current as { name?: unknown; message?: unknown; code?: unknown; cause?: unknown };
    const name = typeof item.name === 'string' ? item.name : 'Error';
    const message = typeof item.message === 'string' ? sanitizeErrorMessage(item.message) : 'No error message';
    const code = typeof item.code === 'string' ? ` [${item.code}]` : '';
    details.push(`${name}${code}: ${message}`);
    current = item.cause;
  }

  console.error(`${context}: ${details.join(' <- ') || 'Unknown error'}`);
}
