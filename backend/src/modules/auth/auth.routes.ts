import { Router } from 'express';
import { AuthController } from './auth.controller';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  migrateBatchSchema,
} from './auth.schema';

export const authRouter = Router();

authRouter.post('/register', validate(registerSchema), AuthController.register);
authRouter.post('/login', validate(loginSchema), AuthController.login);
authRouter.post('/refresh', validate(refreshSchema), AuthController.refresh);
authRouter.post('/logout', AuthController.logout);
authRouter.get('/me', authenticate, AuthController.me);
authRouter.post(
  '/migrate-batch',
  authenticate,
  validate(migrateBatchSchema),
  AuthController.migrateBatch
);
