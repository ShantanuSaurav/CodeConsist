import React from 'react';
import { ENV } from '@/config/env';

interface CrashMessages {
  title: string;
  body: string;
}

interface Props {
  children: React.ReactNode;
  /**
   * The words on the crash screen. A function, read only when something has
   * crashed, so the app can pass editable copy in without the ui layer
   * importing it. Falls back to the built-in text if it is missing or throws.
   */
  messages?: () => CrashMessages;
}

interface State {
  error: Error | null;
  /** Shown to the learner and logged with the error, so a report can be matched to the console. */
  reference: string | null;
  componentStack: string | null;
}

const DEFAULT_MESSAGES: CrashMessages = {
  title: 'Something went wrong.',
  body:
    'This page hit a problem it could not recover from. Your progress is saved as you go - on this device, and to your ' +
    'account when you are signed in - so reloading should not lose it.'
};

/** No 0/O or 1/I, so a code read out loud or copied by hand survives. */
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function referenceCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)];
  return `E-${code}`;
}

function crashMessages(messages: Props['messages']): CrashMessages {
  try {
    const custom = messages?.();
    return {
      title: custom?.title || DEFAULT_MESSAGES.title,
      body: custom?.body || DEFAULT_MESSAGES.body
    };
  } catch {
    return DEFAULT_MESSAGES;
  }
}

/**
 * Without this, one bad render anywhere unmounts the entire page and leaves a
 * blank white screen with the reason only in the console.
 *
 * Visitors get plain words and a reference code; the error itself and the
 * component stack are shown only in development. The boundary sits outside
 * the router, so "home" is a plain link rather than a router `<Link>`.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, reference: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, reference: referenceCode(), componentStack: null };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[CodeConsist] render failed (${this.state.reference ?? 'no reference'}):`, error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  render() {
    const { error, reference, componentStack } = this.state;
    if (!error) return this.props.children;

    const { title, body } = crashMessages(this.props.messages);

    return (
      <div className="crash-screen" role="alert">
        <h1>{title}</h1>
        <p>{body}</p>
        {reference && (
          <p className="text-sm mt-3">
            Reference: <code className="font-mono">{reference}</code>
          </p>
        )}
        {ENV.isDev && (
          <pre>
            {error.message}
            {componentStack ? `\n${componentStack}` : ''}
          </pre>
        )}
        <div className="crash-actions mt-6">
          <button type="button" className="btn btn-solid" onClick={() => window.location.reload()}>
            Reload the page
          </button>
          <button
            type="button"
            className="btn btn-line"
            onClick={() => this.setState({ error: null, reference: null, componentStack: null })}
          >
            Try to continue
          </button>
          <a className="btn btn-line" href="/">
            Go to the home page
          </a>
        </div>
      </div>
    );
  }
}
