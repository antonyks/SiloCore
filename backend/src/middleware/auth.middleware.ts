import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { WorkspaceStatus } from '@prisma/client';
import { SelectedUser, UserRole, UserStatus } from '../modules/user/user.model';
import { AuthenticationError, NotFoundError } from '../errors'
import {AuthenticatedRequest} from '../types/authenticatedRequest'
import { prisma } from '../config/database';
import { CoreSingleOwnerWorkspaceAuthorizationPolicy } from '../modules/workspace';

type AuthTokenPayload = {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
};

const WORKSPACE_NOT_FOUND_MESSAGE = 'Workspace not found';
const workspaceAuthorizationPolicy = new CoreSingleOwnerWorkspaceAuthorizationPolicy();

function getWorkspaceHeaderValue(req: AuthenticatedRequest): string | null {
    const headerValue = req.headers['x-workspace-id'] ?? req.headers['X-Workspace-Id'];

    if (typeof headerValue !== 'string') {
      return null;
    }

    const trimmedValue = headerValue.trim();

    return trimmedValue.length > 0 ? trimmedValue : null;
}

function parseWorkspaceId(req: AuthenticatedRequest): number {
    const workspaceIdValue = getWorkspaceHeaderValue(req);

    if (!workspaceIdValue || !/^\d+$/.test(workspaceIdValue)) {
      throw new NotFoundError(WORKSPACE_NOT_FOUND_MESSAGE);
    }

    const workspaceId = Number(workspaceIdValue);

    if (!Number.isSafeInteger(workspaceId) || workspaceId <= 0) {
      throw new NotFoundError(WORKSPACE_NOT_FOUND_MESSAGE);
    }

    return workspaceId;
}

async function attachWorkspaceContext(req: AuthenticatedRequest): Promise<void> {
    const workspaceId = parseWorkspaceId(req);
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        status: WorkspaceStatus.ACTIVE,
      },
      select: {
        id: true,
        name: true,
        ownerUserId: true,
        type: true,
        status: true,
      },
    });

    if (!workspace) {
      throw new NotFoundError(WORKSPACE_NOT_FOUND_MESSAGE);
    }

    const actor = workspaceAuthorizationPolicy.resolveActor(req.user);
    const accessDecision = workspaceAuthorizationPolicy.checkWorkspaceAccess(actor, workspace);

    if (!accessDecision.allowed || !actor) {
      throw new NotFoundError(WORKSPACE_NOT_FOUND_MESSAGE);
    }

    req.workspace = workspace;
    req.workspaceActor = actor;
}

export const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {

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
    await attachWorkspaceContext(req);

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
