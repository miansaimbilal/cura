export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName?: string | null;
}

export interface JwtTokenPayload {
  userId: string;
  email: string;
  type: 'access' | 'refresh';
}
