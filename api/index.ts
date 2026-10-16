// Vercel deploys this explicit function at /api/index. The rewrite below
// passes every API path through __api_path so Express receives the original
// /api/* route, including nested auth and admin endpoints.
import app from '../server';
import type { Request, Response } from 'express';

export default function handler(req: Request, res: Response) {
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
  return app(req, res);
}
