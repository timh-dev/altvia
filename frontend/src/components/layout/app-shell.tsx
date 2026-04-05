import type { ReactNode } from "react";
export function AppShell({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(79,195,247,0.18),_transparent_35%),linear-gradient(135deg,_rgba(27,94,32,0.26),_transparent_45%),linear-gradient(180deg,_#0f172a,_#0a0a0a)]" />
      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8">
        <header className="mb-8 flex items-center justify-between rounded-[2rem] border border-white/10 bg-white/5 px-6 py-4 backdrop-blur-xl">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-sky-300">Altvia</p>
            <h1 className="font-heading text-2xl tracking-tight">Understand your movement across terrain.</h1>
          </div>
          {actions ? <div className="flex gap-2">{actions}</div> : null}
        </header>
        {children}
      </div>
    </div>
  );
}
