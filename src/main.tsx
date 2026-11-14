import { createRoot } from "react-dom/client";
import App from "./App";
import OfflineGate from "./OfflineGate";
import "./styles.css";
import "./layout.css";
import "./fluid.css";

createRoot(document.getElementById("root")!).render(<OfflineGate><App /></OfflineGate>);
