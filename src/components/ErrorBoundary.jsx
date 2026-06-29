import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught runtime error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-bg p-6">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-border">
            <div className="w-16 h-16 bg-debit/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-debit" />
            </div>
            <h1 className="font-display text-2xl font-bold text-brownDark mb-2">
              Something went wrong
            </h1>
            <p className="text-textMuted mb-8 text-sm">
              We encountered an unexpected error. Please try reloading the page. If the issue persists, contact support.
            </p>
            <button
              onClick={this.handleReload}
              className="w-full bg-gold text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-gold/90 transition-colors shadow-sm"
            >
              <RefreshCw className="w-5 h-5" />
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
