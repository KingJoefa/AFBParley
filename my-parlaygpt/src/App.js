import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { buildAFBScripts, parseAFBInput, isAFBRequest } from './afbClient';
import { getCurrentWeekGames, getPopularGames, formatGameDisplay, extractMatchupName } from './nflSchedule';

const App = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [afbMode, setAfbMode] = useState(false);
  const [afbFormData, setAfbFormData] = useState({
    selectedGame: '',
    customMatchup: '',
    voice: 'analyst',
    longshotLevel: 'standard',
    angles: [],
    lineFocus: ''
  });
  const [nflGames, setNflGames] = useState([]);
  const [popularGames, setPopularGames] = useState([]);
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io(process.env.NODE_ENV === 'production' ? window.location.origin : 'http://localhost:8080');
    
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

    // Load current week's NFL games
    try {
      const currentGames = getCurrentWeekGames();
      const featuredGames = getPopularGames();
      setNflGames(currentGames);
      setPopularGames(featuredGames);
    } catch (error) {
      console.error('Error loading NFL games:', error);
      // Fallback to empty arrays - user can still enter custom matchups
      setNflGames([]);
      setPopularGames([]);
    }

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

  const handleAFBGenerate = async () => {
    const matchup = afbFormData.selectedGame === 'custom' ? afbFormData.customMatchup : afbFormData.selectedGame;
    
    if (!matchup) return;
    
    // Create a user message showing what they requested
    const userMessage = {
      text: `🎯 AFB Builder Request:\n• Game: ${matchup}\n• Style: ${afbFormData.voice}\n• Variance: ${afbFormData.longshotLevel}\n• Line: ${afbFormData.lineFocus || 'None specified'}\n• Focus: ${afbFormData.angles.length > 0 ? afbFormData.angles.join(', ') : 'General analysis'}`,
      sender: 'user',
      timestamp: new Date().toISOString(),
      room: 'general'
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Use AFB client to generate scripts
      const afbResult = await buildAFBScripts({
        matchup,
        lineFocus: afbFormData.lineFocus,
        angles: afbFormData.angles,
        voice: afbFormData.voice,
        wantJson: false // Get formatted text for better display
      });
      
      const aiMessage = {
        text: typeof afbResult === 'string' ? afbResult : afbResult.scripts || JSON.stringify(afbResult, null, 2),
        sender: 'ai',
        timestamp: new Date().toISOString(),
        room: 'general',
        isAFB: true,
        afbData: afbResult
      };
      
      setMessages(prev => [...prev, aiMessage]);
      
      // Also emit to other connected users
      if (socketRef.current) {
        socketRef.current.emit('send_message', aiMessage);
      }
      
    } catch (error) {
      console.error('AFB generation error:', error);
      const errorMessage = {
        text: `Sorry, I encountered an error generating your AFB scripts: ${error.message}. Please try again.`,
        sender: 'ai',
        timestamp: new Date().toISOString(),
        room: 'general'
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
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
          const response = await fetch('http://localhost:8080/api/chat', {
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
        const response = await fetch('http://localhost:8080/api/chat', {
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
                <div className="afb-builder-form">
                  <div className="afb-header">
                    <h3>🎯 AFB Script Parlay Builder</h3>
                    <p>Generate 2-3 correlated same-game parlay scripts with professional analysis</p>
                    {nflGames.length > 0 && (
                      <div className="schedule-info">
                        <span className="schedule-status">
                          📅 Showing {nflGames.length} games for Week 11 • Updated for Nov 16, 2025
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="afb-form-grid">
                    {/* Game Selection */}
                    <div className="form-section">
                      <label>🏈 This Week's NFL Games</label>
                      <select 
                        value={afbFormData.selectedGame}
                        onChange={(e) => setAfbFormData({...afbFormData, selectedGame: e.target.value, customMatchup: ''})}
                        className="afb-select"
                      >
                        <option value="">Choose from this week's games...</option>
                        
                        {/* Featured Games */}
                        {popularGames.length > 0 && (
                          <optgroup label="🔥 Featured Games">
                            {popularGames.map(game => (
                              <option key={game.id} value={extractMatchupName(game.display)}>
                                {formatGameDisplay(game)}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        
                        {/* All Games */}
                        {nflGames.length > 0 && (
                          <optgroup label="📅 All This Week's Games">
                            {nflGames.filter(game => !game.isPopular).map(game => (
                              <option key={game.id} value={extractMatchupName(game.display)}>
                                {formatGameDisplay(game)}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        
                        <option value="custom">💭 Enter Custom Matchup</option>
                      </select>
                      
                      {afbFormData.selectedGame === 'custom' && (
                        <input
                          type="text"
                          placeholder="e.g., Lions vs Vikings"
                          value={afbFormData.customMatchup}
                          onChange={(e) => setAfbFormData({...afbFormData, customMatchup: e.target.value})}
                          className="afb-input"
                        />
                      )}
                    </div>

                    {/* Line Focus */}
                    <div className="form-section">
                      <label>📊 Line Focus (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g., Over 54.5, -3.5 spread"
                        value={afbFormData.lineFocus}
                        onChange={(e) => setAfbFormData({...afbFormData, lineFocus: e.target.value})}
                        className="afb-input"
                      />
                    </div>

                    {/* Voice Style */}
                    <div className="form-section">
                      <label>🎤 Analysis Style</label>
                      <div className="radio-group">
                        {['analyst', 'hype', 'coach'].map(voice => (
                          <label key={voice} className="radio-label">
                            <input
                              type="radio"
                              name="voice"
                              value={voice}
                              checked={afbFormData.voice === voice}
                              onChange={(e) => setAfbFormData({...afbFormData, voice: e.target.value})}
                            />
                            <span className="radio-text">
                              {voice === 'analyst' && '📈 Analyst (Data-driven, concise)'}
                              {voice === 'hype' && '🔥 Hype (Energetic, exciting)'}
                              {voice === 'coach' && '🎯 Coach (Strategic, directive)'}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Longshot Level */}
                    <div className="form-section">
                      <label>🎲 Script Variance</label>
                      <div className="radio-group">
                        {[
                          { value: 'conservative', label: '🛡️ Conservative (Higher probability)' },
                          { value: 'standard', label: '⚖️ Standard (Balanced approach)' },
                          { value: 'longshot', label: '🚀 Longshot (Higher payouts)' }
                        ].map(option => (
                          <label key={option.value} className="radio-label">
                            <input
                              type="radio"
                              name="longshotLevel"
                              value={option.value}
                              checked={afbFormData.longshotLevel === option.value}
                              onChange={(e) => setAfbFormData({...afbFormData, longshotLevel: e.target.value})}
                            />
                            <span className="radio-text">{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Data Considerations */}
                    <div className="form-section full-width">
                      <label>🔍 Focus Areas (Select what matters most)</label>
                      <div className="checkbox-grid">
                        {[
                          'Pace of play', 'Red zone efficiency', 'Explosive plays', 
                          'Pressure rate', 'OL/DL matchups', 'Weather conditions',
                          'Injuries/Rest', 'Early-down EPA', 'Coverage schemes'
                        ].map(angle => (
                          <label key={angle} className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={afbFormData.angles.includes(angle)}
                              onChange={(e) => {
                                const newAngles = e.target.checked 
                                  ? [...afbFormData.angles, angle]
                                  : afbFormData.angles.filter(a => a !== angle);
                                setAfbFormData({...afbFormData, angles: newAngles});
                              }}
                            />
                            <span className="checkbox-text">{angle}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Generate Button */}
                    <div className="form-section full-width">
                      <button 
                        className="afb-generate-btn"
                        onClick={handleAFBGenerate}
                        disabled={isLoading || (!afbFormData.selectedGame && !afbFormData.customMatchup)}
                      >
                        {isLoading ? '🔄 Generating Scripts...' : '🎯 Generate Parlay Scripts'}
                      </button>
                    </div>
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
