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

app.post('/api/chat', async (req, res) => {
  try {
    const { message, context } = req.body;
    
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ 
        error: 'OpenAI API key not configured',
        message: 'Please set your OPENAI_API_KEY in the .env file'
      });
    }
    
    // Prepare conversation history for ChatGPT
    const messages = [
      {
        role: 'system',
        content: 'You are ParlayGPT, a helpful AI assistant. Be conversational, friendly, and concise in your responses.'
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
