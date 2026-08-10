import React from "react";
import { createRoot } from "react-dom/client";
import Home from "../../app/page";
import AdminDashboard from "../../components/AdminDashboard";
import "../../app/globals.css";

const admin = window.location.pathname.startsWith("/admin");
createRoot(document.getElementById("root")!).render(<React.StrictMode>{admin ? <AdminDashboard /> : <Home />}</React.StrictMode>);
