// Vercel routes every /api/* request through this catch-all Function. Reuse
// the Express app so local and deployed endpoints share the same handlers.
import app from '../server';

export default app;
