import type { Request, Response, NextFunction } from 'express';
import type { AnyZodObject } from 'zod';

export function validate(schema: AnyZodObject) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      if ('body' in parsed) {
        req.body = (parsed as { body?: unknown }).body;
      }
      if ('query' in parsed) {
        req.query = (parsed as { query?: typeof req.query }).query ?? req.query;
      }
      if ('params' in parsed) {
        req.params = (parsed as { params?: typeof req.params }).params ?? req.params;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
