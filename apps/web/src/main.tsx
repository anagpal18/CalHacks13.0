import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/layout/AppShell";
import { DemoModeProvider } from "@/components/layout/DemoModeContext";
import { OverviewPage } from "@/pages/OverviewPage";
import { ProcessedPage } from "@/pages/ProcessedPage";
import { InboxPage } from "@/pages/InboxPage";
import { CheckPage } from "@/pages/CheckPage";
import { VerifyPage } from "@/pages/VerifyPage";
import { ApproveAndPayPage } from "@/pages/ApproveAndPayPage";
import { ProofPage } from "@/pages/ProofPage";
import "./index.css";

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },
      { path: "overview", element: <OverviewPage /> },
      { path: "processed", element: <ProcessedPage /> },
      { path: "inbox", element: <InboxPage /> },
      { path: "check/:billId?", element: <CheckPage /> },
      { path: "verify/:personaId?", element: <VerifyPage /> },
      { path: "pay", element: <ApproveAndPayPage /> },
      { path: "proof", element: <ProofPage /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DemoModeProvider>
      <TooltipProvider delayDuration={150}>
        <RouterProvider router={router} />
      </TooltipProvider>
    </DemoModeProvider>
  </StrictMode>,
);
