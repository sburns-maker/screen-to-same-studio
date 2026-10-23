import { Link, useLocation } from "@tanstack/react-router";
import { Home, MessageCircle, Compass, Users, CalendarDays } from "lucide-react";
const tabs = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/inbox", label: "Messages", icon: MessageCircle },
  { to: "/explore", label: "Explore", icon: Compass },
  { to: "/people", label: "People", icon: Users },
  { to: "/plans", label: "Plans", icon: CalendarDays },
] as const;
export function WorldNavigation() {
  const path = useLocation().pathname;
  if (/^\/(chat|encounter|call)\//.test(path)) return null;
  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-xl justify-around">
        {tabs.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            aria-current={path === t.to ? "page" : undefined}
            className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] ${path === t.to ? "font-semibold text-primary" : "text-muted-foreground"}`}
          >
            <t.icon size={21} />
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
