// State
let apiKey = localStorage.getItem('openai_api_key') || '';
let isRunning = false;
const API_URL = 'http://localhost:3001/api';

// DOM Elements
const apiKeyInput = document.getElementById('api-key');
const modelSelect = document.getElementById('model-select');
const questionInput = document.getElementById('question');
const runBtn = document.getElementById('run-btn');
const statusBox = document.getElementById('status');
const resultsSection = document.getElementById('results-section');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadSavedAPIKey();
});

// No DuckDB initialization needed - using backend API

// Setup Event Listeners
function setupEventListeners() {
    apiKeyInput.value = apiKey;
    apiKeyInput.addEventListener('change', (e) => {
        apiKey = e.target.value;
        localStorage.setItem('openai_api_key', apiKey);
    });

    runBtn.addEventListener('click', runSQLOfThought);

    // Example query buttons
    document.querySelectorAll('.example-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            questionInput.value = e.target.dataset.query;
        });
    });

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabName = e.target.dataset.tab;
            switchTab(tabName);
        });
    });
}

function loadSavedAPIKey() {
    if (apiKey) {
        apiKeyInput.value = apiKey;
    }
}

// Switch tabs
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });
}

// Show status message
function showStatus(message, type = 'info') {
    statusBox.textContent = message;
    statusBox.className = `status-box ${type}`;
    statusBox.classList.remove('hidden');
}

// Update agent status
function updateAgent(agentId, status, output = '') {
    const card = document.getElementById(`agent-${agentId}`);
    const statusIcon = document.getElementById(`status-${agentId}`);
    const outputDiv = document.getElementById(`output-${agentId}`);

    // Update status icon
    const icons = {
        pending: '⏸️',
        running: '⏳',
        success: '✅',
        error: '❌'
    };

    statusIcon.textContent = icons[status] || '⏸️';

    // Update card style
    card.classList.remove('active', 'success', 'error');
    if (status === 'running') card.classList.add('active');
    if (status === 'success') card.classList.add('success');
    if (status === 'error') card.classList.add('error');

    // Update output
    if (output) {
        outputDiv.textContent = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
    }
}

// Reset all agents
function resetAgents() {
    ['schema', 'subproblem', 'queryplan', 'sql', 'execute', 'correction'].forEach(id => {
        updateAgent(id, 'pending');
        document.getElementById(`output-${id}`).textContent = '';
    });
    document.getElementById('correction-loop').classList.add('hidden');
    resultsSection.classList.add('hidden');
}

// Main SQL-of-Thought Pipeline - using backend API
async function runSQLOfThought() {
    if (!apiKey) {
        showStatus('❌ Please enter your OpenAI API key', 'error');
        return;
    }

    const question = questionInput.value.trim();
    if (!question) {
        showStatus('❌ Please enter a question', 'error');
        return;
    }

    if (isRunning) return;

    isRunning = true;
    runBtn.disabled = true;
    resetAgents();
    showStatus('🚀 Starting SQL-of-Thought pipeline...', 'info');

    const model = modelSelect.value;
    const startTime = Date.now();

    try {
        // Call backend API with SSE for real-time updates
        const response = await fetch(`${API_URL}/sql-of-thought`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                question,
                model,
                apiKey
            })
        });

        if (!response.ok) {
            throw new Error('API request failed');
        }

        // Process SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let correctionShown = false;

        while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.trim() || !line.startsWith('data: ')) continue;

                const data = JSON.parse(line.substring(6));

                if (data.type === 'agent_start') {
                    updateAgent(data.data.agent, 'running');
                } else if (data.type === 'agent_complete') {
                    updateAgent(data.data.agent, 'success', data.data.output);
                } else if (data.type === 'agent_error') {
                    updateAgent(data.data.agent, 'error', data.data.error);
                } else if (data.type === 'agent_update') {
                    updateAgent(data.data.agent, 'success', data.data.output);
                } else if (data.type === 'complete') {
                    const endTime = Date.now();
                    if (data.data.success) {
                        showStatus(`✅ Success! Generated SQL in ${data.data.attempts} attempt(s)`, 'success');
                        displayResults(data.data.results, data.data.sql, endTime - startTime, data.data.attempts - 1);
                    } else {
                        showStatus(`❌ Failed after ${data.data.attempts} attempts`, 'error');
                    }
                } else if (data.type === 'error') {
                    throw new Error(data.data.error);
                }

                // Show correction loop if correction agent was used
                if (data.data.agent === 'correction' && !correctionShown) {
                    document.getElementById('correction-loop').classList.remove('hidden');
                    correctionShown = true;
                }
            }
        }

    } catch (error) {
        showStatus(`❌ Error: ${error.message}`, 'error');
        console.error('Pipeline error:', error);
    } finally {
        isRunning = false;
        runBtn.disabled = false;
    }
}

