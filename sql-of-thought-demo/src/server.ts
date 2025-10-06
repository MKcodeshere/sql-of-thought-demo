import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'duckdb';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from web directory
app.use(express.static(path.join(__dirname, 'web')));

// Database setup
const DB_PATH = path.join(__dirname, '../data/chinook.db');
let dbInstance: Database.Database | null = null;
let dbInitialized = false;

function getDB() {
  if (!dbInstance) {
    dbInstance = new Database.Database(':memory:');
  }
  return dbInstance;
}

async function initDB(): Promise<void> {
  if (dbInitialized) return;

  const db = getDB();
  const normalizedPath = DB_PATH.replace(/\\/g, '/');

  return new Promise((resolve, reject) => {
    db.all(`INSTALL sqlite; LOAD sqlite;`, (err) => {
      if (err) {
        reject(err);
        return;
      }

      db.all(`ATTACH '${normalizedPath}' AS chinook (TYPE SQLITE);`, (err) => {
        if (err) {
          reject(err);
          return;
        }

        dbInitialized = true;
        console.log('✅ Database initialized and attached');
        resolve();
      });
    });
  });
}

// Helper: Execute SQL
async function executeSQL(sql: string): Promise<any[]> {
  const db = getDB();
  return new Promise((resolve, reject) => {
    db.all(sql, (err, result) => {
      if (err) reject(err);
      else resolve(result || []);
    });
  });
}

