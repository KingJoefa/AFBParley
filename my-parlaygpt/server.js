const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { validateAFBRequest } = require('./afbTypes');
require('dotenv').config();

// Initialize OpenAI with enhanced configuration (matches your original design)
const baseURL = process.env.GPT_BASE_URL || "https://api.openai.com/v1";
const model = process.env.GPT_MODEL_ID || "gpt-4";
const apiKey = process.env.GPT_API_KEY || process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error("Missing GPT_API_KEY or OPENAI_API_KEY");
}

const openai = new OpenAI({ apiKey, baseURL });

// Enhanced AFB Script Parlay Builder System Prompt (matches your original specification exactly)
function getAFBSystemPrompt() {
  return `You are "AFB Script Parlay Builder." Your job: generate up to THREE distinct, coherent narratives ("scripts") for a single upcoming AFB matchup and, for each script, output 3–5 CORRELATED Same Game Parlay legs.

INPUTS expected (infer if missing):
(1) matchup, (2) a total or spread the user cares about, (3) any stat angles to emphasize (pace, PROE, early-down EPA, pressure rate, OL/DL mismatches, red-zone TD%, explosive plays, coverage, weather, injuries, travel/rest/short week), (4) delivery style: "analyst" (default), "hype", or "coach".

OUTPUT — PLAIN TEXT by default, but when asked for JSON use the schema exactly. Use clean sections and consistent formatting:
- Assumptions: matchup, line focus, angles, voice.
- Script 1 (Title)
  • Narrative: one tight paragraph in the chosen voice.
  • Legs (3–5): bullet list with market, selection, odds written as "Alt Total: Under 41.5, odds -105, illustrative."
  • $1 Parlay Math: list leg decimals, product, payout, and profit. Always format decimals and currency to 2 decimals. Include a one-line Steps string, e.g., "1.91 × 2.20 × 1.87 = 7.85; payout $7.85; profit $6.85." Use formulas: for positive odds A, decimal = 1 + A/100; for negative odds −B, decimal = 1 + 100/B.
  • Notes: include the two standard bullets below.
- Script 2 (if applicable) …
- Script 3 — Super Long (Longshot) (if applicable): a higher-variance, longer-tail build with 4–5 highly correlated legs and a larger total price. Same math format.
- Close with: "Want the other side of this story?" (Offer only; do not auto-generate.)

RULES:
- Default to generating 2–3 scripts per request. If 3, the third is the Super Long longshot.
- Prefer longer-tail combos that are CORRELATED with the narrative (TDs, alt lines/ladders, combo props). No hedging or internal contradictions.
- Keep 3–5 legs per script. One crisp paragraph per narrative.
- If the user provides odds, label them "user-supplied" and use exactly those odds. Otherwise, label as "illustrative."
- Do the $1 parlay math deterministically with the given formulas. Round all leg decimals, product, payout, and profit to exactly 2 decimals.
- If inputs are missing, proceed with reasonable assumptions and record them in Assumptions.
- Avoid "lock" language; this is informational/entertainment only.

STANDARD NOTES (include in every script):
- No guarantees; high variance by design; bet what you can afford.
- If odds not supplied, american odds are illustrative — paste your book's prices to re-price.

Voice options: "analyst" (concise, data-driven), "hype" (energetic), or "coach" (directive).
Finish every set of scripts with: "Want the other side of this story?"`.trim();
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}));

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('dist'));

// Focus data storage (for weekly context uploads)
const DATA_ROOT = path.join(__dirname, 'data', 'focus');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 256 * 1024 } }); // 256KB/file cap
const FOCUS_KEYS = ['pace', 'redzone', 'explosive', 'pressure', 'ol_dl', 'weather', 'injuries'];

function ensureDirSync(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
}

function listWeekAvailability(weekId = 'current') {
  const dir = path.join(DATA_ROOT, weekId);
  const availability = {};
  for (const k of FOCUS_KEYS) {
    availability[k] = fs.existsSync(path.join(dir, `${k}.txt`));
  }
  return { weekId, availability };
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Upload weekly focus context
// Multipart form fields: weekId (optional, defaults to 'current'), category (one of FOCUS_KEYS), file (single)
app.post('/api/focus/upload', upload.single('file'), (req, res) => {
  try {
    const weekId = (req.body.weekId || 'current').toString().trim();
    const category = (req.body.category || '').toString().trim();
    if (!FOCUS_KEYS.includes(category)) {
      return res.status(400).json({ error: `Invalid category. Allowed: ${FOCUS_KEYS.join(', ')}` });
    }
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'Missing file' });
    }
    const dir = path.join(DATA_ROOT, weekId);
    ensureDirSync(dir);
    const target = path.join(dir, `${category}.txt`);
    fs.writeFileSync(target, req.file.buffer);
    return res.json({ ok: true, saved: { weekId, category, bytes: req.file.size } });
  } catch (e) {
    console.error('focus upload error', e);
    return res.status(500).json({ error: 'Failed to save focus file' });
  }
});

