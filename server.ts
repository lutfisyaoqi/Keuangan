import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { closeApiResources } from './server/api.js';
import app from './server/app.js';

const PORT = Number(process.env.PORT) || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup Vite or static serving
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(__dirname, 'dist');

  let closeViteServer: (() => Promise<void>) | undefined;
  if (isProd && fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  } else {
    // Keep Vite out of serverless API imports; it is only needed locally.
    const { createServer: createViteServer } = await import('vite');
    const viteServer = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    closeViteServer = () => viteServer.close();
    app.use(viteServer.middlewares);
  }

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    const type = error && typeof error === 'object' ? (error as { type?: unknown }).type : undefined;
    const status = type === 'entity.too.large' ? 413 : type === 'entity.parse.failed' ? 400 : 500;
    if (status === 500) console.error('Unhandled request error');
    res.status(status).json({ error: status === 413 ? 'Isi permintaan terlalu besar.' : status === 400 ? 'Format JSON tidak valid.' : 'Terjadi kesalahan internal.' });
  });

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`CatatUang server running at ${process.env.APP_URL || `http://localhost:${PORT}`}`);
  });

  const shutdown = () => {
    httpServer.close(() => {
      void closeViteServer?.();
      void closeApiResources().catch(() => {
        console.error('Failed to close the PostgreSQL session pool cleanly.');
      });
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (process.env.VERCEL !== '1' && !process.env.VERCEL_ENV) {
  void startServer().catch(async (error: unknown) => {
    await closeApiResources().catch(() => undefined);
    console.error(error instanceof Error ? error.message : 'Server startup failed.');
    process.exitCode = 1;
  });
}
