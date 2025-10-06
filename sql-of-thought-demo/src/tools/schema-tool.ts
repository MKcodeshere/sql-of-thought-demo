/**
 * Schema Linking Tool
 * Extracts and analyzes database schema for SQL generation
 */

import Database from 'duckdb';
import { z } from 'zod';

const SchemaLinkingInputSchema = z.object({
  question: z.string().describe('The natural language question'),
  db_path: z.string().describe('Path to the database file'),
});

const SchemaLinkingOutputSchema = z.object({
  tables: z.array(z.string()),
  columns: z.record(z.array(z.string())),
  foreign_keys: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
    })
  ),
  reasoning: z.string(),
});

export type SchemaLinkingInput = z.infer<typeof SchemaLinkingInputSchema>;
export type SchemaLinkingOutput = z.infer<typeof SchemaLinkingOutputSchema>;

/**
 * Extract complete schema from SQLite database using DuckDB
 */
export async function getCompleteSchema(dbPath: string): Promise<any> {
  const db = new Database.Database(':memory:');

  return new Promise((resolve, reject) => {
    const schema: any = {
      tables: {},
      foreign_keys: [],
    };

    // Convert Windows path to forward slashes for DuckDB
    const normalizedPath = dbPath.replace(/\\/g, '/');
    console.log('  Loading schema from:', normalizedPath);

    // Install and load SQLite extension
    db.all(`INSTALL sqlite; LOAD sqlite;`, (err) => {
      if (err) {
        reject(err);
        return;
      }

      // Attach SQLite database
      db.all(`ATTACH '${normalizedPath}' AS chinook (TYPE SQLITE);`, (err) => {
        if (err) {
          console.error('  Failed to attach database:', err.message);
          reject(err);
          return;
        }

        // Use SHOW TABLES to get table list from attached database
        db.all(`SHOW TABLES FROM chinook;`, (err, tables: any[]) => {
          if (err) {
            console.error('  Failed to query tables:', err.message);
          }
          console.log('  Found tables:', tables);
          if (err) {
            reject(err);
            return;
          }

          const tablePromises = tables.map((table) => {
            return new Promise<void>((resolveTable, rejectTable) => {
              // SHOW TABLES returns 'name' column
              const tableName = table.name || table.table_name || table;

              // Get column information using DESCRIBE (works with attached SQLite)
              db.all(`DESCRIBE chinook.${tableName};`, (err, columns: any[]) => {
                if (err) {
                  console.error(`  Failed to describe ${tableName}:`, err.message);
                  rejectTable(err);
                  return;
                }

                schema.tables[tableName] = {
                  columns: columns.map((col: any) => ({
                    name: col.column_name,
                    type: col.column_type,
                    nullable: col.null === 'YES',
                    primary_key: col.column_name.toLowerCase().includes('id') && columns.indexOf(col) === 0, // Heuristic
                  })),
                };

                resolveTable();
              });
            });
          });

          Promise.all(tablePromises)
            .then(() => {
              // Get primary keys and foreign keys
              db.all(`DESCRIBE chinook;`, (err, allTables: any[]) => {
                db.close();
                resolve(schema);
              });
            })
            .catch(reject);
        });
      });
    });
  });
}

/**
 * Format schema for LLM prompt
 */
export function formatSchemaForPrompt(schema: any): string {
  let output = '# Database Schema\n\n';

  for (const [tableName, tableInfo] of Object.entries(schema.tables) as [string, any][]) {
    output += `## Table: ${tableName}\n`;
    output += 'Columns:\n';

    for (const col of tableInfo.columns) {
      const pkMarker = col.primary_key ? ' [PRIMARY KEY]' : '';
      const nullMarker = col.nullable ? '' : ' NOT NULL';
      output += `  - ${col.name}: ${col.type}${pkMarker}${nullMarker}\n`;
    }

    output += '\n';
  }

  if (schema.foreign_keys.length > 0) {
    output += '## Foreign Key Relationships\n';
    for (const fk of schema.foreign_keys) {
      output += `  - ${fk.from} -> ${fk.to}\n`;
    }
  }

  return output;
}

/**
 * Schema Linking Tool Definition for Claude Agent SDK
 */
export const schemaLinkingTool = {
  name: 'link_schema',
  description: 'Analyze the database schema and identify relevant tables and columns for the given question',
  input_schema: SchemaLinkingInputSchema,
  execute: async (input: SchemaLinkingInput): Promise<SchemaLinkingOutput> => {
    // This would be called by LLM with structured reasoning
    // The actual schema linking logic would be done by the LLM
    // This tool provides the schema information
    const schema = await getCompleteSchema(input.db_path);

    // Return placeholder - actual linking done by LLM
    return {
      tables: [],
      columns: {},
      foreign_keys: [],
      reasoning: 'Schema extracted, awaiting LLM analysis',
    };
  },
};
