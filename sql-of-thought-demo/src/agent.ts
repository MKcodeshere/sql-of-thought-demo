/**
 * SQL-of-Thought: Multi-agent Text-to-SQL with Guided Error Correction
 * Using OpenAI GPT-4o-mini and custom tools
 */

import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import { getCompleteSchema, formatSchemaForPrompt } from './tools/schema-tool.js';
import { executeSQL } from './tools/sql-executor-tool.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const DB_PATH = join(__dirname, '../data/chinook.db');
const ERROR_TAXONOMY_PATH = join(__dirname, '../data/error-taxonomy.json');
const MAX_CORRECTION_ATTEMPTS = 3;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const TEMPERATURE = parseFloat(process.env.TEMPERATURE || '1');

// Load resources
const errorTaxonomy = JSON.parse(readFileSync(ERROR_TAXONOMY_PATH, 'utf-8'));

/**
 * Agent 1: Schema Linking
 */
async function schemaLinkingAgent(question: string, schema: any): Promise<any> {
  console.log('\n📊 [Schema Linking Agent] Analyzing question...');

  const prompt = `${readFileSync(join(__dirname, 'prompts/schema-linking.md'), 'utf-8')}

## Database Schema

${formatSchemaForPrompt(schema)}

## Question

"${question}"

Analyze the question and identify the relevant tables, columns, and relationships needed. Return ONLY a valid JSON object as specified in the output format.`;

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: TEMPERATURE,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(response.choices[0].message.content || '{}');
  console.log('  ✓ Identified tables:', result.tables);
  return result;
}

/**
 * Agent 2: Subproblem Identification
 */
async function subproblemAgent(question: string, linkedSchema: any): Promise<any> {
  console.log('\n🧩 [Subproblem Agent] Breaking down query...');

  const prompt = `You are a SQL query decomposition expert. Given a natural language question, break it down into SQL clause-level subproblems.

Question: "${question}"

Relevant tables: ${linkedSchema.tables.join(', ')}
Relevant columns: ${JSON.stringify(linkedSchema.columns)}

Identify which SQL clauses are needed and what each should accomplish. Return a JSON object with:

\`\`\`json
{
  "clauses": {
    "SELECT": "description of what to select",
    "FROM": "base table(s)",
    "JOIN": "join conditions needed",
    "WHERE": "filter conditions",
    "GROUP BY": "grouping columns",
    "HAVING": "post-aggregation filters",
    "ORDER BY": "sorting criteria",
    "LIMIT": "row limit"
  }
}
\`\`\`

Only include clauses that are needed. Return ONLY valid JSON.`;

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: TEMPERATURE,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(response.choices[0].message.content || '{}');
  console.log('  ✓ Identified clauses:', Object.keys(result.clauses || {}));
  return result;
}

/**
 * Agent 3: Query Plan Generation (Chain-of-Thought)
 */
async function queryPlanAgent(question: string, linkedSchema: any, subproblems: any): Promise<any> {
  console.log('\n🤔 [Query Plan Agent] Generating execution plan...');

  const prompt = `${readFileSync(join(__dirname, 'prompts/query-planning.md'), 'utf-8')}

## Question
"${question}"

## Schema Information
Tables: ${linkedSchema.tables.join(', ')}
Columns: ${JSON.stringify(linkedSchema.columns, null, 2)}
Foreign Keys: ${JSON.stringify(linkedSchema.foreign_keys, null, 2)}

## Identified Clauses
${JSON.stringify(subproblems.clauses, null, 2)}

Create a detailed step-by-step query plan using Chain-of-Thought reasoning. Return ONLY valid JSON as specified.`;

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: TEMPERATURE,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(response.choices[0].message.content || '{}');
  console.log('  ✓ Generated plan with', result.steps?.length || 0, 'steps');
  return result;
}

/**
 * Agent 4: SQL Generation
 */
async function sqlGenerationAgent(question: string, queryPlan: any, linkedSchema: any): Promise<string> {
  console.log('\n⚡ [SQL Agent] Generating SQL query...');

  const prompt = `You are an expert SQL query generator. Given a query plan, generate the exact SQL query.

Question: "${question}"

Query Plan:
${JSON.stringify(queryPlan, null, 2)}

Schema:
${JSON.stringify(linkedSchema, null, 2)}

Generate the SQL query that implements this plan. Return ONLY the SQL query, no explanations or markdown. The query should be executable and syntactically correct.`;

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: TEMPERATURE,
  });

  const sql = response.choices[0].message.content?.trim() || '';
  // Clean up SQL (remove markdown code blocks if present)
  const cleanedSQL = sql
    .replace(/```sql\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  console.log('  ✓ Generated SQL');
  return cleanedSQL;
}

/**
 * Agent 5: Correction Plan Agent
 */
async function correctionPlanAgent(
  question: string,
  incorrectSQL: string,
  error: string,
  linkedSchema: any
): Promise<any> {
  console.log('\n🔍 [Correction Plan Agent] Analyzing error...');

  const prompt = `${readFileSync(join(__dirname, 'prompts/error-correction.md'), 'utf-8')}

## Error Taxonomy
${JSON.stringify(errorTaxonomy, null, 2)}

## Question
"${question}"

## Failed SQL Query
\`\`\`sql
${incorrectSQL}
\`\`\`

## Error Message
${error}

## Schema
${JSON.stringify(linkedSchema, null, 2)}

Analyze this error using the taxonomy and provide a structured correction plan. Return ONLY valid JSON as specified.`;

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: TEMPERATURE,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(response.choices[0].message.content || '{}');
  console.log('  ✓ Error categories:', result.error_categories);
  return result;
}

