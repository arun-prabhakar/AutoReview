import { getDb, persistDb } from "./index.js";
import type { SqlValue } from "sql.js";

type Row = Record<string, unknown>;

type BindParams = SqlValue[];

export async function run(sql: string, params: BindParams = []): Promise<void> {
  const db = await getDb();
  db.run(sql, params);
  persistDb();
}

export async function all<T extends Row = Row>(sql: string, params: BindParams = []): Promise<T[]> {
  const db = await getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);

  const results: T[] = [];
  const columns = stmt.getColumnNames();
  while (stmt.step()) {
    const values = stmt.get();
    const row: Row = {};
    columns.forEach((col: string, i: number) => {
      row[col] = values[i];
    });
    results.push(row as T);
  }
  stmt.free();
  return results;
}

export async function get<T extends Row = Row>(sql: string, params: BindParams = []): Promise<T | undefined> {
  const rows = await all<T>(sql, params);
  return rows[0];
}
