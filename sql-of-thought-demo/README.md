# SQL-of-Thought Demo

A working demonstration of the [SQL-of-Thought paper](https://arxiv.org/abs/2509.00581) - Multi-agent Text-to-SQL with Guided Error Correction.

## 🎯 Overview

This demo implements the SQL-of-Thought framework using:
- **Multi-agent architecture** with specialized agents
- **Chain-of-Thought reasoning** for query planning
- **Taxonomy-guided error correction** loop
- **DuckDB** for SQL execution
- **Chinook database** (music store database with 11 tables)

## 🏗️ Architecture

```
Question → Schema Linking → Subproblem → Query Plan → SQL Generation
                                                              ↓
                                                          Execute
                                                              ↓
                                                    Success? → Done
                                                              ↓ No
                                            Correction Plan → Correction SQL
                                                              ↓
                                                          (Loop back)
```

### Agents

1. **Schema Linking Agent** - Identifies relevant tables and columns
2. **Subproblem Agent** - Decomposes query into SQL clauses
3. **Query Plan Agent** - Creates step-by-step execution plan (CoT)
4. **SQL Agent** - Generates executable SQL
5. **Correction Plan Agent** - Analyzes errors using taxonomy
6. **Correction SQL Agent** - Fixes SQL based on correction plan

## 🚀 Setup

### Prerequisites

- Node.js 18+
- OpenAI API key (GPT-4o-mini)

### Installation

```bash
cd sql-of-thought-demo
npm install
```

### Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Add your OpenAI API key to `.env`:
```env
OPENAI_API_KEY=your_key_here
```

## 📊 Running the Demo

### Test Queries

The demo includes 3 test queries of increasing complexity:

1. **Simple**: "List all customers from USA"
2. **Medium**: "What are the top 5 best-selling tracks by total revenue?"
3. **Complex**: "Show me the total sales amount for each employee"

### Run a Query

```bash
# Run default query (query 0)
npm start

# Run specific query by index
npm start 1

# Watch mode for development
npm run dev
```

### Expected Output

```
🚀 SQL-of-Thought: Multi-agent Text-to-SQL
================================================================================

📝 Question: What are the top 5 best-selling tracks by total revenue?

📊 [Schema Linking Agent] Analyzing question...
  ✓ Identified tables: ['tracks', 'invoice_items']

🧩 [Subproblem Agent] Breaking down query...
  ✓ Identified clauses: ['SELECT', 'FROM', 'JOIN', 'GROUP BY', 'ORDER BY', 'LIMIT']

🤔 [Query Plan Agent] Generating execution plan...
  ✓ Generated plan with 6 steps

⚡ [SQL Agent] Generating SQL query...
  ✓ Generated SQL

📄 Generated SQL:
 SELECT t.Name, SUM(ii.UnitPrice * ii.Quantity) as TotalRevenue
 FROM tracks t
 JOIN invoice_items ii ON t.TrackId = ii.TrackId
 GROUP BY t.TrackId, t.Name
 ORDER BY TotalRevenue DESC
 LIMIT 5

⚙️  Executing SQL...
✅ Query executed successfully!
📊 Returned 5 rows in 12ms

📋 Results (first 5 rows):
[
  { "Name": "The Woman King", "TotalRevenue": 3.98 },
  ...
]
```

## 🌐 Browser Demo (Coming Soon)

The browser demo with DuckDB WASM will allow you to:
- Input custom questions
- See live agent execution
- Visualize the reasoning process
- View error corrections in real-time

## 📁 Project Structure

```
sql-of-thought-demo/
├── src/
│   ├── agent.ts              # Main orchestrator
│   ├── tools/
│   │   ├── schema-tool.ts    # Schema extraction
│   │   └── sql-executor-tool.ts  # SQL execution
│   ├── prompts/              # Agent prompts
│   └── web/                  # Browser interface (WIP)
├── data/
│   ├── chinook.db            # Chinook database
│   └── error-taxonomy.json   # Error categories
└── scripts/
    └── convert-db.ts         # SQLite→DuckDB converter
```

## 🎓 Paper Implementation Details

### Key Differences from Paper

- **Model**: GPT-4o-mini instead of Claude Opus (cost-effective)
- **Error Taxonomy**: Simplified from 31 to 20 most common categories
- **Correction Loop**: Max 2 attempts (paper uses 3-5)
- **No self-consistency**: Single generation per step

### Matching Paper Features

✅ Multi-agent decomposition
✅ Chain-of-Thought query planning
✅ Taxonomy-guided error correction
✅ Schema linking
✅ Subproblem identification
✅ Iterative correction loop

## 📈 Results

Expected execution accuracy on test queries: ~80-85% (vs 91.59% in paper with Claude Opus)

The accuracy difference is due to:
- Using GPT-4o-mini vs Claude Opus
- Simplified error taxonomy
- Single-pass generation

## 🔧 Customization

### Add Your Own Database

1. Place your SQLite database in `data/`
2. Update `DB_PATH` in `src/agent.ts`
3. Run the demo

### Modify Error Taxonomy

Edit `data/error-taxonomy.json` to add/remove error categories.

### Change LLM Model

Update `.env`:
```env
OPENAI_MODEL=gpt-4o  # For better accuracy
```

## 📝 Medium Article

This demo is designed to accompany a Medium article explaining SQL-of-Thought. The article will cover:

1. Why Text-to-SQL is hard
2. How SQL-of-Thought solves it
3. Live demo walkthrough
4. Implementation insights
5. Cost vs accuracy tradeoffs

## 🤝 Contributing

This is a demo project for educational purposes. Feel free to:
- Open issues for bugs
- Suggest improvements
- Add new features

## 📚 References

- [SQL-of-Thought Paper](https://arxiv.org/abs/2509.00581)
- [Spider Dataset](https://yale-lily.github.io/spider)
- [Chinook Database](https://github.com/lerocha/chinook-database)
- [Claude Agent SDK](https://github.com/anthropics/anthropic-sdk-typescript)

## 📄 License

MIT License - See LICENSE file for details

---

Built with ❤️ for the SQL-of-Thought paper demonstration
