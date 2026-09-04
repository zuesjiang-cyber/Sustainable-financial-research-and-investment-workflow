import type { UUID } from "../../shared/domain";

export interface WorkspaceContext {
  workspaceId: UUID;
  userId?: UUID;
}

export const DEFAULT_LOCAL_WORKSPACE: WorkspaceContext = {
  workspaceId: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
};
