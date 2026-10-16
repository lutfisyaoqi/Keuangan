// Vercel maps every /api/* request to this catch-all function. Keep the
// original URL intact so Express can dispatch /api/auth/* and other routes.
import app from '../server';

export default app;
