import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
    
    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error Boundary caught an error:', error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background-primary flex items-center justify-center p-4">
          <div className="bg-background-secondary border border-red-500/50 rounded-3xl p-8 max-w-md w-full text-center">
            <div className="text-6xl mb-4">🚨</div>
            <h1 className="text-2xl font-bold text-text-accent mb-4 uppercase tracking-wide">
              Something Went Wrong
            </h1>
            <p className="text-text-secondary mb-6">
              We encountered an unexpected error. Please refresh the page or try again later.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-silver-gradient border border-accent-silver rounded-2xl py-3 px-6 
                         text-background-primary font-bold uppercase tracking-wide
                         shadow-silver-soft hover:shadow-silver-glow 
                         transition-all duration-300 transform hover:scale-105"
              >
                🔄 Refresh Page
              </button>
              <button
                onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                className="w-full bg-background-tertiary border border-border-silver rounded-2xl py-3 px-6 
                         text-text-secondary font-medium uppercase tracking-wide
                         hover:bg-background-card hover:text-text-primary
                         transition-all duration-300"
              >
                Try Again
              </button>
            </div>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-6 text-left">
                <summary className="text-red-400 cursor-pointer text-sm font-medium mb-2">
                  Error Details (Development Only)
                </summary>
                <div className="bg-background-card border border-border-subtle rounded-xl p-4 text-xs">
                  <div className="text-red-300 font-medium mb-2">Error:</div>
                  <div className="text-text-muted mb-4 font-mono">
                    {this.state.error && this.state.error.toString()}
                  </div>
                  <div className="text-red-300 font-medium mb-2">Stack Trace:</div>
                  <div className="text-text-muted font-mono whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </div>
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;