// Get complete schema from DuckDB
async function getCompleteSchema() {
    const conn = await db.connect();

    try {
        const tables = await conn.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'main'
        `);

        const schema = { tables: {}, foreign_keys: [] };

        for (const row of tables.toArray()) {
            const tableName = row.table_name;
            const columns = await conn.query(`
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_name = '${tableName}'
            `);

            schema.tables[tableName] = {
                columns: columns.toArray().map(col => ({
                    name: col.column_name,
                    type: col.data_type
                }))
            };
        }

        return schema;
    } finally {
        await conn.close();
    }
}

// Execute SQL query
async function executeSQL(sql) {
    const conn = await db.connect();

    try {
        const result = await conn.query(sql);
        return result.toArray();
    } finally {
        await conn.close();
    }
}

// Agent: Schema Linking
async function schemaLinkingAgent(question, schema, model) {
    const prompt = `You are a schema linking expert. Given this database schema and question, identify the relevant tables and columns.

Schema: ${JSON.stringify(schema, null, 2)}

Question: "${question}"

Return ONLY a JSON object with:
{
  "tables": ["table1", "table2"],
  "columns": {"table1": ["col1", "col2"]},
  "reasoning": "brief explanation"
}`;

    const response = await callOpenAI(prompt, model);
    return JSON.parse(response);
}

// Agent: Subproblem Identification
async function subproblemAgent(question, linkedSchema, model) {
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

    const response = await callOpenAI(prompt, model);
    return JSON.parse(response);
}

// Agent: Query Plan Generation
async function queryPlanAgent(question, linkedSchema, subproblems, model) {
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

    const response = await callOpenAI(prompt, model);
    return JSON.parse(response);
}

// Agent: SQL Generation
async function sqlGenerationAgent(question, queryPlan, linkedSchema, model) {
    const prompt = `Generate the exact SQL query based on this plan.

Question: "${question}"
Plan: ${JSON.stringify(queryPlan)}
Schema: ${JSON.stringify(linkedSchema)}

Return ONLY the SQL query, no explanations or markdown.`;

    const response = await callOpenAI(prompt, model, false);
    return response.replace(/```sql\n?/g, '').replace(/```\n?/g, '').trim();
}

// Agent: Correction Plan
async function correctionPlanAgent(question, incorrectSQL, error, linkedSchema, model) {
    const prompt = `Analyze this SQL error and provide a correction plan.

Question: "${question}"
Failed SQL: ${incorrectSQL}
Error: ${error}
Schema: ${JSON.stringify(linkedSchema)}

Return ONLY a JSON object with:
{
  "error_categories": ["schema_link.col_missing"],
  "root_cause": "explanation",
  "correction_plan": {"steps": [...]}
}`;

    const response = await callOpenAI(prompt, model);
    return JSON.parse(response);
}

// Agent: Correction SQL
async function correctionSQLAgent(question, incorrectSQL, correctionPlan, linkedSchema, model) {
    const prompt = `Fix the SQL query based on the correction plan.

Question: "${question}"
Incorrect SQL: ${incorrectSQL}
Correction Plan: ${JSON.stringify(correctionPlan)}
Schema: ${JSON.stringify(linkedSchema)}

IMPORTANT: Use the EXACT column names from the error message.
Return ONLY the corrected SQL query, no explanations.`;

    const response = await callOpenAI(prompt, model, false);
    return response.replace(/```sql\n?/g, '').replace(/```\n?/g, '').trim();
}

// Call OpenAI API
async function callOpenAI(prompt, model, jsonMode = true) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            ...(jsonMode && { response_format: { type: 'json_object' } })
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'OpenAI API error');
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// Display results
function displayResults(results, sql, executionTime, attempts) {
    resultsSection.classList.remove('hidden');

    // Results table
    const resultsTable = document.getElementById('results-table');
    if (results.length > 0) {
        const headers = Object.keys(results[0]);
        let html = '<table><thead><tr>';
        headers.forEach(h => html += `<th>${h}</th>`);
        html += '</tr></thead><tbody>';

        results.forEach(row => {
            html += '<tr>';
            headers.forEach(h => html += `<td>${row[h]}</td>`);
            html += '</tr>';
        });

        html += '</tbody></table>';
        resultsTable.innerHTML = html;
    } else {
        resultsTable.innerHTML = '<p>No results found.</p>';
    }

    // SQL
    document.getElementById('final-sql').textContent = sql;

    // Metrics
    document.getElementById('metrics-grid').innerHTML = `
        <div class="metric-card">
            <div class="metric-value">${results.length}</div>
            <div class="metric-label">Rows Returned</div>
        </div>
        <div class="metric-card">
            <div class="metric-value">${executionTime}ms</div>
            <div class="metric-label">Execution Time</div>
        </div>
        <div class="metric-card">
            <div class="metric-value">${attempts + 1}</div>
            <div class="metric-label">Attempts</div>
        </div>
        <div class="metric-card">
            <div class="metric-value">6</div>
            <div class="metric-label">Agents Used</div>
        </div>
    `;
}
