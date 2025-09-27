# 🎯 ParlayGPT

A modern, real-time AI conversation platform built with React, Node.js, and Socket.io.

## ✨ Features

- 💬 Real-time chat interface
- 🤖 AI-powered conversations
- 🚀 Modern React frontend
- ⚡ Socket.io for real-time updates
- 🔒 Security best practices
- 📱 Responsive design
- 🎨 Beautiful gradient UI

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
# Copy .env and update with your values
cp .env .env.local
# Edit .env.local with your actual API keys
```

3. Start development servers:

**Terminal 1 - Backend:**
```bash
npm run dev
```

**Terminal 2 - Frontend:**
```bash
npm run dev:client
```

4. Open http://localhost:3000 in your browser

### Production Build

```bash
npm run build
npm start
```

## 🛠️ Tech Stack

### Frontend
- **React 18** - Modern UI library
- **Socket.io Client** - Real-time communication
- **Webpack** - Module bundler
- **CSS3** - Styling with gradients and animations

### Backend
- **Node.js** - Runtime environment
- **Express** - Web framework
- **Socket.io** - Real-time bidirectional communication
- **Helmet** - Security middleware
- **Rate Limiting** - API protection

### Security Features
- Content Security Policy (CSP)
- Rate limiting
- CORS protection
- Input validation
- Environment variable protection

## 📁 Project Structure

```
parlaygpt/
├── src/                    # Frontend source
│   ├── App.js             # Main React component
│   ├── index.js           # React entry point
│   ├── index.html         # HTML template
│   └── styles.css         # Application styles
├── server.js              # Express server
├── webpack.config.js      # Webpack configuration
├── package.json           # Dependencies
├── .env                   # Environment variables
└── README.md             # This file
```

## 🔧 Configuration

### Environment Variables

```bash
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:3000
OPENAI_API_KEY=your_openai_api_key_here
JWT_SECRET=your_jwt_secret_here
MONGODB_URI=mongodb://localhost:27017/parlaygpt
```

### API Endpoints

- `GET /api/health` - Health check
- `POST /api/chat` - Send message to AI
- `GET /*` - Serve React app (SPA fallback)

### Socket Events

- `join_room` - Join a chat room
- `send_message` - Send message to room
- `receive_message` - Receive message from room

## 🎨 UI Features

- **Gradient Background** - Beautiful purple-blue gradient
- **Glass Morphism** - Frosted glass effects
- **Smooth Animations** - CSS transitions and keyframes
- **Responsive Design** - Mobile-first approach
- **Real-time Status** - Connection indicator
- **Typing Indicator** - Shows when AI is responding

## 🔒 Security

- Helmet.js for security headers
- Rate limiting (100 requests per 15 minutes)
- CORS configuration
- Input sanitization
- Environment variable protection
- CSP headers

## 📱 Responsive Design

- Desktop: Full-width chat with sidebar potential
- Tablet: Optimized layout with touch-friendly controls
- Mobile: Single-column layout with swipe gestures

## 🚀 Deployment

### Heroku
```bash
git init
git add .
git commit -m "Initial commit"
heroku create your-app-name
git push heroku main
```

### Vercel/Netlify
Build command: `npm run build`
Publish directory: `dist`

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- OpenAI for GPT API
- Socket.io team for real-time capabilities
- React team for the amazing framework
- The open-source community

---

**Happy Parlaying! 🎯💬**
