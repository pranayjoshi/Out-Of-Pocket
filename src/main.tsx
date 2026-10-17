import { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { MotionConfig } from "motion/react";
import App from "./App";
import { MarketApp } from "./live/MarketApp";
import "./styles.css";

function Root() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const sync = () => setPath(window.location.pathname);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  return path.startsWith("/admin/ads") ? <App /> : <MarketApp />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <MotionConfig reducedMotion="user">
    <Root />
  </MotionConfig>,
);
