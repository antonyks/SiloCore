import { Prisma } from '@prisma/client';

export const AdminWorkspaceMetadataSelectFields = {
  id: true,
  name: true,
  type: true,
  status: true,
  ownerUserId: true,
  createdAt: true,
  updatedAt: true,
  owner: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
} as const;

export type AdminWorkspaceMetadata = Prisma.WorkspaceGetPayload<{
  select: typeof AdminWorkspaceMetadataSelectFields;
}>;
