import { db } from "../client";
import { hashApiKey, verifyApiKey } from "../../auth/apikey";
import { nowIso } from "../../utils/time";
import type { Workspace } from "../../types";

export class WorkspaceRepository {
  upsertWorkspace(id: string, name: string, apiKey: string): Workspace {
    const ts = nowIso();
    const hash = hashApiKey(apiKey);
    db.query(
      `INSERT INTO workspaces (id, name, api_key_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         api_key_hash = excluded.api_key_hash,
         updated_at = excluded.updated_at`,
    ).run(id, name, hash, ts, ts);

    return this.getWorkspace(id)!;
  }

  getWorkspace(id: string): Workspace | null {
    return (
      db
        .query("SELECT * FROM workspaces WHERE id = ?")
        .get(id) as Workspace | null
    );
  }

  verifyWorkspaceApiKey(id: string, apiKey: string): boolean {
    const row = db
      .query("SELECT api_key_hash FROM workspaces WHERE id = ?")
      .get(id) as { api_key_hash: string } | null;

    if (!row) {
      return false;
    }
    return verifyApiKey(apiKey, row.api_key_hash);
  }
}
