#!/usr/bin/env tsx
/**
 * Convert SQLite Chinook database to DuckDB format
 */

import Database from 'duckdb';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SQLITE_PATH = join(__dirname, '../data/chinook.db');
const DUCKDB_PATH = join(__dirname, '../data/chinook.duckdb');

async function convertDatabase() {
  console.log('🔄 Converting SQLite to DuckDB...');

  const db = new Database.Database(DUCKDB_PATH);

  return new Promise<void>((resolve, reject) => {
    db.all(`INSTALL sqlite; LOAD sqlite;`, (err) => {
      if (err) {
        reject(err);
        return;
      }

      // Attach SQLite database and copy all tables
      db.all(`ATTACH '${SQLITE_PATH}' AS chinook_sqlite (TYPE SQLITE);`, (err) => {
        if (err) {
          reject(err);
          return;
        }

        console.log('✅ SQLite database attached');

        // Get list of tables using information_schema
        db.all(`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_catalog = 'chinook_sqlite'
            AND table_type = 'BASE TABLE'
          ORDER BY table_name;
        `, (err, tables: any[]) => {
          if (err) {
            reject(err);
            return;
          }

          console.log(`📊 Found ${tables.length} tables to copy`);

          // Copy each table
          const copyPromises = tables.map((table) => {
            return new Promise<void>((resolveTable, rejectTable) => {
              const tableName = table.table_name;
              console.log(`  Copying ${tableName}...`);

              db.all(`CREATE TABLE ${tableName} AS SELECT * FROM chinook_sqlite.main.${tableName};`, (err) => {
                if (err) {
                  rejectTable(err);
                } else {
                  console.log(`  ✓ ${tableName} copied`);
                  resolveTable();
                }
              });
            });
          });

          Promise.all(copyPromises)
            .then(() => {
              console.log('✅ All tables copied successfully');
              console.log(`📁 DuckDB file created at: ${DUCKDB_PATH}`);
              db.close();
              resolve();
            })
            .catch(reject);
        });
      });
    });
  });
}

// Run conversion
convertDatabase()
  .then(() => {
    console.log('🎉 Conversion complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Conversion failed:', error);
    process.exit(1);
  });
