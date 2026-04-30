/**
 * sql-executor.ts
 * Hardened pg/Supabase SQL executor.
 * Fixes memory-trap-26-04-29 #3: command:null treated as success.
 *
 * Usage:
 *   import { execSQL } from '@/lib/sql-executor';
 *   const result = await execSQL(supabaseClient, 'INSERT INTO ...');
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface SQLResult {
  command: string;
  rowCount: number;
  rows: Record<string, unknown>[];
}

export interface SQLError {
  sql: string;
  params?: unknown[];
  pgCode?: string;
  message: string;
  detail?: string;
  hint?: string;
  constraint?: string;
}

/**
 * Execute a raw SQL statement via Supabase rpc(exec_sql).
 * Throws a detailed SQLError if:
 *  - HTTP response is not ok
 *  - pg returns command:null
 *  - rowCount is 0 for an INSERT/UPDATE/DELETE
 */
export async function execSQL(
  supabase: SupabaseClient,
  sql: string,
  params: unknown[] = []
): Promise<SQLResult> {
  const { data, error } = await supabase.rpc('exec_sql', { sql, params });

  if (error) {
    const e: SQLError = {
      sql,
      params,
      pgCode: (error as any).code,
      message: error.message,
      detail: (error as any).details,
      hint: (error as any).hint,
      constraint: (error as any).constraint,
    };
    console.error('[sql-executor] pg error:', e);
    throw e;
  }

  // Trap: command:null means pg signalled an error the client swallowed
  if (!data?.command) {
    const e: SQLError = {
      sql,
      params,
      message: `sql-executor: pg returned command:null — statement likely failed silently. Check RLS, constraints, and FK references.`,
    };
    console.error('[sql-executor] command:null trap:', e);
    throw e;
  }

  const isWrite = /^\s*(INSERT|UPDATE|DELETE)/i.test(sql);
  if (isWrite && (data.rowCount ?? 0) === 0) {
    const e: SQLError = {
      sql,
      params,
      message: `sql-executor: ${data.command} reported rowCount=0 — RLS policy or constraint may be blocking.`,
    };
    console.error('[sql-executor] zero-row write trap:', e);
    throw e;
  }

  return data as SQLResult;
}

/**
 * Run multiple SQL statements in sequence.
 * Stops and throws on first failure — no silent continuation.
 */
export async function execSQLBatch(
  supabase: SupabaseClient,
  statements: Array<{ sql: string; params?: unknown[] }>
): Promise<SQLResult[]> {
  const results: SQLResult[] = [];
  for (const stmt of statements) {
    results.push(await execSQL(supabase, stmt.sql, stmt.params ?? []));
  }
  return results;
}
