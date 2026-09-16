import type { Database } from "sql.js";

export function queryRows(db: Database, sql: string, params: unknown[] = []): Array<Record<string, unknown>> {
  const statement = db.prepare(sql);
  try {
    statement.bind(params as any);
    const rows: Array<Record<string, unknown>> = [];
    while (statement.step()) rows.push(statement.getAsObject() as Record<string, unknown>);
    return rows;
  } finally {
    statement.free();
  }
}

export function queryOne(db: Database, sql: string, params: unknown[] = []): Record<string, unknown> | null {
  const rows = queryRows(db, sql, params);
  return rows[0] || null;
}

export function asString(value: unknown, fallback = ""): string {
  return value === null || value === undefined ? fallback : String(value);
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