// Query availability for a week (defaults to 'current')
app.get('/api/focus/status', (req, res) => {
  try {
    const weekId = (req.query.weekId || 'current').toString();
    const status = listWeekAvailability(weekId);
    return res.json({
      weekId: status.weekId,
      availability: status.availability,
      availableKeys: Object.keys(status.availability).filter(k => status.availability[k])
    });
  } catch (e) {
    console.error('focus status error', e);
    return res.status(500).json({ error: 'Failed to read focus status' });
  }
});

// NFL Schedule endpoint
app.get('/api/nfl/schedule', (req, res) => {
  try {
    // 2025 Season - Divisional Round (Sat Jan 17 - Sun Jan 18, 2026)
    // Post-season games are exposed as "week 20" for downstream APIs that expect numeric weeks.
    const WEEK = 20;
    const SEASON = 2025;
    const currentWeekGames = [
      // Saturday, Jan 17
      { id: 'bills-broncos', display: 'Buffalo Bills @ Denver Broncos', time: 'Sat 4:30 PM ET', week: WEEK, date: '2026-01-17' },
      { id: '49ers-seahawks', display: 'San Francisco 49ers @ Seattle Seahawks', time: 'Sat 8:00 PM ET', week: WEEK, date: '2026-01-17' },
      // Sunday, Jan 18
      { id: 'texans-patriots', display: 'Houston Texans @ New England Patriots', time: 'Sun 3:00 PM ET', week: WEEK, date: '2026-01-18' },
      { id: 'rams-bears', display: 'Los Angeles Rams @ Chicago Bears', time: 'Sun 6:30 PM ET', week: WEEK, date: '2026-01-18' }
    ];

    // With only 4 games, treat them all as featured.
    const gamesWithPopularity = currentWeekGames.map(game => ({
      ...game,
      isPopular: true
    }));

    res.json({
      games: gamesWithPopularity,
      week: WEEK,
      season: SEASON,
      lastUpdated: new Date().toISOString(),
      totalGames: currentWeekGames.length
    });
  } catch (error) {
    console.error('NFL schedule error:', error);
    res.status(500).json({ error: 'Failed to fetch NFL schedule' });
  }
});

