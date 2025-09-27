import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { buildAFBScripts, parseAFBInput, isAFBRequest } from './afbClient';

const App = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [afbMode, setAfbMode] = useState(false);
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io(process.env.NODE_ENV === 'production' ? window.location.origin : 'http://localhost:5000');
    
    socketRef.current.on('connect', () => {
      setIsConnected(true);
      socketRef.current.emit('join_room', 'general');
    });
    
    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
    });
    
    socketRef.current.on('receive_message', (message) => {
      setMessages(prev => [...prev, message]);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = {
      text: inputMessage,
      sender: 'user',
      timestamp: new Date().toISOString(),
      room: 'general'
    };

    // Add user message immediately
    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputMessage;
    setInputMessage('');
    setIsLoading(true);

    try {
      let aiResponse;
      
      // Enhanced logic: Use AFB mode or detect AFB-style requests
      if (afbMode || isAFBRequest(currentInput)) {
        // Parse input for AFB parameters
        const afbParams = parseAFBInput(currentInput);
        
        if (afbParams.matchup) {
          // Use dedicated AFB endpoint
          const afbResult = await buildAFBScripts(afbParams);
          
          aiResponse = {
            message: typeof afbResult === 'string' ? afbResult : JSON.stringify(afbResult, null, 2),
            timestamp: new Date().toISOString(),
            isAFB: true,
            afbData: afbResult
          };
        } else {
          // Fall back to chat if matchup not found
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: currentInput,
              context: messages.slice(-5)
            }),
          });
          aiResponse = await response.json();
        }
      } else {
        // Standard chat endpoint
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: currentInput,
            context: messages.slice(-5)
          }),
        });
        aiResponse = await response.json();
      }
      
      // Add AI response
      const aiMessage = {
        text: aiResponse.message,
        sender: 'ai',
        timestamp: aiResponse.timestamp || new Date().toISOString(),
        room: 'general',
        isAFB: aiResponse.isAFB || false,
        afbData: aiResponse.afbData
      };
      
      setMessages(prev => [...prev, aiMessage]);
      
      // Also emit to other connected users
      if (socketRef.current) {
        socketRef.current.emit('send_message', aiMessage);
      }
      
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = {
        text: `Sorry, I encountered an error: ${error.message}. Please try again.`,
        sender: 'ai',
        timestamp: new Date().toISOString(),
        room: 'general'
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>🎯 ParlayGPT</h1>
        <div className="header-controls">
          <div className="mode-toggle">
            <button 
              className={`mode-btn ${!afbMode ? 'active' : ''}`}
              onClick={() => setAfbMode(false)}
            >
              💬 Chat
            </button>
            <button 
              className={`mode-btn ${afbMode ? 'active' : ''}`}
              onClick={() => setAfbMode(true)}
            >
              🎯 AFB Builder
            </button>
          </div>
          <div className="connection-status">
            <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></span>
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      </header>
      
      <main className="chat-container">
        <div className="messages-container">
          {messages.length === 0 && (
            <div className="welcome-message">
              <h2>Welcome to ParlayGPT! 👋</h2>
              {afbMode ? (
                <div>
                  <p><strong>🎯 AFB Script Parlay Builder Mode</strong></p>
                  <p>Generate correlated same-game parlay scripts for any matchup!</p>
                  <div className="afb-examples">
                    <p>Try: "Chiefs vs Bills, Over 54.5 total, analyst voice"</p>
                    <p>Or: "Ravens vs Steelers, focusing on rushing, hype voice"</p>
                  </div>
                </div>
              ) : (
                <p>Start a conversation by typing a message below.</p>
              )}
            </div>
          )}
          
          {messages.map((message, index) => (
            <div key={index} className={`message ${message.sender}`}>
              <div className="message-content">
                <span className="message-text">{message.text}</span>
                <span className="message-time">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="message ai">
              <div className="message-content">
                <span className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
        
        <form className="input-form" onSubmit={sendMessage}>
          <div className="input-container">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={afbMode ? "Enter matchup (e.g., Chiefs vs Bills, Over 54.5)..." : "Type your message..."}
              className="message-input"
              disabled={isLoading}
            />
            <button 
              type="submit" 
              className="send-button"
              disabled={!inputMessage.trim() || isLoading}
            >
              {isLoading ? '⏳' : '📤'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default App;
