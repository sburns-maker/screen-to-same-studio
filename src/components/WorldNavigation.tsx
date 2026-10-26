import { Link, useLocation } from "@tanstack/react-router";
import { Home, MessageCircle, Compass, Users, CalendarDays } from "lucide-react";

const tabs = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/inbox", label: "Chats", icon: MessageCircle },
  { to: "/explore", label: "Explore", icon: Compass },
  { to: "/people", label: "People", icon: Users },
  { to: "/plans", label: "Plans", icon: CalendarDays },
] as const;

/** Primary navigation stays consistent; immersive conversation/call pages own their headers. */
export function WorldNavigation() {
  const path = useLocation().pathname;
  if (/^\/(chat|encounter|call|live-call)\//.test(path)) return null;

  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto grid max-w-xl grid-cols-5 px-1">
        {tabs.map((t) => {
          const active = path === t.to || path.startsWith(t.to + "/") ||
            (t.to === "/inbox" && path === "/calls") ||
            (t.to === "/plans" && path === "/experiences");
          return (
            <Link
              key={t.to}
              to={t.to}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${active ? "font-semibold text-primary" : "text-muted-foreground hover:bg-muted/50"}`}
            >
              <t.icon size={20} strokeWidth={active ? 2.5 : 1.8} aria-hidden="true" />
              <span>{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
