import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app';
import './styles.css';
class AppBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <main className="startup-error">
        <h1>衣橱暂时没能打开</h1>
        <p>请重新打开应用。如果仍无法打开，请保留应用数据并联系维护者。</p>
        <p>{this.state.error}</p>
        <button onClick={() => location.reload()}>重新打开</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
if (new URLSearchParams(location.search).get('selftest') === '1') {
  void import('./selftest').then(({runSelfTest}) => runSelfTest(document.getElementById('root')!));
} else createRoot(document.getElementById('root')!).render(
  <AppBoundary>
    <App />
  </AppBoundary>,
);
