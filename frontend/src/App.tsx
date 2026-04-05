import { useEffect } from "react";

import { LandingPage } from "@/routes/landing-page";
import { LoginPage } from "@/routes/login-page";
import { MapPage } from "@/routes/map-page";
import { PlannerPage } from "@/routes/planner-page";
import { useAppStore } from "@/store/app-store";

export function App() {
  const currentPage = useAppStore((state) => state.currentPage);
  const setPageFromLocation = useAppStore((state) => state.setPageFromLocation);

  useEffect(() => {
    const handlePopState = () => {
      setPageFromLocation(window.location.pathname);
    };

    window.addEventListener("popstate", handlePopState);
    setPageFromLocation(window.location.pathname);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [setPageFromLocation]);

  if (currentPage === "map") {
    return <MapPage />;
  }

  if (currentPage === "login") {
    return <LoginPage />;
  }

  if (currentPage === "planner") {
    return <PlannerPage />;
  }

  return <LandingPage />;
}