/**
 * Agent 6: Correction SQL Agent
 */
async function correctionSQLAgent(
  question: string,
  incorrectSQL: string,
  correctionPlan: any,
  linkedSchema: any
): Promise<string> {
  console.log('\n🔧 [Correction SQL Agent] Generating corrected SQL...');

  const prompt = `You are an expert SQL query corrector. Fix the SQL query based on the correction plan.

Question: "${question}"

Incorrect SQL:
\`\`\`sql
${incorrectSQL}
\`\`\`

Correction Plan:
${JSON.stringify(correctionPlan, null, 2)}

Schema:
${JSON.stringify(linkedSchema, null, 2)}

Generate the corrected SQL query that addresses all issues identified in the correction plan. Return ONLY the corrected SQL query, no explanations.`;

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: TEMPERATURE,
  });

  const sql = response.choices[0].message.content?.trim() || '';
  const cleanedSQL = sql
    .replace(/```sql\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  console.log('  ✓ Generated corrected SQL');
  return cleanedSQL;
}

/**
 * Main SQL-of-Thought Pipeline
 */
async function sqlOfThought(question: string): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 SQL-of-Thought: Multi-agent Text-to-SQL');
  console.log('='.repeat(80));
  console.log('\n📝 Question:', question);

  try {
    // Step 1: Get database schema
    console.log('\n📥 Loading database schema...');
    const schema = await getCompleteSchema(DB_PATH);
    console.log('  ✓ Schema loaded:', Object.keys(schema.tables).length, 'tables');

    // Step 2: Schema Linking
    const linkedSchema = await schemaLinkingAgent(question, schema);

    // Step 3: Subproblem Identification
    const subproblems = await subproblemAgent(question, linkedSchema);

    // Step 4: Query Plan Generation
    const queryPlan = await queryPlanAgent(question, linkedSchema, subproblems);

    // Step 5: SQL Generation
    let generatedSQL = await sqlGenerationAgent(question, queryPlan, linkedSchema);
    console.log('\n📄 Generated SQL:\n', generatedSQL);

    // Step 6: Execute and potentially correct
    let attempt = 0;
    let success = false;

    while (attempt <= MAX_CORRECTION_ATTEMPTS && !success) {
      if (attempt > 0) {
        console.log(`\n🔄 Correction attempt ${attempt}/${MAX_CORRECTION_ATTEMPTS}`);
      }

      console.log('\n⚙️  Executing SQL...');
      const result = await executeSQL(generatedSQL, DB_PATH);

      if (result.success) {
        console.log('✅ Query executed successfully!');
        console.log(`📊 Returned ${result.row_count} rows in ${result.execution_time_ms}ms`);
        console.log('\n📋 Results (first 5 rows):');

        // Convert BigInt to string for JSON serialization
        const resultsToShow = result.result?.slice(0, 5).map(row => {
          const converted: any = {};
          for (const [key, value] of Object.entries(row)) {
            converted[key] = typeof value === 'bigint' ? value.toString() : value;
          }
          return converted;
        });

        console.log(JSON.stringify(resultsToShow, null, 2));
        success = true;
      } else {
        console.log('❌ Query failed:', result.error);

        if (attempt < MAX_CORRECTION_ATTEMPTS) {
          // Enter correction loop
          const correctionPlan = await correctionPlanAgent(question, generatedSQL, result.error || '', linkedSchema);
          generatedSQL = await correctionSQLAgent(question, generatedSQL, correctionPlan, linkedSchema);
          console.log('\n📄 Corrected SQL:\n', generatedSQL);
        } else {
          console.log('\n⚠️  Max correction attempts reached');
        }

        attempt++;
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log(success ? '✅ SQL-of-Thought completed successfully!' : '❌ SQL-of-Thought failed');
    console.log('='.repeat(80) + '\n');
  } catch (error) {
    console.error('\n❌ Pipeline error:', error);
  }
}

// Demo queries
const DEMO_QUERIES = [
  'List all customers from USA',
  'What are the top 5 best-selling tracks by total revenue?',
  'Show me the total sales amount for each employee',
];

// Run demo
const questionIndex = process.argv[2] ? parseInt(process.argv[2]) : 0;
const question = DEMO_QUERIES[questionIndex] || DEMO_QUERIES[0];

sqlOfThought(question).catch(console.error);
