import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Screen, ScreenHeader } from "@/components/ScreenHeader";
import { Input } from "@/components/ui/input";
import { conversationQuery, messagesQuery } from "@/lib/tess-queries";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Conversation history — Tess" },
      { name: "description", content: "Search and review your full conversation with Tess." },
      { property: "og:title", content: "Conversation history — Tess" },
      { property: "og:description", content: "Search and review your full conversation with Tess." },
    ],
  }),
  component: History,
});

function History() {
  const conv = useQuery(conversationQuery);
  const msgs = useQuery(messagesQuery(conv.data?.id));
  const [q, setQ] = useState("");
  const now = Date.now();
  const visible = (msgs.data ?? []).filter((m) => new Date(m.visible_at).getTime() <= now);
  const filtered = q ? visible.filter((m) => m.body.toLowerCase().includes(q.toLowerCase())) : visible;
  const days = new Map<string, typeof filtered>();
  for (const m of filtered) {
    const k = new Date(m.created_at).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
    days.set(k, [...(days.get(k) ?? []), m]);
  }

  return (
    <>
      <ScreenHeader title="History" />
      <Screen>
        <Input placeholder="Search messages" value={q} onChange={(e) => setQ(e.target.value)} className="h-11 rounded-xl" />
        <p className="mt-3 text-xs text-muted-foreground">
          {visible.length} messages · {visible.filter((m) => m.sender === "tess" && (m.metadata as { initiated?: boolean })?.initiated).length} started by Tess
        </p>
        {[...days.entries()].reverse().map(([day, items]) => (
          <section key={day} className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{day}</h3>
            <ul className="mt-2 space-y-1.5">
              {items.map((m) => (
                <li key={m.id} className="flex gap-3 text-sm">
                  <span className="w-14 shrink-0 text-muted-foreground">
                    {new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </span>
                  <span className={m.sender === "tess" ? "font-medium" : "text-foreground/80"}>
                    {m.sender === "tess" ? "Tess: " : "You: "}
                    {m.body}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </Screen>
    </>
  );
}
