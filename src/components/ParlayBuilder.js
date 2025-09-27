import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const ParlayBuilder = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [parlayBets, setParlayBets] = useState([]);
  const [totalOdds, setTotalOdds] = useState(1.0);
  const [betAmount, setBetAmount] = useState(10);
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io(process.env.NODE_ENV === 'production' ? window.location.origin : 'http://localhost:5001');
    
    socketRef.current.on('connect', () => {
      setIsConnected(true);
      socketRef.current.emit('join_room', 'parlay-builder');
    });
    
    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
    });
    
    socketRef.current.on('receive_message', (message) => {
      setMessages(prev => [...prev, message]);
    });

    // Add welcome message
    setMessages([{
      text: "Welcome to ParlayGPT! 🎯 I'm your AI assistant for building profitable parlays. Ask me about games, player props, or betting strategies!",
      sender: 'ai',
      timestamp: new Date().toISOString()
    }]);

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

  const addBetToParlay = (bet) => {
    setParlayBets(prev => {
      const newBets = [...prev, bet];
      const newTotalOdds = newBets.reduce((acc, b) => acc * (1 + b.odds/100), 1);
      setTotalOdds(newTotalOdds);
      return newBets;
    });
  };

  const removeBetFromParlay = (index) => {
    setParlayBets(prev => {
      const newBets = prev.filter((_, i) => i !== index);
      const newTotalOdds = newBets.reduce((acc, b) => acc * (1 + b.odds/100), 1);
      setTotalOdds(newTotalOdds);
      return newBets;
    });
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = {
      text: inputMessage,
      sender: 'user',
      timestamp: new Date().toISOString(),
      room: 'parlay-builder'
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: inputMessage,
          context: messages.slice(-5),
          parlayBets: parlayBets
        }),
      });

      const aiResponse = await response.json();
      
      const aiMessage = {
        text: aiResponse.message,
        sender: 'ai',
        timestamp: aiResponse.timestamp,
        room: 'parlay-builder',
        suggestedBets: aiResponse.suggestedBets || []
      };
      
      setMessages(prev => [...prev, aiMessage]);
      
      if (socketRef.current) {
        socketRef.current.emit('send_message', aiMessage);
      }
      
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = {
        text: 'Sorry, I encountered an error. Please try again.',
        sender: 'ai',
        timestamp: new Date().toISOString(),
        room: 'parlay-builder'
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const calculatePotentialPayout = () => {
    return (betAmount * totalOdds).toFixed(2);
  };

  return (
    <div className="min-h-screen bg-background-primary">
      {/* Header */}
      <header className="bg-background-secondary border-b border-border-silver shadow-inner-glow">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-8">
              <h1 className="text-2xl font-bold text-text-accent uppercase tracking-wide">
                🎯 PARLAYGPT BUILDER
              </h1>
              <div className="flex items-center space-x-2">
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 shadow-silver-glow' : 'bg-red-400'}`}></span>
                <span className="text-text-secondary text-sm font-medium uppercase">
                  {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
                </span>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="bg-background-tertiary border border-border-silver rounded-2xl px-4 py-2">
                <span className="text-text-secondary text-sm font-medium">
                  {parlayBets.length} BETS
                </span>
              </div>
              <div className="bg-metallic-gradient border border-accent-silver rounded-2xl px-4 py-2 shadow-silver-soft">
                <span className="text-text-accent font-bold">
                  +{((totalOdds - 1) * 100).toFixed(0)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-8rem)]">
          
          {/* Chat Section */}
          <div className="lg:col-span-2 bg-background-secondary border border-border-silver rounded-3xl shadow-metallic overflow-hidden">
            <div className="flex flex-col h-full">
              
              {/* Messages Container */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.map((message, index) => (
                  <div key={index} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs lg:max-w-md xl:max-w-lg ${
                      message.sender === 'user' 
                        ? 'bg-chrome-gradient border border-accent-silver' 
                        : 'bg-background-tertiary border border-border-subtle'
                    } rounded-2xl p-4 shadow-silver-soft`}>
                      
                      <div className="space-y-2">
                        <p className={`text-sm leading-relaxed ${
                          message.sender === 'user' ? 'text-background-primary font-medium' : 'text-text-primary'
                        }`}>
                          {message.text}
                        </p>
                        
                        <p className={`text-xs ${
                          message.sender === 'user' ? 'text-primary-700' : 'text-text-muted'
                        }`}>
                          {new Date(message.timestamp).toLocaleTimeString()}
                        </p>
                        
                        {/* Suggested Bets */}
                        {message.suggestedBets && message.suggestedBets.length > 0 && (
                          <div className="mt-4 p-3 bg-background-primary/30 rounded-xl border border-accent-steel">
                            <h4 className="text-accent-silver text-xs font-bold uppercase tracking-wide mb-2">
                              💡 SUGGESTED BETS
                            </h4>
                            <div className="space-y-2">
                              {message.suggestedBets.map((bet, betIndex) => (
                                <div key={betIndex} className="flex items-center justify-between bg-background-card rounded-xl p-2 border border-border-subtle">
                                  <span className="text-text-primary text-xs font-medium flex-1">{bet.description}</span>
                                  <span className="text-accent-silver font-bold text-xs mx-2">+{bet.odds}</span>
                                  <button 
                                    onClick={() => addBetToParlay(bet)}
                                    className="bg-silver-gradient border border-accent-silver rounded-lg px-3 py-1 
                                             text-background-primary text-xs font-bold uppercase tracking-wide
                                             hover:shadow-silver-glow transition-all duration-200 transform hover:scale-105"
                                  >
                                    ADD
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Loading Indicator */}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-background-tertiary border border-border-subtle rounded-2xl p-4 shadow-silver-soft">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-accent-silver rounded-full animate-pulse"></div>
                        <div className="w-2 h-2 bg-accent-silver rounded-full animate-pulse delay-75"></div>
                        <div className="w-2 h-2 bg-accent-silver rounded-full animate-pulse delay-150"></div>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>
              
              {/* Input Form */}
              <div className="border-t border-border-silver p-6">
                <form onSubmit={sendMessage}>
                  <div className="flex space-x-4">
                    <input
                      type="text"
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      placeholder="Ask about games, players, or betting strategies..."
                      className="flex-1 bg-background-tertiary border border-border-silver rounded-2xl px-4 py-3 
                               text-text-primary placeholder-text-muted
                               focus:outline-none focus:ring-2 focus:ring-accent-silver focus:border-accent-chrome
                               transition-all duration-200"
                      disabled={isLoading}
                    />
                    <button 
                      type="submit" 
                      disabled={!inputMessage.trim() || isLoading}
                      className="bg-silver-gradient border border-accent-silver rounded-2xl px-6 py-3 
                               text-background-primary font-bold
                               shadow-silver-soft hover:shadow-silver-glow 
                               transition-all duration-200 transform hover:scale-105
                               disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
                               focus:outline-none focus:ring-2 focus:ring-accent-silver"
                    >
                      {isLoading ? '⏳' : '📤'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
          
          {/* Parlay Ticket Section */}
          <div className="bg-background-secondary border border-border-silver rounded-3xl shadow-metallic overflow-hidden">
            <div className="bg-dark-metallic border-b border-border-silver p-6">
              <h3 className="text-xl font-bold text-text-accent text-center uppercase tracking-wide">
                🎫 YOUR PARLAY
              </h3>
            </div>
            
            <div className="p-6 flex flex-col h-[calc(100%-5rem)]">
              {parlayBets.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-center">
                  <div>
                    <p className="text-text-muted mb-2">No bets added yet</p>
                    <p className="text-text-secondary text-sm">💬 Chat with AI to get suggestions!</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Parlay Bets */}
                  <div className="flex-1 overflow-y-auto space-y-3 mb-6">
                    {parlayBets.map((bet, index) => (
                      <div key={index} className="bg-background-tertiary border border-border-subtle rounded-2xl p-4 shadow-inner-glow">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="text-text-primary text-sm font-medium leading-tight mb-1">
                              {bet.description}
                            </p>
                            <p className="text-accent-silver font-bold text-sm">
                              +{bet.odds}
                            </p>
                          </div>
                          <button 
                            onClick={() => removeBetFromParlay(index)}
                            className="ml-3 text-text-muted hover:text-red-400 transition-colors duration-200"
                          >
                            ❌
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Bet Calculation */}
                  <div className="border-t border-border-silver pt-6">
                    <div className="mb-4">
                      <label className="block text-text-secondary text-sm font-bold uppercase tracking-wide mb-2">
                        BET AMOUNT
                      </label>
                      <input
                        type="number"
                        value={betAmount}
                        onChange={(e) => setBetAmount(Number(e.target.value))}
                        min="1"
                        max="1000"
                        className="w-full bg-background-tertiary border border-border-silver rounded-2xl px-4 py-3 
                                 text-text-accent font-bold text-lg text-center
                                 focus:outline-none focus:ring-2 focus:ring-accent-silver
                                 transition-all duration-200"
                      />
                    </div>
                    
                    <div className="bg-background-card border border-border-silver rounded-2xl p-4 mb-4 shadow-inner-glow">
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-text-secondary font-medium">Total Odds:</span>
                          <span className="text-accent-silver font-bold">+{((totalOdds - 1) * 100).toFixed(0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-secondary font-medium">Potential Payout:</span>
                          <span className="text-text-accent font-bold">${calculatePotentialPayout()}</span>
                        </div>
                        <div className="flex justify-between border-t border-border-subtle pt-2">
                          <span className="text-text-secondary font-medium">Potential Profit:</span>
                          <span className="text-green-400 font-bold text-lg">
                            +${(calculatePotentialPayout() - betAmount).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <button className="w-full bg-silver-gradient border border-accent-silver rounded-2xl py-4 
                                     text-background-primary font-bold text-lg uppercase tracking-wide
                                     shadow-silver-soft hover:shadow-silver-glow 
                                     transition-all duration-300 transform hover:scale-105
                                     focus:outline-none focus:ring-2 focus:ring-accent-silver">
                      🎯 PLACE PARLAY BET
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <footer className="bg-background-secondary border-t border-border-silver mt-12">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <p className="text-text-muted text-xs">
              © 2024 ParlayGPT. Please gamble responsibly.
            </p>
            <div className="flex space-x-4 text-xs text-text-muted">
              <span>1-800-GAMBLER</span>
              <span>•</span>
              <span>21+ ONLY</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default ParlayBuilder;