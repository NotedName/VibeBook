import { createRoot } from "react-dom/client";
import App from "./App";
import OfflineGate from "./OfflineGate";
import "./styles.css";
import "./layout.css";
import "./fluid.css";
import "./topbar.css";
import "./neumorphic.css";
import { watchInsets } from "./insets";
import { watchParallax } from "./parallax";

watchInsets();
watchParallax();

createRoot(document.getElementById("root")!).render(<OfflineGate><App /></OfflineGate>);
