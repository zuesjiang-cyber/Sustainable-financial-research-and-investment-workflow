import type { IncomingMessage, ServerResponse } from "node:http";
import { DEFAULT_LOCAL_WORKSPACE, WorkspaceContext } from "../repos/workspaceContext";

export class WorkspaceAuthManager {
  resolveContext(req: IncomingMessage): WorkspaceContext {
    const authHeader = req.headers["authorization"];
    const workspaceHeader = req.headers["x-workspace-id"];

    // 1. If explicit workspace header provided
    if (workspaceHeader && typeof workspaceHeader === "string") {
      const userHeader = req.headers["x-user-id"];
      return {
        workspaceId: workspaceHeader,
        userId: typeof userHeader === "string" ? userHeader : undefined,
      };
    }

    // 2. If Bearer token provided (e.g. Bearer ws_<uuid>)
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      if (token.startsWith("ws_")) {
        return {
          workspaceId: token.replace(/^ws_/, ""),
        };
      }
    }

    // 3. Local single-tenant loopback default
    return DEFAULT_LOCAL_WORKSPACE;
  }

  assertWorkspaceMatch(ctx: WorkspaceContext, targetWorkspaceId: string): void {
    if (ctx.workspaceId !== targetWorkspaceId) {
      throw new Error(`Cross-workspace access denied: ${ctx.workspaceId} cannot access ${targetWorkspaceId}`);
    }
  }
}
