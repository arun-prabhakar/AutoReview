import { getPool } from "./index.js";

type Row = Record<string, unknown>;

type BindParams = unknown[];

export async function run(sql: string, params: BindParams = []): Promise<void> {
  await getPool().query(sql, params);
}

export async function all<T extends Row = Row>(sql: string, params: BindParams = []): Promise<T[]> {
  const result = await getPool().query(sql, params);
  return result.rows as T[];
}

export async function get<T extends Row = Row>(sql: string, params: BindParams = []): Promise<T | undefined> {
  const result = await getPool().query(sql, params);
  return result.rows[0] as T | undefined;
}
