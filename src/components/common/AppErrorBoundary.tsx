import { Component, type ErrorInfo, type ReactNode } from "react";

export default class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Application render failed:", error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return <main role="alert" className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12 text-gray-900 dark:bg-gray-950 dark:text-white">
        <section className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
          <h1 className="text-xl font-semibold">The page couldn’t load</h1>
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">Reload the page to try again. Your saved league data is still available.</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white">Reload page</button>
        </section>
      </main>;
    }
    return this.props.children;
  }
}
