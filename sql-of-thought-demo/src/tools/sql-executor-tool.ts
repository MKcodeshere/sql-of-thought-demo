/**
 * SQL Executor Tool
 * Executes SQL queries against DuckDB and returns results or errors
 */

import Database from 'duckdb';
import { z } from 'zod';

const SQLExecutorInputSchema = z.object({
  sql: z.string().describe('The SQL query to execute'),
  db_path: z.string().describe('Path to the database file'),
});

const SQLExecutorOutputSchema = z.object({
  success: z.boolean(),
  result: z.array(z.record(z.any())).optional(),
  error: z.string().optional(),
  row_count: z.number().optional(),
  execution_time_ms: z.number().optional(),
});

export type SQLExecutorInput = z.infer<typeof SQLExecutorInputSchema>;
export type SQLExecutorOutput = z.infer<typeof SQLExecutorOutputSchema>;

/**
 * Execute SQL query against SQLite database via DuckDB
 */
export async function executeSQL(sql: string, dbPath: string): Promise<SQLExecutorOutput> {
  const startTime = Date.now();
  const db = new Database.Database(':memory:');

  return new Promise((resolve) => {
    // Clean up SQL (remove comments, extra whitespace)
    const cleanedSQL = sql
      .replace(/--.*$/gm, '') // Remove single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
      .trim();

    if (!cleanedSQL) {
      resolve({
        success: false,
        error: 'Empty SQL query after cleaning',
      });
      return;
    }

    // Install SQLite extension and attach database
    db.all(`INSTALL sqlite; LOAD sqlite;`, (err) => {
      if (err) {
        resolve({
          success: false,
          error: `Failed to load SQLite extension: ${err.message}`,
          execution_time_ms: Date.now() - startTime,
        });
        return;
      }

      db.all(`ATTACH '${dbPath}' AS chinook (TYPE SQLITE);`, (err) => {
        if (err) {
          db.close();
          resolve({
            success: false,
            error: `Failed to attach database: ${err.message}`,
            execution_time_ms: Date.now() - startTime,
          });
          return;
        }

        // Prefix table references with chinook schema
        const sqlWithSchema = cleanedSQL.replace(/FROM\s+(\w+)/gi, 'FROM chinook.$1')
                                        .replace(/JOIN\s+(\w+)/gi, 'JOIN chinook.$1');

        db.all(sqlWithSchema, (err, rows) => {
          const executionTime = Date.now() - startTime;
          db.close();

          if (err) {
            resolve({
              success: false,
              error: err.message,
              execution_time_ms: executionTime,
            });
          } else {
            resolve({
              success: true,
              result: rows,
              row_count: rows.length,
              execution_time_ms: executionTime,
            });
          }
        });
      });
    });
  });
}

/**
 * Validate SQL syntax without executing
 */
export async function validateSQL(sql: string, dbPath: string): Promise<{ valid: boolean; error?: string }> {
  const db = new Database.Database(dbPath, { readonly: true });

  return new Promise((resolve) => {
    // Use EXPLAIN to validate without executing
    db.all(`EXPLAIN ${sql}`, (err) => {
      db.close();

      if (err) {
        resolve({
          valid: false,
          error: err.message,
        });
      } else {
        resolve({
          valid: true,
        });
      }
    });
  });
}

/**
 * SQL Executor Tool Definition for Claude Agent SDK
 */
export const sqlExecutorTool = {
  name: 'execute_sql',
  description: 'Execute a SQL query against the database and return results or error information',
  input_schema: SQLExecutorInputSchema,
  execute: async (input: SQLExecutorInput): Promise<SQLExecutorOutput> => {
    return executeSQL(input.sql, input.db_path);
  },
};
