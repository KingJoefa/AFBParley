import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const App = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
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
    setInputMessage('');
    setIsLoading(true);

    try {
      // Send to AI API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: inputMessage,
          context: messages.slice(-5) // Send last 5 messages for context
        }),
      });

      const aiResponse = await response.json();
      
      // Add AI response
      const aiMessage = {
        text: aiResponse.message,
        sender: 'ai',
        timestamp: aiResponse.timestamp,
        room: 'general'
      };
      
      setMessages(prev => [...prev, aiMessage]);
      
      // Also emit to other connected users
      if (socketRef.current) {
        socketRef.current.emit('send_message', aiMessage);
      }
      
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = {
        text: 'Sorry, I encountered an error. Please try again.',
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
        <div className="connection-status">
          <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></span>
          {isConnected ? 'Connected' : 'Disconnected'}
        </div>
      </header>
      
      <main className="chat-container">
        <div className="messages-container">
          {messages.length === 0 && (
            <div className="welcome-message">
              <h2>Welcome to ParlayGPT! 👋</h2>
              <p>Start a conversation by typing a message below.</p>
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
              placeholder="Type your message..."
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