// Helper: Get schema with foreign key relationships
async function getSchema(): Promise<any> {
  await initDB(); // Ensure DB is initialized
  const db = getDB();

  return new Promise((resolve, reject) => {
    // Get tables
    db.all(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_catalog = 'chinook'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `, (err, tables: any[]) => {
      if (err) {
        reject(err);
        return;
      }

      const schema: any = { tables: {}, foreign_keys: [] };
      let processed = 0;

      if (tables.length === 0) {
        resolve(schema);
        return;
      }

      tables.forEach((table) => {
        const tableName = table.table_name;

        // Get columns
        db.all(`
          SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_catalog = 'chinook'
            AND table_name = '${tableName}'
          ORDER BY ordinal_position;
        `, (err, columns: any[]) => {
          if (!err && columns) {
            schema.tables[tableName] = {
              columns: columns.map(col => ({
                name: col.column_name,
                type: col.data_type
              }))
            };
          }

          // Get foreign keys for this table
          db.all(`
            SELECT
              fk.constraint_name,
              fk.table_name as from_table,
              kcu1.column_name as from_column,
              kcu2.table_name as to_table,
              kcu2.column_name as to_column
            FROM information_schema.table_constraints fk
            JOIN information_schema.key_column_usage kcu1
              ON fk.constraint_name = kcu1.constraint_name
              AND fk.table_catalog = kcu1.table_catalog
            JOIN information_schema.referential_constraints rc
              ON fk.constraint_name = rc.constraint_name
              AND fk.table_catalog = rc.constraint_catalog
            JOIN information_schema.key_column_usage kcu2
              ON rc.unique_constraint_name = kcu2.constraint_name
              AND rc.unique_constraint_catalog = kcu2.table_catalog
            WHERE fk.constraint_type = 'FOREIGN KEY'
              AND fk.table_catalog = 'chinook'
              AND fk.table_name = '${tableName}';
          `, (err, fks: any[]) => {
            if (!err && fks && fks.length > 0) {
              fks.forEach(fk => {
                schema.foreign_keys.push({
                  from_table: fk.from_table,
                  from_column: fk.from_column,
                  to_table: fk.to_table,
                  to_column: fk.to_column
                });
              });
            }

            processed++;
            if (processed === tables.length) {
              resolve(schema);
            }
          });
        });
      });
    });
  });
}

// Helper: Call OpenAI
async function callOpenAI(prompt: string, model: string, apiKey: string, jsonMode = true): Promise<string> {
  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    ...(jsonMode && { response_format: { type: 'json_object' } })
  });

  return response.choices[0].message.content || '';
}

// Agent functions (simplified versions from agent.ts)
async function schemaLinkingAgent(question: string, schema: any, model: string, apiKey: string) {
  const prompt = `You are a schema linking expert. Given this database schema and question, identify the relevant tables and columns.

Schema: ${JSON.stringify(schema, null, 2)}

Question: "${question}"

Return ONLY a JSON object with:
{
  "tables": ["table1", "table2"],
  "columns": {"table1": ["col1", "col2"]},
  "reasoning": "brief explanation"
}`;

  const response = await callOpenAI(prompt, model, apiKey);
  return JSON.parse(response);
}

async function subproblemAgent(question: string, linkedSchema: any, model: string, apiKey: string) {
  const prompt = `Break down this SQL query into clause-level subproblems.

Question: "${question}"
Tables: ${linkedSchema.tables.join(', ')}

Return ONLY a JSON object with:
{
  "clauses": {
    "SELECT": "what to select",
    "FROM": "base table",
    "WHERE": "filter conditions",
    ...
  }
}`;

  const response = await callOpenAI(prompt, model, apiKey);
  return JSON.parse(response);
}

async function queryPlanAgent(question: string, linkedSchema: any, subproblems: any, model: string, apiKey: string) {
  const prompt = `Create a step-by-step query execution plan using Chain-of-Thought reasoning.

Question: "${question}"
Schema: ${JSON.stringify(linkedSchema)}
Clauses: ${JSON.stringify(subproblems.clauses)}

Return ONLY a JSON object with:
{
  "steps": [
    {"step_number": 1, "action": "...", "reasoning": "..."}
  ],
  "final_strategy": "summary"
}`;

  const response = await callOpenAI(prompt, model, apiKey);
  return JSON.parse(response);
}

async function sqlGenerationAgent(question: string, queryPlan: any, linkedSchema: any, model: string, apiKey: string) {
  const prompt = `Generate the exact SQL query based on this plan.

Question: "${question}"
Plan: ${JSON.stringify(queryPlan)}
Schema: ${JSON.stringify(linkedSchema)}

Return ONLY the SQL query, no explanations or markdown.`;

  const response = await callOpenAI(prompt, model, apiKey, false);
  return response.replace(/```sql\n?/g, '').replace(/```\n?/g, '').trim();
}

async function correctionPlanAgent(question: string, incorrectSQL: string, error: string, linkedSchema: any, model: string, apiKey: string) {
  // First, let's inspect problematic tables mentioned in the error
  const db = getDB();
  let tableInspection = '';

  // Extract table name from error if it mentions a specific table
  const tableMatch = error.match(/Table "(\w+)" does not have/);
  if (tableMatch) {
    const tableName = tableMatch[1];

    // Describe the table to get actual columns
    const columns = await new Promise<any[]>((resolve, reject) => {
      db.all(`DESCRIBE chinook.${tableName};`, (err, cols) => {
        if (err) resolve([]);
        else resolve(cols || []);
      });
    });

    if (columns.length > 0) {
      tableInspection = `\n\nACTUAL COLUMNS IN ${tableName} TABLE (from DESCRIBE):\n${columns.map(c => `- ${c.column_name} (${c.column_type})`).join('\n')}`;
    }
  }

  const prompt = `Analyze this SQL error and provide a correction plan.

Question: "${question}"
Failed SQL: ${incorrectSQL}
Error: ${error}

Schema Info: ${JSON.stringify(linkedSchema)}${tableInspection}

ERROR TAXONOMY:
- schema_link.col_missing: Column doesn't exist in table
- join.wrong_condition: JOIN uses wrong column names
- join.table_missing: Missing required JOIN
- aggregation.wrong_function: Wrong aggregate function

INSTRUCTIONS:
1. Read the error message carefully - it often tells you the exact column names available
2. If table inspection is provided above, use those EXACT column names
3. Check foreign_keys in schema to find correct JOIN conditions
4. Identify which specific column name is wrong and what it should be

Return ONLY a JSON object with:
{
  "error_categories": ["category from taxonomy"],
  "root_cause": "specific explanation with actual vs expected column names",
  "correction_plan": {"steps": ["replace column X with column Y", "..."]}
}`;

  const response = await callOpenAI(prompt, model, apiKey);
  return JSON.parse(response);
}

async function correctionSQLAgent(question: string, incorrectSQL: string, correctionPlan: any, linkedSchema: any, model: string, apiKey: string) {
  const prompt = `Fix the SQL query based on the correction plan.

Question: "${question}"
Incorrect SQL: ${incorrectSQL}
Correction Plan: ${JSON.stringify(correctionPlan)}
Schema: ${JSON.stringify(linkedSchema)}

IMPORTANT: Use the EXACT column names from the schema.
Return ONLY the corrected SQL query, no explanations.`;

  const response = await callOpenAI(prompt, model, apiKey, false);
  return response.replace(/```sql\n?/g, '').replace(/```\n?/g, '').trim();
}

// API Endpoints - with Server-Sent Events for real-time updates
app.post('/api/sql-of-thought', async (req, res) => {
  let responseEnded = false;

  const safeEnd = () => {
    if (!responseEnded) {
      responseEnded = true;
      try {
        res.end();
      } catch (e) {
        console.error('Error ending response:', e);
      }
    }
  };

  try {
    const { question, model = 'gpt-4o-mini', apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const emit = (type: string, data: any) => {
      if (responseEnded) return;
      try {
        const message = { type, data, timestamp: new Date().toISOString() };
        res.write(`data: ${JSON.stringify(message)}\n\n`);
      } catch (e) {
        console.error('Error writing to stream:', e);
      }
    };

    // Step 1: Schema Linking
    emit('agent_start', { agent: 'schema' });
    const schema = await getSchema();
    const linkedSchema = await schemaLinkingAgent(question, schema, model, apiKey);
    emit('agent_complete', { agent: 'schema', output: `Tables: ${linkedSchema.tables.join(', ')}` });

    // Step 2: Subproblem
    emit('agent_start', { agent: 'subproblem' });
    const subproblems = await subproblemAgent(question, linkedSchema, model, apiKey);
    emit('agent_complete', { agent: 'subproblem', output: `Clauses: ${Object.keys(subproblems.clauses || {}).join(', ')}` });

    // Step 3: Query Plan
    emit('agent_start', { agent: 'queryplan' });
    const queryPlan = await queryPlanAgent(question, linkedSchema, subproblems, model, apiKey);

    // Format the steps for display
    const stepsDisplay = queryPlan.steps?.map((step: any) =>
      `${step.step_number}. ${step.action}\n   → ${step.reasoning}`
    ).join('\n\n') || 'No steps generated';

    emit('agent_complete', {
      agent: 'queryplan',
      output: `📋 Chain-of-Thought Plan (${queryPlan.steps?.length || 0} steps):\n\n${stepsDisplay}\n\n✅ Strategy: ${queryPlan.final_strategy || 'N/A'}`
    });

    // Step 4: SQL Generation
    emit('agent_start', { agent: 'sql' });
    let generatedSQL = await sqlGenerationAgent(question, queryPlan, linkedSchema, model, apiKey);

    // Add schema prefix (but avoid double prefix)
    let sqlWithSchema = generatedSQL
      .replace(/chinook\.chinook\./gi, 'chinook.') // Remove double prefix if exists
      .replace(/FROM\s+(?!chinook\.)(\w+)/gi, 'FROM chinook.$1') // Add prefix only if not already there
      .replace(/JOIN\s+(?!chinook\.)(\w+)/gi, 'JOIN chinook.$1');
    emit('agent_complete', { agent: 'sql', output: sqlWithSchema });

    // Step 5: Execute SQL (with correction loop)
    let success = false;
    let attempt = 0;
    let maxAttempts = 3;
    let results: any[] = [];

    while (attempt < maxAttempts && !success) {
      emit('agent_start', { agent: 'execute' });

      try {
        const db = getDB();
        results = await new Promise((resolve, reject) => {
          db.all(sqlWithSchema, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          });
        });

        // Convert BigInt to string
        const cleanResults = results.map(row => {
          const converted: any = {};
          for (const [key, value] of Object.entries(row)) {
            converted[key] = typeof value === 'bigint' ? value.toString() : value;
          }
          return converted;
        });

        emit('agent_complete', { agent: 'execute', output: `${cleanResults.length} rows returned` });
        success = true;
        results = cleanResults;
      } catch (error: any) {
        emit('agent_error', { agent: 'execute', error: error.message });

        if (attempt < maxAttempts - 1) {
          emit('agent_start', { agent: 'correction' });

          const correctionPlan = await correctionPlanAgent(question, sqlWithSchema, error.message, linkedSchema, model, apiKey);
          const correctedSQL = await correctionSQLAgent(question, sqlWithSchema, correctionPlan, linkedSchema, model, apiKey);

          emit('agent_complete', {
            agent: 'correction',
            output: `Attempt ${attempt + 2}: ${correctionPlan.error_categories?.join(', ') || 'Analyzing...'}\nError: ${error.message}\nPlan: ${correctionPlan.root_cause || 'Analyzing error...'}`
          });

          // Fix schema prefix without breaking the corrected SQL
          sqlWithSchema = correctedSQL
            .replace(/chinook\.chinook\./gi, 'chinook.')
            .replace(/FROM\s+(?!chinook\.)(\w+)/gi, 'FROM chinook.$1')
            .replace(/JOIN\s+(?!chinook\.)(\w+)/gi, 'JOIN chinook.$1');

          emit('agent_update', { agent: 'sql', output: `Corrected SQL (Attempt ${attempt + 2}):\n${sqlWithSchema}` });

          console.log(`Attempt ${attempt + 2} - Executing SQL:`, sqlWithSchema);
        } else {
          // Last attempt failed - show final error
          emit('agent_complete', {
            agent: 'correction',
            output: `Failed after ${maxAttempts} attempts. Final error: ${error.message}`
          });
        }

        attempt++;
      }
    }

    // Send final result
    emit('complete', {
      success,
      sql: generatedSQL,
      results,
      attempts: attempt + 1
    });

    safeEnd();

  } catch (error: any) {
    console.error('Error in pipeline:', error);
    console.error('Stack:', error.stack);

    if (!responseEnded) {
      try {
        const errorMsg = { type: 'error', data: { error: error.message }, timestamp: new Date().toISOString() };
        res.write(`data: ${JSON.stringify(errorMsg)}\n\n`);
      } catch (writeError) {
        console.error('Error writing error response:', writeError);
      }
    }
    safeEnd();
  }

  // Handle client disconnect
  req.on('close', () => {
    responseEnded = true;
    console.log('Client disconnected from SSE stream');
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit - keep server running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - keep server running
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 API endpoint: http://localhost:${PORT}/api/sql-of-thought`);
});
