export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
