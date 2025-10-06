# 🌐 SQL-of-Thought Browser Demo

A browser-based demonstration of the SQL-of-Thought multi-agent framework using DuckDB WASM.

## Features

✅ **100% Browser-Based** - No backend required
✅ **DuckDB WASM** - SQL execution entirely in the browser
✅ **Real-time Agent Visualization** - Watch each agent work in real-time
✅ **Error Correction Loop** - See taxonomy-guided corrections happen live
✅ **Interactive UI** - Beautiful dark-mode interface with agent flow visualization

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Dev Server

```bash
npm run web
```

This will open `http://localhost:3000` in your browser.

### 3. Enter Your API Key

- Get an OpenAI API key from https://platform.openai.com/api-keys
- Enter it in the "OpenAI API Key" field
- It's stored locally in your browser (never sent to any server except OpenAI)

### 4. Try Example Queries

Click on any of the example query buttons:
- **Simple**: "List all customers from USA"
- **Medium**: "What are the top 5 best-selling tracks by total revenue?"
- **Complex**: "Show me the total sales amount for each employee"

Or write your own!

## How It Works

### Architecture

```
Browser Frontend (Vite + Vanilla JS)
├── DuckDB WASM (SQL execution in browser)
├── OpenAI API (Multi-agent LLM calls)
└── Real-time UI Updates (Agent status visualization)
```

### Agent Flow

1. **Schema Linking Agent** 📊
   - Identifies relevant tables and columns
   - Extracts schema from DuckDB WASM

2. **Subproblem Agent** 🧩
   - Breaks query into SQL clauses (SELECT, WHERE, JOIN, etc.)

3. **Query Plan Agent** 🤔
   - Creates step-by-step execution plan
   - Uses Chain-of-Thought reasoning

4. **SQL Generation Agent** ⚡
   - Generates executable SQL from the plan

5. **Execute SQL** ⚙️
   - Runs query against DuckDB WASM
   - If error → enters correction loop

6. **Correction Loop** 🔍 (if needed)
   - **Correction Plan Agent**: Analyzes error using taxonomy
   - **Correction SQL Agent**: Fixes SQL based on plan
   - Retries execution (max 3 attempts)

### Database

The demo uses the **Chinook database** (music store):
- **11 tables**: customers, employees, invoices, tracks, albums, artists, etc.
- **Relationships**: Complex joins demonstrating real-world scenarios
- **Loaded via DuckDB WASM**: Entirely in-browser, no server needed

## Development

### File Structure

```
src/web/
├── index.html          # Main HTML structure
├── styles.css          # Dark mode UI styling
└── app.js              # Agent orchestration + DuckDB WASM logic
```

### Building for Production

```bash
npm run build
```

Output will be in `dist/` directory. Deploy to:
- GitHub Pages
- Netlify
- Vercel
- Any static hosting

### Customization

**Change the model:**
```javascript
// In app.js, modify the model selection
const model = 'gpt-4o-mini'; // or 'gpt-4o', 'gpt-4'
```

**Add more example queries:**
```html
<!-- In index.html -->
<button class="example-btn" data-query="Your query here">
  Label
</button>
```

**Customize error taxonomy:**
```javascript
// Add more error categories in correctionPlanAgent()
```

## Cost Considerations

**Approximate costs per query (with GPT-4o-mini):**
- Simple query: ~$0.01 - $0.02
- Medium query: ~$0.03 - $0.05
- Complex query (with corrections): ~$0.08 - $0.15

**Token usage:**
- Schema Linking: ~500-1000 tokens
- Subproblem: ~300-500 tokens
- Query Plan: ~800-1500 tokens
- SQL Generation: ~400-800 tokens
- Correction (if needed): ~1000-2000 tokens per attempt

## Troubleshooting

### "DuckDB failed to initialize"
- Ensure you're using a modern browser (Chrome/Firefox/Edge)
- Check browser console for detailed errors
- Try refreshing the page

### "OpenAI API error"
- Verify your API key is correct
- Check you have credits in your OpenAI account
- Ensure the selected model is available to your API key

### "SQL execution failed repeatedly"
- The correction loop tries 3 times
- Check the error messages in the Correction Agent output
- Try simplifying your question
- Verify the question matches data in the Chinook database

### DuckDB WASM not loading
- Some browsers block Web Workers
- Try disabling strict security settings
- Use Chrome/Firefox for best compatibility

## Browser Compatibility

| Browser | Status |
|---------|--------|
| Chrome 90+ | ✅ Fully Supported |
| Firefox 88+ | ✅ Fully Supported |
| Edge 90+ | ✅ Fully Supported |
| Safari 15+ | ⚠️ Partial (WASM limitations) |
| Mobile | ❌ Not recommended (high memory usage) |

## Performance

**Initial Load:**
- DuckDB WASM bundle: ~5-10 MB
- Initialization time: ~2-5 seconds

**Query Execution:**
- Simple queries: 3-8 seconds (mostly LLM calls)
- Complex queries: 10-30 seconds (with corrections)
- SQL execution in DuckDB: <100ms

## Security

- **API Key**: Stored in `localStorage`, only sent to OpenAI
- **No backend**: All processing happens in your browser
- **Data privacy**: Database queries never leave your machine
- **CORS**: OpenAI API calls made directly from browser

## Next Steps

Want to enhance the demo?

1. **Add more databases**: Load different SQLite files
2. **Add visualization**: Chart.js for result visualization
3. **Export results**: Download as CSV/JSON
4. **Add examples**: Pre-loaded complex queries
5. **Cost tracker**: Show running token costs
6. **Save queries**: LocalStorage for query history

## Learn More

- 📄 [SQL-of-Thought Paper](https://arxiv.org/abs/2509.00581)
- 🦆 [DuckDB WASM Docs](https://duckdb.org/docs/api/wasm)
- 🤖 [OpenAI API Docs](https://platform.openai.com/docs)

## License

MIT License - Free to use for educational and commercial purposes

---

Built with ❤️ for the SQL-of-Thought paper demonstration
