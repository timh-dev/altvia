import { create } from "zustand";
import { DEFAULT_UNIT_SYSTEM, type UnitSystem } from "@/lib/units";

export type AppPage = "landing" | "login" | "map" | "planner";

const pageToPath: Record<AppPage, string> = {
  landing: "/",
  login: "/login",
  map: "/map",
  planner: "/planner",
};

function pathToPage(pathname: string): AppPage {
  if (pathname === "/login") {
    return "login";
  }
  if (pathname === "/map") {
    return "map";
  }
  if (pathname === "/planner") {
    return "planner";
  }
  return "landing";
}

type AppStore = {
  currentPage: AppPage;
  setPageFromLocation: (pathname: string) => void;
  navigateTo: (page: AppPage) => void;
  openLogin: () => void;
  openLanding: () => void;
  openPlanner: () => void;
  login: () => void;
  logout: () => void;
  unitSystem: UnitSystem;
  setUnitSystem: (next: UnitSystem) => void;
};

export const useAppStore = create<AppStore>((set) => ({
  currentPage: pathToPage(window.location.pathname),
  setPageFromLocation: (pathname) => set({ currentPage: pathToPage(pathname) }),
  navigateTo: (page) => {
    const nextPath = pageToPath[page];
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    set({ currentPage: page });
  },
  openLogin: () => {
    const nextPath = pageToPath.login;
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    set({ currentPage: "login" });
  },
  openLanding: () => {
    const nextPath = pageToPath.landing;
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    set({ currentPage: "landing" });
  },
  openPlanner: () => {
    const nextPath = pageToPath.planner;
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    set({ currentPage: "planner" });
  },
  login: () => {
    const nextPath = pageToPath.map;
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    set({ currentPage: "map" });
  },
  logout: () => {
    const nextPath = pageToPath.landing;
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    set({ currentPage: "landing" });
  },
  unitSystem: (() => {
    if (typeof window === "undefined") {
      return DEFAULT_UNIT_SYSTEM;
    }
    const stored = window.localStorage.getItem("unitSystem");
    return stored === "metric" ? "metric" : DEFAULT_UNIT_SYSTEM;
  })(),
  setUnitSystem: (next) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("unitSystem", next);
    }
    set({ unitSystem: next });
  },
}));
