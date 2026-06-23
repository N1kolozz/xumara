import { Toaster } from "@/components/ui/toaster";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import Index from "./pages/Index";

// The home screen (Index) loads eagerly so first paint is instant. The heavier
// game route — GameBoard plus the QR-code library pulled in by the lobby — is
// code-split and only fetched once a player actually enters a room.
const Game = lazy(() => import("./pages/Game"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Matches the in-app loading spinner so the lazy-route fetch is seamless.
const RouteFallback = () => (
  <div className="app-shell">
    <div className="screen items-center justify-center">
      <div className="soft-panel w-full p-6 text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <p className="text-sm font-bold text-text-soft">იტვირთება...</p>
      </div>
    </div>
  </div>
);

const App = () => (
  <>
    <Toaster />
    <BrowserRouter>
      <ErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/game/:roomId" element={<Game />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  </>
);

export default App;
