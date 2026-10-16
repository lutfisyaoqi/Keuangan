// Vercel deploys this explicit function at /api/index. The rewrite below
// passes every API path through __api_path so Express receives the original
// /api/* route, including nested auth and admin endpoints.
import type { Request, Response } from 'express';

export default async function handler(req: Request, res: Response) {
  const requestUrl = new URL(req.url ?? '/api/index', 'http://vercel.local');
  const apiPath = requestUrl.searchParams.get('__api_path');

  if (
    !apiPath ||
    apiPath.startsWith('/') ||
    apiPath.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    return res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
  }

  requestUrl.searchParams.delete('__api_path');
  req.url = `/api/${apiPath}${requestUrl.search}`;
  try {
    const { default: app } = await import('../server');
    return app(req, res);
  } catch (error) {
    console.error('Vercel API app initialization failed:', error);
    return res.status(503).json({ error: 'Layanan belum siap. Periksa log fungsi Vercel.' });
  }
}
