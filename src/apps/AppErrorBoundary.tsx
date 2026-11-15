import { Component, type ReactNode } from 'react'
import { useAppContribStore } from './appContribStore'
import { appScopeClass } from './createVideApi'

interface Props { appId: string; title: string; children: ReactNode }
interface State { error: Error | null }

// Wraps anything an app renders so a crash shows a message instead of taking
// vIDE's UI down, and marks the app as failed in the Store.
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error): void {
    useAppContribStore.getState().setRuntimeError(this.props.appId, error.message)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-4 text-sm text-fg">
          <div className="font-medium">{this.props.title} stopped working.</div>
          <div className="mt-1 text-fg-muted">{this.state.error.message}</div>
        </div>
      )
    }
    // display:contents keeps the wrapper out of layout; it only scopes CSS.
    return <div className={appScopeClass(this.props.appId)} style={{ display: 'contents' }}>{this.props.children}</div>
  }
}
