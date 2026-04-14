import { useEffect, useState } from "react";
import { ArrowRight, Dot, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fetchHealth } from "@/lib/api";
import { useAppStore } from "@/store/app-store";

const heroImageUrl = "/brand/altvia-hero-gemini.png";

export function LandingPage() {
  const openLogin = useAppStore((state) => state.openLogin);
  const [apiStatus, setApiStatus] = useState("checking");
  const [showFloatingLogin, setShowFloatingLogin] = useState(false);

  useEffect(() => {
    fetchHealth()
      .then((data) => setApiStatus(`${data.status} (${data.environment})`))
      .catch(() => setApiStatus("offline"));
  }, []);

  useEffect(() => {
    function handleScroll() {
      setShowFloatingLogin(window.scrollY > 180);
    }

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <div className="bg-[var(--surface-primary)] text-[var(--text-primary)]">
      <section className="relative min-h-[92vh] overflow-hidden bg-[#15171c] text-white">
        <img
          src={heroImageUrl}
          alt="Halftone terrain landscape with a winding path"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,14,18,0.62),rgba(12,14,18,0.34)_24%,rgba(12,14,18,0.58)_68%,rgba(12,14,18,0.82)_100%)]" />
        <div className="relative mx-auto flex min-h-[92vh] max-w-[1500px] flex-col px-4 py-5 sm:px-6 lg:px-8">
          <header className="flex items-start justify-between text-[10px] uppercase tracking-[0.28em] text-white/78 [text-shadow:0_2px_12px_rgba(0,0,0,0.3)]">
            <div>
              <p>Altvia</p>
            </div>
            <div className="hidden gap-6 md:flex">
              <span>Map Your Movement</span>
              <span>Understand Your Terrain</span>
            </div>
            <div className="text-right">
              <p>API {apiStatus}</p>
            </div>
          </header>

          <div className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1fr_auto_1fr] lg:py-10">
            <div className="max-w-xs self-center text-sm leading-6 text-white/78 [text-shadow:0_2px_12px_rgba(0,0,0,0.28)]">
              <p>
                A map-first intelligence platform for sessions, paths, and terrain-aware movement analysis.
              </p>
            </div>

            <div className="mx-auto max-w-xl text-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.34em] text-[#d6e9ef]">
                Landing Page
              </p>
              <h1 className="mt-6 font-heading text-4xl uppercase leading-[1.02] tracking-[0.06em] text-white [text-shadow:0_2px_18px_rgba(0,0,0,0.35)] sm:text-5xl lg:text-6xl">
                Understand your movement across terrain.
              </h1>
              <p className="mx-auto mt-6 max-w-lg text-sm leading-7 text-white/76 [text-shadow:0_2px_12px_rgba(0,0,0,0.28)] sm:text-base">
                Altvia reveals patterns in elevation, path choice, and route efficiency through a premium,
                landscape-driven interface built for calm, data-first analysis.
              </p>
            </div>

            <div className="ml-auto max-w-xs self-center text-right text-sm leading-6 text-white/78 [text-shadow:0_2px_12px_rgba(0,0,0,0.28)]">
              <p>
                Apple Health imports now feed a single logged-in map workspace where sessions become visible in
                context.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-start justify-between gap-6 border-t border-white/15 pt-5 text-white sm:flex-row sm:items-center">
            <div className="flex items-center gap-3 text-sm text-white/76">
              <ShieldCheck className="h-4 w-4 text-[#00BFFF]" />
              <span>Calm, analytical, terrain-aware product language</span>
            </div>
            <Button
              className="rounded-none bg-[var(--accent-green)] px-8 py-6 text-xs uppercase tracking-[0.26em] text-white hover:brightness-110"
              onClick={openLogin}
            >
              Login
              <ArrowRight className="ml-3 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      <div
        className={`pointer-events-none fixed bottom-5 right-5 z-40 transition-all duration-300 sm:bottom-6 sm:right-6 ${
          showFloatingLogin ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        }`}
      >
        <Button
          className="pointer-events-auto rounded-none bg-[var(--accent-green)] px-8 py-6 text-xs uppercase tracking-[0.26em] text-white shadow-[0_18px_36px_rgba(17,17,17,0.18)] hover:brightness-110"
          onClick={openLogin}
        >
          Login
          <ArrowRight className="ml-3 h-4 w-4" />
        </Button>
      </div>

      <section className="mx-auto max-w-[1500px] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="grid gap-16 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="max-w-md">
            <p className="font-heading text-[32px] uppercase leading-[0.97] tracking-[0.04em] text-[var(--text-primary)] sm:text-[42px]">
              Our product model bridges today&apos;s sessions with tomorrow&apos;s terrain intelligence.
            </p>
          </div>
          <div className="grid gap-10">
            <div className="grid gap-8 lg:grid-cols-2">
              <ArcCard
                label="Analyze"
                align="left"
                title="Sessions are normalized into metrics that can be compared across terrain."
                body="Distance, duration, elevation gain, and future route signals are meant to read as one connected system."
              />
              <ArcCard
                label="Plan"
                align="right"
                title="Paths become visible as strategic choices, not just recorded lines."
                body="Altvia treats route geometry, elevation, and terrain context as decision-making inputs."
              />
            </div>
            <div className="border-t border-[var(--border-secondary)] pt-8">
              <div className="grid gap-8 lg:grid-cols-[1fr_1fr_1fr]">
                <TextBlock
                  eyebrow="Analyze"
                  title="Data revealed through terrain"
                  body="Visual density should feel embedded in the landscape. Metrics should feel observed, not celebrated."
                />
                <TextBlock
                  eyebrow="Optimize"
                  title="Electric-blue paths highlight active movement"
                  body="Route overlays are reserved for active traces and important path guidance so they stay high-signal."
                />
                <TextBlock
                  eyebrow="Tone"
                  title="Analytical, calm, descriptive"
                  body="Avoid coaching language and fitness cliches. The interface should sound like an observant guide."
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-[var(--border-secondary)] bg-[var(--surface-secondary)]">
        <div className="mx-auto grid max-w-[1500px] gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:py-24">
          <div className="max-w-lg">
            <p className="font-heading text-[30px] uppercase leading-[0.98] tracking-[0.04em] text-[var(--text-primary)] sm:text-[38px]">
              We believe in collective terrain, connected paths, and a clearer way of reading movement.
            </p>
            <p className="mt-10 max-w-sm text-sm leading-7 text-[var(--text-tertiary)]">
              Altvia is built around a simple premise: movement becomes more useful when route, elevation, and
              session history are interpreted together instead of in isolation.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-[1.15fr_0.85fr]">
            <img
              src={heroImageUrl}
              alt="Altvia terrain hero"
              className="h-full min-h-[360px] w-full object-cover"
            />
            <div className="flex flex-col justify-between bg-[var(--surface-tertiary)] p-6">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-[var(--text-subtle)]">Brand Direction</p>
                <p className="mt-4 font-heading text-2xl uppercase leading-tight tracking-[0.04em] text-[var(--text-primary)]">
                  Premium, restrained, and topographic by design.
                </p>
              </div>
              <p className="text-sm leading-7 text-[var(--text-tertiary)]">
                Generated terrain imagery, subtle glass overlays, editorial spacing, and precise type treatments
                should drive the experience across the landing page and into the logged-in map.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1500px] px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr]">
          <div className="max-w-md">
            <p className="font-heading text-[30px] uppercase leading-[0.98] tracking-[0.04em] text-[var(--text-primary)] sm:text-[38px]">
              The product language stays close to the landscape.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <SnapshotCard year="Observe" title="Session" body="Use session instead of activity when describing movement units." />
            <SnapshotCard year="Map" title="Path" body="Use path instead of route for the branded product language." />
            <SnapshotCard year="Measure" title="Metrics" body="Use metrics instead of stats to keep the tone more precise." />
            <SnapshotCard year="Interpret" title="Analysis" body="Use analysis instead of insights for a calmer, data-first voice." />
          </div>
        </div>
      </section>

      <section className="bg-[var(--accent-green)] px-4 py-4 sm:px-4 lg:px-4 lg:py-4">
        <div className="mx-auto max-w-[1500px]">
          <div className="overflow-hidden rounded-[2rem] bg-[#f3efe7] text-[#7d8f9c] shadow-[0_24px_60px_rgba(34,46,56,0.12)]">
            <div className="grid gap-12 px-6 py-8 sm:px-8 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr] lg:px-12 lg:py-12">
              <div className="flex min-h-[180px] flex-col justify-between">
                <div>
                  <p className="font-heading text-2xl tracking-[-0.04em] text-[var(--accent-green)] sm:text-3xl">Altvia</p>
                  <p className="mt-4 max-w-xs text-sm leading-7 text-[var(--accent-green)]">
                    Terrain-aware session review and path planning built around movement, route context, and elevation.
                  </p>
                </div>
                <div className="text-sm text-[var(--accent-green)]">
                  <p>© 2026 Altvia</p>
                </div>
              </div>

              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--accent-green)]">Platform</p>
                <div className="mt-5 grid gap-3 text-sm text-[var(--accent-green)]">
                  <p>Overview</p>
                  <p>Sessions</p>
                  <p>Planner</p>
                  <p>Imports</p>
                </div>
              </div>

              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--accent-green)]">Product</p>
                <div className="mt-5 grid gap-3 text-sm text-[var(--accent-green)]">
                  <p>Apple Health</p>
                  <p>Path Review</p>
                  <p>Elevation Analysis</p>
                  <p>Analysis</p>
                </div>
              </div>

              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--accent-green)]">Access</p>
                <div className="mt-5 grid gap-4 text-sm text-[var(--accent-green)]">
                  <p>Prototype</p>
                  <p>Local Stack</p>
                  <Button
                    variant="ghost"
                    className="mt-2 h-auto justify-start rounded-none px-0 py-0 text-left text-xs uppercase tracking-[0.22em] text-[var(--accent-green)] hover:bg-transparent hover:text-[var(--accent-green)]"
                    onClick={openLogin}
                  >
                    Login
                    <ArrowRight className="ml-3 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="border-t border-dashed border-[var(--accent-green)]" />

            <div className="px-6 py-6 sm:px-8 lg:px-12 lg:py-8">
              <p className="font-heading text-[88px] leading-[0.82] tracking-[-0.08em] text-[var(--accent-green)] sm:text-[140px] lg:text-[220px] xl:text-[260px]">
                Altvia
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ArcCard({
  label,
  title,
  body,
  align,
}: {
  label: string;
  title: string;
  body: string;
  align: "left" | "right";
}) {
  return (
    <article className="relative pt-28">
      <div
        className={`absolute inset-x-0 top-0 h-32 border-t border-dashed border-[var(--border-secondary)] ${
          align === "left"
            ? "rounded-t-[999px] border-l border-r-0"
            : "rounded-t-[999px] border-r border-l-0"
        }`}
      />
      <div className={`flex items-center gap-2 ${align === "right" ? "justify-end" : ""}`}>
        <span className="bg-[var(--accent-green)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-white">
          {label}
        </span>
      </div>
      <p className="mt-6 font-heading text-lg uppercase leading-tight tracking-[0.04em] text-[var(--text-primary)]">{title}</p>
      <p className="mt-4 max-w-md text-sm leading-7 text-[var(--text-tertiary)]">{body}</p>
    </article>
  );
}

function TextBlock({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--text-subtle)]">{eyebrow}</p>
      <p className="mt-4 font-heading text-lg uppercase leading-tight tracking-[0.04em] text-[var(--text-primary)]">{title}</p>
      <p className="mt-3 text-sm leading-7 text-[var(--text-tertiary)]">{body}</p>
    </div>
  );
}

function SnapshotCard({ year, title, body }: { year: string; title: string; body: string }) {
  return (
    <article className="border border-[var(--border-secondary)] bg-[var(--surface-card)] p-5">
      <div className="flex items-center gap-2 text-[var(--text-subtle)]">
        <Dot className="h-4 w-4" />
        <p className="font-mono text-[11px] uppercase tracking-[0.24em]">{year}</p>
      </div>
      <p className="mt-6 font-heading text-2xl uppercase tracking-[0.04em] text-[var(--text-primary)]">{title}</p>
      <p className="mt-4 text-sm leading-7 text-[var(--text-tertiary)]">{body}</p>
    </article>
  );
}
