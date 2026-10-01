import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import Home from "../../app/page";
import "../../app/globals.css";

const AdminDashboard = lazy(() => import("../../components/AdminDashboard"));
const admin = window.location.pathname.startsWith("/admin");
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {admin ? (
      <Suspense fallback={<main aria-busy="true" aria-label="后台正在加载" />}>
        <AdminDashboard />
      </Suspense>
    ) : <Home />}
  </React.StrictMode>,
);
