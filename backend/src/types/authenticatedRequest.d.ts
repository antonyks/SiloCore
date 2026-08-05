import { JwtPayload } from 'jsonwebtoken';
import { SelectedUser } from '../modules/user/user.model';
import { Request } from 'express';
import { ResolvedWorkspaceContext, WorkspaceActor } from '../modules/workspace';


export interface AuthenticatedRequest extends Request {
  user?: JwtPayload & SelectedUser;
  workspace?: ResolvedWorkspaceContext;
  workspaceActor?: WorkspaceActor;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload & SelectedUser;
      requestId?: string;
      workspace?: ResolvedWorkspaceContext;
      workspaceActor?: WorkspaceActor;
    }
  }
}

// declare module 'express' {
//   interface Request {
//     user?: JwtPayload & SelectedUser; 
//   }
// }
