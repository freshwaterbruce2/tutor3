import React, { Component, ReactNode } from 'react';
import { logger } from '../../utils/logger';

interface Props {
  children: ReactNode;
  routeName?: string;
  fallback?: ReactNode;
  onGoHome?: () => void;
}

interface State {
  hasError: boolean;
}

const SAFE_ROUTES = new Set([
  'Onboarding', 'Dashboard', 'AI Tutor', 'AI Buddy', 'Achievements',
  'Schedules Hub', 'Parent Dashboard', 'Music Library', 'Sensory Settings',
  'Focus Timer', 'Realm Quests', 'Brain Gym', 'Token Wallet', 'Avatar Shop',
  'Wellness Hub', 'Dashboard (Default)',
]);

/**
 * Enhanced Error Boundary for route-level error handling
 *
 * Features:
 * - Route-specific error tracking
 * - Custom fallback UI
 * - Sanitized route diagnostics
 * - Reset capability
 */
class RouteErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  public componentDidCatch() {
    // Render errors can contain chat text or credentials. Keep diagnostics generic.
    const route = this.props.routeName && SAFE_ROUTES.has(this.props.routeName)
      ? this.props.routeName : 'Unknown';
    logger.error(`Route ${route} failed to render`);
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
    });
  };

  private handleGoHome = () => {
    // Reset also covers a failed Dashboard, where choosing Dashboard again is a no-op.
    this.handleReset();
    this.props.onGoHome?.();
  };

  public render(): React.ReactNode {
    const { hasError } = this.state;
    const { children, fallback, routeName } = this.props;
    const safeRouteName = routeName && SAFE_ROUTES.has(routeName) ? routeName : null;

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen w-full bg-background-main text-text-primary flex flex-col items-center justify-center p-8">
          <div className="max-w-2xl w-full glass-card p-8 text-center space-y-6">
            {/* Error Icon */}
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
            </div>

            {/* Error Message */}
            <div>
              <h1 className="text-3xl font-bold text-red-400 mb-2">Something went wrong</h1>
              {safeRouteName && (
                <p className="text-sm text-text-secondary mb-4">Error in: {safeRouteName}</p>
              )}
              <p className="text-text-secondary">We've encountered an unexpected error.</p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 justify-center">
              <button
                onClick={this.handleReset}
                className="px-6 py-3 font-semibold text-background-main bg-[var(--primary-accent)] rounded-lg hover:opacity-80 transition-opacity"
              >
                Try Again
              </button>
              <button
                onClick={this.handleGoHome}
                className="px-6 py-3 font-semibold border-2 border-[var(--primary-accent)] text-[var(--primary-accent)] rounded-lg hover:bg-[var(--primary-accent)] hover:text-background-main transition-all"
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

export default RouteErrorBoundary;
