import { useEffect } from "react";

import { LandingPage } from "@/routes/landing-page";
import { LoginPage } from "@/routes/login-page";
import { MapPage } from "@/routes/map-page";
import { PlannerPage } from "@/routes/planner-page";
import { useAppStore } from "@/store/app-store";

export function App() {
  const currentPage = useAppStore((state) => state.currentPage);
  const setPageFromLocation = useAppStore((state) => state.setPageFromLocation);
  const isCompact = useAppStore((state) => state.uiScale) === "compact";

  const theme = useAppStore((state) => state.theme);

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

  useEffect(() => {
    const root = document.documentElement;

    function apply(prefersDark: boolean) {
      if (theme === "dark" || (theme === "system" && prefersDark)) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    apply(mediaQuery.matches);

    function handleChange(event: MediaQueryListEvent) {
      apply(event.matches);
    }

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  if (currentPage === "map") {
    return isCompact
      ? <div style={{ height: "100vh", overflow: "hidden" }}><MapPage /></div>
      : <MapPage />;
  }

  if (currentPage === "login") {
    return <LoginPage />;
  }

  if (currentPage === "planner") {
    return isCompact
      ? <div style={{ height: "100vh", overflow: "hidden" }}><PlannerPage /></div>
      : <PlannerPage />;
  }

  return <LandingPage />;
}
