import type { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const { method, originalUrl, ip } = req;

  // Mask any query parameters that could hold sensitive tokens
  const sanitizedUrl = originalUrl.replace(/([?&](?:token|key|secret)=)[^&]+/gi, '$1***');

  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    
    // Only log essential routing telemetry, never request/response bodies or auth headers
    const logLine = `[${new Date().toISOString()}] ${method} ${sanitizedUrl} ${statusCode} - ${duration}ms (${ip})`;
    if (statusCode >= 500) {
      console.error(logLine);
    } else if (statusCode >= 400) {
      console.warn(logLine);
    } else {
      console.log(logLine);
    }
  });

  next();
}
