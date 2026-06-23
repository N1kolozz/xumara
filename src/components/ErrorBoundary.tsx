import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// App-wide error boundary. Without it, any render-time throw unmounts the whole
// React tree and leaves users staring at a blank white screen with no way out.
// This catches the error, logs it, and shows a recoverable fallback (reload, or
// escape home) styled like the rest of the app. Error boundaries have to be
// class components — there's no hook equivalent.
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleHome = () => {
    // Hard navigation rather than a router push: it resets all in-memory state,
    // so we land on a clean home screen instead of re-rendering the route that
    // just threw.
    window.location.assign("/");
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="app-shell">
        <main className="screen items-center justify-center">
          <section className="surface-panel w-full p-6 text-center">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-danger/30 bg-danger/15 text-danger">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <p className="label-text">შეცდომა</p>
            <h1 className="mt-2 text-2xl font-black text-foreground">რაღაც აირია</h1>
            <p className="body-text mt-2">
              აპლიკაციაში მოულოდნელი შეცდომა მოხდა. გადატვირთე გვერდი და სცადე თავიდან.
            </p>
            <Button onClick={this.handleReload} size="lg" className="mt-6 w-full">
              <RotateCcw className="h-5 w-5" />
              გადატვირთვა
            </Button>
            <Button onClick={this.handleHome} variant="surface" className="mt-3 w-full">
              <Home className="h-5 w-5" />
              მთავარი
            </Button>
          </section>
        </main>
      </div>
    );
  }
}

export default ErrorBoundary;
