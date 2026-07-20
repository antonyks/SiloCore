import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { SelectedUser, UserRole, UserStatus } from '../modules/user/user.model';
import { AuthenticationError } from '../errors'
import {AuthenticatedRequest} from '../types/authenticatedRequest'

type AuthTokenPayload = {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
};

export const authenticate = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Unauthorized: Missing or invalid Authorization header');
    }

    const token = authHeader.split(' ')[1];
    const JWT_SECRET:string = process.env.JWT_SECRET as string;

    let decoded: AuthTokenPayload;

    try {
      decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    } catch {
      throw new AuthenticationError('Unauthorized: Invalid or expired JWT token');
    }

    const user:SelectedUser=decoded;
    req.user = { token:token,...user};

    next();

};

export const authorizeRoles =
  (...allowedRoles: UserRole[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (req.user) {
      const user:SelectedUser = req.user;
      if (!user) throw new AuthenticationError('Unauthorized');

      if (!allowedRoles.includes(user.role)) {
        throw new AuthenticationError('Forbidden: Insufficient privileges');
      }
    }
    

    next();
  };

  export {Request, Response}
