'use client';
import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    // Send to server log endpoint
    try {
      fetch('/api/logs/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'react-boundary',
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          url: typeof window !== 'undefined' ? window.location.href : '',
          ts: new Date().toISOString(),
        }),
        keepalive: true,
      }).catch(() => {});   // silent – don't crash while handling crash
    } catch { /* noop */ }

    // Also log to browser console for devtools
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen bg-white flex items-center justify-center p-8">
          <div className="max-w-lg w-full text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Ceva a mers prost</h1>
            <p className="text-gray-500 mb-6 text-sm">
              {this.state.error?.message ?? 'Eroare necunoscută'}
            </p>
            {process.env.NODE_ENV !== 'production' && (
              <details className="text-left bg-gray-50 border rounded p-4 mb-6 text-xs text-gray-600 overflow-auto max-h-48">
                <summary className="cursor-pointer font-medium mb-2">Stack trace</summary>
                <pre className="whitespace-pre-wrap">{this.state.error?.stack}</pre>
                <pre className="whitespace-pre-wrap mt-2 text-purple-600">
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null, errorInfo: null });
                window.location.reload();
              }}
              className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition"
            >
              Reîncearcă
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
