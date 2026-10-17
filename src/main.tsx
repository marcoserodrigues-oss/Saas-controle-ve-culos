import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthGate } from "./auth/AuthGate";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthGate>
      {({ organizationName }) => <App organizationName={organizationName} />}
    </AuthGate>
  </React.StrictMode>
);
