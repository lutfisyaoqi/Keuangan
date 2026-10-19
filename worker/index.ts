import express from 'express';
import { httpServerHandler } from 'cloudflare:node';
import { env } from 'cloudflare:workers';
import { createApiRouter } from '../server/api.js';

const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.json({ limit: '32kb' }));
app.use('/api', createApiRouter({
  databaseUrl: env.HYPERDRIVE.connectionString,
  poolMax: 1,
}));

app.listen(3000);

export default httpServerHandler({ port: 3000 });
