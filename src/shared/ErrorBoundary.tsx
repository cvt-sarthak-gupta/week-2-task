import { Component, type ReactNode } from 'react';
import { Alert } from 'antd';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  override componentDidCatch(error: Error): void {
    this.setState({ error });
  }

  override render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <Alert
            type="error"
            message="Something went wrong"
            description={this.state.error.message}
            style={{ margin: 24 }}
          />
        )
      );
    }
    return this.props.children;
  }
}
