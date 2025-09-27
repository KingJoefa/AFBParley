const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const OpenAI = require('openai');
require('dotenv').config();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// AFB Script Parlay Builder System Prompt
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
Finish every set of scripts with: "Want the other side of this story?"`;
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

// Dedicated AFB Parlay Builder endpoint
app.post('/api/afb', async (req, res) => {
  try {
    const { matchup, line, angles, voice = 'analyst', format = 'text' } = req.body;
    
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ 
        error: 'OpenAI API key not configured',
        message: 'Please set your OPENAI_API_KEY in the .env file'
      });
    }
    
    // Build AFB-specific prompt
    let promptMessage = `Generate AFB scripts for`;
    if (matchup) promptMessage += ` ${matchup}`;
    if (line) promptMessage += `, focusing on ${line}`;
    if (angles) promptMessage += `, emphasizing ${angles}`;
    if (voice !== 'analyst') promptMessage += ` in ${voice} voice`;
    if (format === 'json') promptMessage += `. Return as JSON format.`;
    
    const messages = [
      { role: 'system', content: getAFBSystemPrompt() },
      { role: 'user', content: promptMessage }
    ];
    
    // Call OpenAI API with AFB-optimized settings
    const completion = await openai.chat.completions.create({
      model: 'gpt-4', // Use GPT-4 for better analysis
      messages: messages,
      max_tokens: 2000, // More tokens for detailed scripts
      temperature: 0.8, // Slightly higher for creative narratives
      top_p: 0.9,
      frequency_penalty: 0.1,
      presence_penalty: 0.1
    });
    
    const response = {
      scripts: completion.choices[0]?.message?.content || 'Could not generate scripts.',
      timestamp: new Date().toISOString(),
      model: 'gpt-4',
      usage: completion.usage,
      parameters: { matchup, line, angles, voice, format }
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('AFB error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'An error occurred generating AFB scripts.'
    });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, context } = req.body;
    
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ 
        error: 'OpenAI API key not configured',
        message: 'Please set your OPENAI_API_KEY in the .env file'
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
    
    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: messages,
      max_tokens: 1000,
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
