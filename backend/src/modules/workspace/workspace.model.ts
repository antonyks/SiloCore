import { Prisma } from '@prisma/client';

export const WorkspaceSelectFields = {
  id: true,
  name: true,
  type: true,
  status: true,
  ownerUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type SelectedWorkspace = Prisma.WorkspaceGetPayload<{
  select: typeof WorkspaceSelectFields;
}>;
