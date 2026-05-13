import { SidebarNav } from "./sidebar-nav";
import { TopHeader } from "./top-header";

export function OrcaShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-1 bg-[rgb(var(--primary-1))] text-[rgb(var(--primary-12))] lg:grid-cols-[260px_1fr]">
      <SidebarNav />

      <div className="flex min-h-screen flex-col">
        <TopHeader />
        <main className="flex-1 bg-[linear-gradient(180deg,rgba(247,250,255,0.8)_0%,rgba(255,255,255,1)_100%)] px-6 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
