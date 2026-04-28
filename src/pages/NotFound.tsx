import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Home } from "lucide-react";

import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <main className="screen items-center justify-center">
        <section className="surface-panel w-full p-6 text-center">
          <p className="label-text">404</p>
          <h1 className="mt-2 text-3xl font-black text-foreground">გვერდი ვერ მოიძებნა</h1>
          <p className="body-text mt-2">დაბრუნდი მთავარ ეკრანზე და გააგრძელე თამაში.</p>
          <Button asChild size="lg" className="mt-6 w-full">
            <Link to="/">
              <Home className="h-5 w-5" />
              მთავარი
            </Link>
          </Button>
        </section>
      </main>
    </div>
  );
};

export default NotFound;
