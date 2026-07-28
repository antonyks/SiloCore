import {
  Prisma,
  PrismaClient,
  Workspace,
  WorkspaceMembership,
  WorkspaceMembershipRole,
  WorkspaceMembershipStatus,
  WorkspaceStatus,
  WorkspaceType,
} from '@prisma/client';
import { prisma } from '../../config/database';

type WorkspaceProvisioningClient = PrismaClient | Prisma.TransactionClient;

export interface PersonalWorkspaceProvisioningResult {
  workspace: Workspace;
  ownerMembership: WorkspaceMembership;
  workspaceCreated: boolean;
  workspaceUpdated: boolean;
  membershipCreated: boolean;
  membershipUpdated: boolean;
}

export interface PersonalWorkspaceBackfillResult {
  usersProcessed: number;
  workspacesCreated: number;
  workspacesUpdated: number;
  membershipsCreated: number;
  membershipsUpdated: number;
}

const PERSONAL_WORKSPACE_NAME = 'Personal Workspace';

export const WorkspaceProvisioningService = {
  async ensurePersonalWorkspaceForUser(
    userId: number,
    db: WorkspaceProvisioningClient = prisma,
  ): Promise<PersonalWorkspaceProvisioningResult> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new Error(`Cannot provision personal workspace for missing user ${userId}.`);
    }

    let workspaceCreated = false;
    let workspaceUpdated = false;
    let membershipCreated = false;
    let membershipUpdated = false;

    let workspace = await db.workspace.findFirst({
      where: {
        ownerUserId: userId,
        type: WorkspaceType.PERSONAL,
      },
    });

    if (!workspace) {
      try {
        workspace = await db.workspace.create({
          data: {
            name: PERSONAL_WORKSPACE_NAME,
            type: WorkspaceType.PERSONAL,
            status: WorkspaceStatus.ACTIVE,
            ownerUserId: userId,
          },
        });
        workspaceCreated = true;
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }

        workspace = await db.workspace.findFirst({
          where: {
            ownerUserId: userId,
            type: WorkspaceType.PERSONAL,
          },
        });

        if (!workspace) {
          throw error;
        }
      }
    }

    if (workspace.status !== WorkspaceStatus.ACTIVE) {
      workspace = await db.workspace.update({
        where: { id: workspace.id },
        data: { status: WorkspaceStatus.ACTIVE },
      });
      workspaceUpdated = true;
    }

    const conflictingOwnerMembership = await db.workspaceMembership.findFirst({
      where: {
        workspaceId: workspace.id,
        role: WorkspaceMembershipRole.OWNER,
        status: WorkspaceMembershipStatus.ACTIVE,
        NOT: {
          userId,
        },
      },
    });

    if (conflictingOwnerMembership) {
      throw new Error(
        `Workspace ${workspace.id} has an active OWNER membership for user ${conflictingOwnerMembership.userId}, not canonical owner ${userId}.`,
      );
    }

    const existingOwnerUserMembership = await db.workspaceMembership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId,
        },
      },
    });

    let ownerMembership: WorkspaceMembership;

    if (!existingOwnerUserMembership) {
      ownerMembership = await db.workspaceMembership.create({
        data: {
          workspaceId: workspace.id,
          userId,
          role: WorkspaceMembershipRole.OWNER,
          status: WorkspaceMembershipStatus.ACTIVE,
        },
      });
      membershipCreated = true;
    } else if (
      existingOwnerUserMembership.role !== WorkspaceMembershipRole.OWNER ||
      existingOwnerUserMembership.status !== WorkspaceMembershipStatus.ACTIVE
    ) {
      ownerMembership = await db.workspaceMembership.update({
        where: { id: existingOwnerUserMembership.id },
        data: {
          role: WorkspaceMembershipRole.OWNER,
          status: WorkspaceMembershipStatus.ACTIVE,
        },
      });
      membershipUpdated = true;
    } else {
      ownerMembership = existingOwnerUserMembership;
    }

    return {
      workspace,
      ownerMembership,
      workspaceCreated,
      workspaceUpdated,
      membershipCreated,
      membershipUpdated,
    };
  },

  async backfillPersonalWorkspaces(
    db: WorkspaceProvisioningClient = prisma,
  ): Promise<PersonalWorkspaceBackfillResult> {
    const users = await db.user.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    const result: PersonalWorkspaceBackfillResult = {
      usersProcessed: 0,
      workspacesCreated: 0,
      workspacesUpdated: 0,
      membershipsCreated: 0,
      membershipsUpdated: 0,
    };

    for (const user of users) {
      const provisioningResult = await this.ensurePersonalWorkspaceForUser(user.id, db);

      result.usersProcessed += 1;
      result.workspacesCreated += provisioningResult.workspaceCreated ? 1 : 0;
      result.workspacesUpdated += provisioningResult.workspaceUpdated ? 1 : 0;
      result.membershipsCreated += provisioningResult.membershipCreated ? 1 : 0;
      result.membershipsUpdated += provisioningResult.membershipUpdated ? 1 : 0;
    }

    return result;
  },
};

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
