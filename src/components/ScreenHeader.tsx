import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

export function ScreenHeader({ title, right, backTo = "/inbox", backParams }: { title: string; right?: ReactNode; backTo?: string; backParams?: Record<string, string> }) {
  const paramProps = backParams ? { params: backParams } : {};
  return (
    <header className="pt-safe sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-2">
        <Link to={backTo} {...paramProps} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-muted">
          <ChevronLeft className="h-6 w-6" />
        </Link>
        <h1 className="flex-1 text-[17px] font-semibold">{title}</h1>
        {right}
      </div>
    </header>
  );
}

export function Screen({ children }: { children: ReactNode }) {
  return <main className="pb-safe mx-auto max-w-xl px-4 py-5">{children}</main>;
}
