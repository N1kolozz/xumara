import { createRoot } from "react-dom/client";
import "@fontsource-variable/noto-sans-georgian";
import App from "./App.tsx";
import "./index.css";
import { installViewportZoomLock } from "./lib/viewport-zoom-lock";

installViewportZoomLock();

createRoot(document.getElementById("root")!).render(<App />);
