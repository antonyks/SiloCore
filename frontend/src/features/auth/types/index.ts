import type { User } from "../../../types/user";
import { z } from 'zod';

export interface AuthResponse {
  token: string;
  data: {
    token:string,
    user: User
  }
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export const schema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1,"Password is required")
});
export type FormValues = z.infer<typeof schema>;