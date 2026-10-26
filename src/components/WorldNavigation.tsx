import { Link, useLocation } from "@tanstack/react-router";
import { CalendarDays, Compass, Home, Menu, MessageCircle, Phone, Settings, Users, Sparkles, SlidersHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const shortcuts = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/inbox", label: "Messages", icon: MessageCircle },
  { to: "/calls", label: "Phone", icon: Phone },
  { to: "/people", label: "Contacts", icon: Users },
] as const;

export function WorldNavigation() {
  const path = useLocation().pathname;
  if (/^\/(chat|encounter|call|live-call)\//.test(path)) return null;
  const inMenu = ["/explore", "/plans", "/experiences", "/settings", "/debug"].some((p) => path === p || path.startsWith(p + "/"));
  return (
    <nav aria-label="Phone navigation" className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto grid max-w-xl grid-cols-5 px-1">
        {shortcuts.map((item) => {
          const active = path === item.to || path.startsWith(item.to + "/");
          return (
            <Link key={item.to} to={item.to} aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${active ? "font-semibold text-primary" : "text-muted-foreground hover:bg-muted/50"}`}>
              <item.icon size={20} strokeWidth={active ? 2.5 : 1.8} aria-hidden="true" /><span>{item.label}</span>
            </Link>
          );
        })}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="More apps and simulation tools" aria-current={inMenu ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[11px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${inMenu ? "font-semibold text-primary" : "text-muted-foreground hover:bg-muted/50"}`}>
              <Menu size={20} aria-hidden="true" /><span>More</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="mb-2 w-64">
            <DropdownMenuLabel>More apps</DropdownMenuLabel>
            <DropdownMenuItem asChild><Link to="/plans"><CalendarDays className="mr-2 h-4 w-4" />Calendar & plans</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/explore"><Compass className="mr-2 h-4 w-4" />Explore places</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/experiences"><Sparkles className="mr-2 h-4 w-4" />Experiences</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Behind the scenes</DropdownMenuLabel>
            <DropdownMenuItem asChild><Link to="/settings"><Settings className="mr-2 h-4 w-4" />Settings & privacy</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/home" hash="world-controls"><SlidersHorizontal className="mr-2 h-4 w-4" />World controls</Link></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
