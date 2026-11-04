import { app } from './app';
import { env } from './config/env';

const server = app.listen(env.PORT, () => {
  console.log(`[Cura Backend] Server listening on http://localhost:${env.PORT} in ${env.NODE_ENV} mode`);
});

// Graceful Shutdown
function handleShutdown(signal: string) {
  console.log(`\n[Cura Backend] Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('[Cura Backend] HTTP server closed.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[Cura Backend] Forced shutdown after timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
