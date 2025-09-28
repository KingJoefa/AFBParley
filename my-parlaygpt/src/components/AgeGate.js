import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { APP_CONFIG, STORAGE_KEYS, ERROR_MESSAGES } from '../utils/constants';

const AgeGate = () => {
  const [isOver21, setIsOver21] = useState(null);
  const navigate = useNavigate();

  const handleAgeVerification = (over21) => {
    setIsOver21(over21);
    if (over21) {
      localStorage.setItem(STORAGE_KEYS.AGE_VERIFIED, 'true');
      navigate('/builder');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleAgeVerification(true);
    }
  };

  return (
    <div className="min-h-screen bg-background-primary flex items-center justify-center p-4">
      <div className="bg-background-secondary border border-border-silver rounded-3xl p-8 max-w-md w-full shadow-metallic">
        
        {/* Logo Section */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-text-accent mb-2 tracking-wide uppercase">
            🎯 {APP_CONFIG.name.toUpperCase()}
          </h1>
          <p className="text-text-secondary text-lg font-medium">
            {APP_CONFIG.description.toUpperCase()}
          </p>
        </div>
        
        {/* Age Verification */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-text-accent mb-4 text-center uppercase tracking-wide">
            AGE VERIFICATION REQUIRED
          </h2>
          <p className="text-text-primary text-center mb-6">
            You must be {APP_CONFIG.legalAge} or older to use this service.
          </p>
          
          {isOver21 === false && (
            <div className="bg-red-900/20 border border-red-500/50 rounded-2xl p-4 mb-6 text-center">
              <p className="text-red-300">❌ {ERROR_MESSAGES.AGE_VERIFICATION_REQUIRED}</p>
            </div>
          )}
          
          {/* Age Buttons */}
          <div className="space-y-4 mb-6">
            <button 
              className="w-full bg-metallic-gradient border border-accent-silver rounded-2xl py-4 px-6 
                         text-text-accent font-bold uppercase tracking-wider
                         shadow-silver-soft hover:shadow-silver-glow 
                         transition-all duration-300 transform hover:scale-105 hover:bg-chrome-gradient
                         focus:outline-none focus:ring-2 focus:ring-accent-silver"
              onClick={() => handleAgeVerification(true)}
              onKeyPress={handleKeyPress}
              autoFocus
            >
              ✅ I AM 21 OR OLDER
            </button>
            
            <button 
              className="w-full bg-background-tertiary border border-red-500/50 rounded-2xl py-4 px-6 
                         text-red-300 font-bold uppercase tracking-wider
                         hover:bg-red-900/20 hover:border-red-400
                         transition-all duration-300
                         focus:outline-none focus:ring-2 focus:ring-red-500"
              onClick={() => handleAgeVerification(false)}
            >
              ❌ I AM UNDER 21
            </button>
          </div>
          
          {/* Enter Hint */}
          <div className="text-center mb-6">
            <p className="text-text-muted text-sm">
              💡 Press <kbd className="bg-background-tertiary border border-border-subtle rounded px-2 py-1 text-accent-silver font-mono text-xs">Enter</kbd> to continue
            </p>
          </div>
        </div>
        
        {/* Legal Notice */}
        <div className="text-center text-xs text-text-muted leading-relaxed border-t border-border-subtle pt-6">
          <p className="font-semibold text-text-secondary mb-2">LEGAL NOTICE</p>
          <p className="mb-1">This service is for entertainment purposes only. Please gamble responsibly.</p>
          <p>If you have a gambling problem, call 1-800-GAMBLER.</p>
        </div>
      </div>
    </div>
  );
};

export default AgeGate;