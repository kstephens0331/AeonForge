# Quick Test Guide - "Never Say Can't" Features

## 🚀 Quick Start

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Environment variables** (`.env` file):
   ```bash
   # Required
   SUPABASE_URL=your_url
   SUPABASE_SERVICE_ROLE_KEY=your_key
   TOGETHER_API_KEY=your_key
   ENABLE_TOOLS=true

   # Optional (system works without these)
   SERPER_API_KEY=your_key_optional
   NEWS_API_KEY=your_key_optional
   ```

3. **Start servers:**
   ```bash
   # Terminal 1
   pnpm dev:server

   # Terminal 2
   pnpm dev:web
   ```

4. **Open:** http://localhost:3000

---

## 🧪 Test Queries

### Test 1: Wikipedia Knowledge
```
"Who is Marie Curie?"
```
**Expected:** Detailed information from Wikipedia with source citation

### Test 2: Real-Time Weather
```
"What's the weather in Tokyo?"
```
**Expected:** Current conditions (temp, humidity, wind, etc.) with source

### Test 3: Stock Prices
```
"What's the current price of Apple stock?"
```
**Expected:** Live AAPL stock data (price, change, volume)

### Test 4: Current Time
```
"What time is it in New York?"
```
**Expected:** Current time, date, timezone info for America/New_York

### Test 5: Web Search
```
"Latest news about artificial intelligence"
```
**Expected:** Recent news articles with links (if NEWS_API_KEY set) or web search results

### Test 6: Calculator
```
"Calculate 15% tip on $87.50"
```
**Expected:** Calculation result with explanation

### Test 7: Complex Multi-Part
```
"Compare the populations and GDPs of Japan and Germany"
```
**Expected:**
- Query decomposed into sub-questions
- Wikipedia data for both countries
- Comprehensive comparison
- Sources cited
- Confidence level indicated

### Test 8: Web Scraping
```
"Read the content from https://en.wikipedia.org/wiki/Artificial_intelligence and summarize the introduction"
```
**Expected:** Extracted text from the page with summary

### Test 9: Multiple Tools at Once
```
"What's the weather in London and the current price of Bitcoin?"
```
**Expected:** Both pieces of data returned together

### Test 10: Error Handling
```
"weather"
```
**Expected:** Helpful error message asking for location specification, NOT "I can't"

---

## ✅ Success Criteria

For each test, verify:

1. ✅ **No "I can't" responses** - System always tries to help
2. ✅ **Accurate information** - All facts are correct and verified
3. ✅ **Source citations** - Wikipedia, API names, or URLs provided
4. ✅ **Confidence levels** - System indicates how certain it is
5. ✅ **Complete answers** - All parts of question addressed
6. ✅ **Helpful errors** - If something unclear, gives guidance

---

## 🔍 Advanced Tests

### Test 11: Fact Verification
```
"Is it true that honey never spoils?"
```
**Expected:**
- Multiple sources checked (Wikipedia, web search)
- Confirmation with evidence
- Scientific explanation
- HIGH confidence

### Test 12: Complex Research
```
"How does photosynthesis work and why is it important for climate?"
```
**Expected:**
- Question decomposed
- Multiple sources (Wikipedia, web)
- Comprehensive explanation
- Process + importance explained
- Confidence level

### Test 13: Current Events
```
"What are the major tech news stories today?"
```
**Expected:**
- Recent headlines (if NEWS_API_KEY)
- Or web search results
- Links to articles
- Timestamps

### Test 14: Comparison Analysis
```
"Compare electric cars vs hydrogen cars for environmental impact"
```
**Expected:**
- Both technologies explained
- Multiple sources
- Pros and cons
- Evidence-based comparison
- Sources cited

### Test 15: Technical Calculation
```
"If I invest $1000 at 5% annual interest compounded monthly for 10 years, how much will I have?"
```
**Expected:**
- Correct calculation using calculator tool
- Formula explanation
- Step-by-step breakdown
- Final amount

---

## 🐛 Common Issues

### Issue: "Tool not found"
**Cause:** TypeScript not compiled or server not restarted
**Fix:**
```bash
cd apps/server
pnpm run build
pnpm run dev
```

### Issue: Rate limit errors
**Cause:** Too many requests to free APIs
**Fix:** Add optional API keys or wait a moment

### Issue: "Insufficient information"
**Cause:** Query too vague
**Expected:** System provides helpful guidance (NOT "I can't")

### Issue: Weather/stock tools not working
**Cause:** API temporarily down
**Expected:** System tries alternative source or provides helpful error

---

## 📊 Tool Usage Matrix

| Query Type | Tools Used | API Keys Needed |
|------------|------------|-----------------|
| Facts | `wikipedia_summary`, `web_search` | None (all free) |
| Weather | `get_weather` | None (wttr.in free) |
| Stocks | `get_stock_price` | None (Yahoo free) |
| Time | `get_current_time` | None (free) |
| News | `get_news`, `web_search` | Optional (NEWS_API_KEY) |
| Web Content | `scrape_webpage` | None |
| Math | `calculator` | None |
| Code | `execute_code` | None |
| Complex | Multiple tools in sequence | Depends on query |

---

## 🎯 Expected Behavior

### What You SHOULD See:
- ✅ "Let me search for that..."
- ✅ "Based on information from Wikipedia..."
- ✅ "I found X sources that confirm..."
- ✅ "Here's what the data shows..."
- ✅ "Confidence: HIGH (95%)"
- ✅ "Sources: Wikipedia, ..."

### What You Should NEVER See:
- ❌ "I don't have access to..."
- ❌ "I cannot..."
- ❌ "I'm unable to..."
- ❌ "I don't know..."
- ❌ "That's beyond my capabilities..."
- ❌ Guessed or made-up information

---

## 💡 Pro Tips

1. **Be specific:** "weather in Paris" better than "weather there"
2. **Use full names:** "Apple Inc stock" or "AAPL"
3. **Ask follow-ups:** System maintains context
4. **Test edge cases:** Vague queries, misspellings, etc.
5. **Check sources:** Every fact should have attribution
6. **Note confidence:** System tells you how sure it is

---

## 📝 Report Issues

If you see:
- System saying "I can't"
- Inaccurate information
- Missing sources
- Low confidence when it should be high
- Tools not being used

→ This is a bug! The system should ALWAYS:
1. Try multiple approaches
2. Provide accurate, verified info
3. Cite sources
4. Give helpful guidance if unclear

---

## 🎉 Success!

If all tests pass, you have a working "Never Say Can't" AI system that:
- ✅ Accesses nearly all public information
- ✅ Provides real-time data
- ✅ Verifies facts across sources
- ✅ Never leaves users helpless
- ✅ Always gives accurate, helpful responses

Ready for production use! 🚀