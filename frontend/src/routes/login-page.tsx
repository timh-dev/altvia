import { useState } from "react";
import { ArrowLeft, ArrowRight, Mountain, Route, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/store/app-store";

const loginImageUrl = "/brand/altvia-login-gemini.png";

export function LoginPage() {
  const login = useAppStore((state) => state.login);
  const openLanding = useAppStore((state) => state.openLanding);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    login();
  }

  return (
    <div className="min-h-screen bg-[#f3efe7] text-[#111111]">
      <div className="mx-auto grid min-h-screen max-w-[1600px] lg:grid-cols-2">
        <section className="flex min-h-screen flex-col justify-between px-6 py-6 sm:px-10 lg:px-14 lg:py-8">
          <header className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={openLanding}
              className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-[#5e5a53] transition hover:text-[#111111]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <div className="text-right">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#6b655b]">Altvia</p>
              <p className="mt-1 text-xs text-[#6f6a61]">Map your movement. Understand your terrain.</p>
            </div>
          </header>

          <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">
            <div className="mb-10">
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[#6b655b]">Login</p>
              <h1 className="mt-4 font-heading text-4xl tracking-tight text-[#111111]">Enter the map workspace</h1>
              <p className="mt-4 text-sm leading-7 text-[#4e4a45]">
                Sign in to review sessions, import Apple Health data, and move from terrain imagery into the map-first product surface.
              </p>
            </div>

            <div className="border border-[#ded7cb] bg-white/90 p-8 shadow-[0_24px_70px_rgba(16,16,16,0.08)] backdrop-blur">
              <form className="grid gap-5" onSubmit={handleSubmit}>
                <div className="grid gap-2">
                  <label htmlFor="email" className="text-sm font-medium text-[#1d1a17]">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="analyst@altvia.io"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className="text-sm font-medium text-[#1d1a17]">
                      Password
                    </label>
                    <span className="text-xs uppercase tracking-[0.18em] text-[#7e786e]">Local demo</span>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </div>

                <Button className="mt-2 h-11 rounded-none bg-[#1B5E20] text-xs uppercase tracking-[0.24em] text-white" type="submit">
                  Sign In
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </form>

              <div className="my-6 flex items-center gap-4">
                <div className="h-px flex-1 bg-[#e3ddd2]" />
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#8a8378]">Or continue with</span>
                <div className="h-px flex-1 bg-[#e3ddd2]" />
              </div>

              <Button
                variant="outline"
                className="h-11 w-full rounded-none border-[#d8d2c7] bg-transparent text-xs uppercase tracking-[0.22em] text-[#111111] hover:bg-[#f4f0e8] hover:text-[#111111]"
                type="button"
                onClick={login}
              >
                Continue To Demo
              </Button>

              <p className="mt-6 text-xs leading-6 text-[#6f6a61]">
                By continuing, you enter the current Altvia prototype environment for terrain-aware session review and path analysis.
              </p>
            </div>

            <div className="mt-8 grid gap-3 text-sm text-[#3f3b36]">
              <FeatureRow icon={ShieldCheck} text="Calm, data-first language instead of fitness clichés." />
              <FeatureRow icon={Route} text="Electric-blue paths reserved for active route overlays and key motion signals." />
              <FeatureRow icon={Mountain} text="Terrain imagery and topographic references anchor the visual system." />
            </div>
          </main>
        </section>

        <aside className="relative hidden min-h-screen overflow-hidden border-l border-[#d7d0c3] bg-[#ece8df] lg:block">
          <img
            src={loginImageUrl}
            alt="Altvia mountain terrain illustration with halftone texture and topographic lines"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(245,241,234,0.18),rgba(245,241,234,0.08)_28%,rgba(17,17,17,0.2)_100%)]" />
          <div className="absolute inset-x-0 top-0 flex items-center justify-between px-10 py-8">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#f8f4ed]">Authentication</p>
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#f8f4ed]/88">Map-first product surface</p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-10">
            <div className="max-w-xl bg-[rgba(12,16,18,0.68)] p-8 text-white backdrop-blur-md">
              <p className="font-heading text-3xl uppercase leading-tight tracking-[0.04em]">
                Terrain is not background. It is the interface.
              </p>
              <p className="mt-5 text-sm leading-7 text-white/78">
                The Altvia login experience should feel like an entry point into a premium geospatial system:
                restrained, map-aware, and grounded in landscape-derived data.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function FeatureRow({
  icon: Icon,
  text,
}: {
  icon: typeof ShieldCheck;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 text-[#1B5E20]" />
      <p className="leading-6">{text}</p>
    </div>
  );
}
