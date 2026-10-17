import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthGate } from "./auth/AuthGate";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthGate>
      {({ organizationId, organizationName }) => <App organizationId={organizationId} organizationName={organizationName} />}
    </AuthGate>
  </React.StrictMode>
);
