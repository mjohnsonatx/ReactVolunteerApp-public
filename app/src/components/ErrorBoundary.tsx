import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logError } from '../utils/logError';

type ErrorBoundaryProps = { children?: ReactNode };
type ErrorBoundaryState = { hasError: boolean };

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError(error, 'react-boundary', { componentStack: info?.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="public-site-theme min-h-screen flex items-center justify-center text-center p-8 bg-gradient-to-br from-gray-100 via-amber-50 to-teal-50">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Something went wrong.</h1>
            <p className="text-gray-500 mb-6">The team has been notified. Please reload the page.</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-teal-500 hover:bg-teal-600 text-white px-5 py-2.5 rounded-xl font-medium"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