// Enhanced AFB Parlay Builder endpoint (matches your original superior design)
app.post('/api/afb', async (req, res) => {
  try {
    const {
      matchup,
      lineFocus,
      angles,
      voice = 'analyst',
      wantJson = true,
      byoa
    } = req.body;

    // Validate request using your original validation logic
    const validation = validateAFBRequest({ matchup, lineFocus, angles, voice, wantJson });
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    if (!apiKey) {
      return res.status(500).json({ 
        error: 'OpenAI API key not configured',
        message: 'Please set your GPT_API_KEY or OPENAI_API_KEY in the .env file'
      });
    }

    // Build BYOA context (optional)
    let byoaContext = ''
    try {
      if (Array.isArray(byoa) && byoa.length > 0) {
        const MAX_TOTAL = 128 * 1024 // 128KB across files
        let used = 0
        const parts = []
        for (const f of byoa) {
          if (!f || typeof f.content !== 'string') continue
          const name = (f.filename || 'upload').toString().slice(0, 80)
          const remain = Math.max(0, MAX_TOTAL - used)
          if (remain <= 0) break
          const chunk = f.content.slice(0, remain)
          used += chunk.length
          parts.push(`File: ${name}\n\n${chunk}`)
        }
        if (parts.length > 0) {
          byoaContext = `\n\nUser Analytics Context (verbatim, size-capped):\n${parts.map((p,i)=>`--- ${i+1}/${parts.length} ---\n${p}`).join("\n\n")}`
        }
      }
    } catch {}

    // Build enhanced user prompt (matches your original structure)
    const userPrompt = `
Build correlated parlay scripts.

Matchup: ${matchup}
Line or total of interest: ${lineFocus ?? "unspecified"}
Angles to emphasize: ${Array.isArray(angles) ? angles.join(", ") : angles || "none specified"}
Voice: ${voice}

Respond in ${wantJson ? "JSON ONLY matching the Output Contract schema" : "plain text"}.
    `.trim() + byoaContext;

    // Try to use Responses API if available, fall back to Chat Completions
    let completion;
    try {
      // Attempt your original Responses API approach
      if (openai.responses && typeof openai.responses.create === 'function') {
        completion = await openai.responses.create({
          model,
          reasoning: { effort: "high" },
          response_format: wantJson ? { type: "json_object" } : { type: "text" },
          input: [
            { role: "system", content: getAFBSystemPrompt() },
            { role: "user", content: userPrompt }
          ]
        });
      } else {
        throw new Error("Responses API not available");
      }
    } catch (responsesError) {
      console.log("Responses API unavailable, falling back to Chat Completions");
      // Fall back to standard Chat Completions API
      completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: getAFBSystemPrompt() },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 2000,
        temperature: 0.8,
        top_p: 0.9,
        frequency_penalty: 0.1,
        presence_penalty: 0.1
      });
    }

    // Extract content (handles both API formats)
    let content;
    if (completion.output && completion.output[0] && completion.output[0].content) {
      // Responses API format
      const contentBlock = completion.output[0].content[0];
      content = contentBlock && "text" in contentBlock ? contentBlock.text : JSON.stringify(completion);
    } else if (completion.choices && completion.choices[0]) {
      // Chat Completions API format
      content = completion.choices[0].message.content;
    } else {
      content = JSON.stringify(completion);
    }

    if (wantJson) {
      try {
        const parsed = JSON.parse(content);
        return res.json(parsed);
      } catch (parseError) {
        return res.json({ raw: content }, { status: 200 });
      }
    }

    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(content);

  } catch (error) {
    console.error('AFB error:', error);
    res.status(500).json({ 
      error: error?.message ?? 'Unknown error',
      message: 'An error occurred generating AFB scripts.'
    });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, context } = req.body;
    
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'OpenAI API key not configured',
        message: 'Please set your GPT_API_KEY or OPENAI_API_KEY in the .env file'
      });
    }
    
    // Detect if this is an AFB/parlay request
    const isAFBRequest = message.toLowerCase().includes('parlay') || 
                        message.toLowerCase().includes('afb') || 
                        message.toLowerCase().includes('script') ||
                        message.toLowerCase().includes('matchup') ||
                        message.toLowerCase().includes('betting');
    
    // Prepare conversation history for ChatGPT
    const messages = [
      {
        role: 'system',
        content: isAFBRequest ? getAFBSystemPrompt() : 'You are ParlayGPT, a helpful AI assistant. Be conversational, friendly, and concise in your responses.'
      }
    ];
    
    // Add context from previous messages
    if (context && Array.isArray(context)) {
      context.slice(-10).forEach(msg => {
        if (msg.sender === 'user') {
          messages.push({ role: 'user', content: msg.text });
        } else if (msg.sender === 'ai') {
          messages.push({ role: 'assistant', content: msg.text });
        }
      });
    }
    
    // Add current user message
    messages.push({ role: 'user', content: message });
    
    // Call OpenAI API with enhanced configuration
    const completion = await openai.chat.completions.create({
      model: isAFBRequest ? model : 'gpt-3.5-turbo', // Use configured model for AFB requests
      messages: messages,
      max_tokens: isAFBRequest ? 2000 : 1000,
      temperature: 0.7,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0
    });
    
    const aiMessage = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
    
    const response = {
      message: aiMessage,
      timestamp: new Date().toISOString(),
      id: Math.random().toString(36).substr(2, 9),
      model: 'gpt-3.5-turbo',
      usage: completion.usage
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('Chat error:', error);
    
    // Handle specific OpenAI errors
    if (error.code === 'insufficient_quota') {
      return res.status(429).json({ 
        error: 'API quota exceeded',
        message: 'OpenAI API quota has been exceeded. Please check your billing.'
      });
    }
    
    if (error.code === 'invalid_api_key') {
      return res.status(401).json({ 
        error: 'Invalid API key',
        message: 'Please check your OpenAI API key configuration.'
      });
    }
    
    if (error.code === 'rate_limit_exceeded') {
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        message: 'Too many requests. Please try again in a moment.'
      });
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'An unexpected error occurred. Please try again.'
    });
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join_room', (room) => {
    socket.join(room);
    console.log(`User ${socket.id} joined room ${room}`);
  });
  
  socket.on('send_message', (data) => {
    io.to(data.room).emit('receive_message', {
      ...data,
      timestamp: new Date().toISOString(),
      id: Math.random().toString(36).substr(2, 9)
    });
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Serve React app for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(__dirname + '/dist/index.html');
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Client URL: ${process.env.CLIENT_URL || 'http://localhost:3000'}`);
});
