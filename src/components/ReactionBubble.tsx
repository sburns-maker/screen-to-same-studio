import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const REACTION_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "😡"] as const;
const reactionStorageKey = (conversationId: string, messageId: string) =>
  `chats:local-reaction:${conversationId}:${messageId}`;

/** Initial device-local UI: no AI generation, message mutation or relationship impact. */
export function ReactionBubble({
  messageId,
  conversationId,
  mine,
  timestamp,
  body,
  onUnsend,
}: {
  messageId: string;
  conversationId: string;
  mine: boolean;
  timestamp: string;
  body: string;
  onUnsend?: () => void;
}) {
  const key = reactionStorageKey(conversationId, messageId);
  const [reaction, setReaction] = useState<string | null>(() => {
    try {
      return typeof window === "undefined" ? null : window.localStorage.getItem(key);
    } catch {
      return null;
    }
  });
  const [open, setOpen] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const clearPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    pressOrigin.current = null;
  };
  const choose = (emoji: string) => {
    const next = reaction === emoji ? null : emoji;
    setReaction(next);
    try {
      if (next) window.localStorage.setItem(key, next);
      else window.localStorage.removeItem(key);
    } catch {
      /* private browsing can block local storage */
    }
    setOpen(false);
  };
  useEffect(() => () => clearPress(), []);
  return (
    <div className="relative max-w-full">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={`${timestamp} · React to message`}
            aria-label={`React to message: ${body.slice(0, 80)}`}
            onPointerDown={(e) => {
              // Radix opens on primary pointer-down by default, including a quick tap.
              // Prevent that menu action without preventing native touch scrolling.
              e.preventDefault();
              clearPress();
              if (e.button !== 0 || !e.isPrimary) return;
              pressOrigin.current = { x: e.clientX, y: e.clientY };
              pressTimer.current = setTimeout(() => {
                clearPress();
                setOpen(true);
              }, 500);
            }}
            onPointerMove={(e) => {
              const origin = pressOrigin.current;
              if (origin && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 10) {
                clearPress();
              }
            }}
            onClick={(e) => e.preventDefault()}
            onPointerUp={clearPress}
            onPointerCancel={clearPress}
            onPointerLeave={clearPress}
            onContextMenu={(e) => {
              e.preventDefault();
              clearPress();
              setOpen(true);
            }}
            className={cn(
              "bubble-in block max-w-full whitespace-pre-wrap break-words px-3.5 py-2 text-left text-[15px] leading-[1.45]",
              mine
                ? "rounded-2xl rounded-br-md bg-bubble-me text-bubble-me-foreground"
                : "rounded-2xl rounded-bl-md bg-bubble-them text-bubble-them-foreground",
            )}
          >
            {body}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={mine ? "end" : "start"}
          side="top"
          className="flex min-w-0 flex-wrap items-center gap-1 rounded-full p-1.5"
        >
          {REACTION_EMOJIS.map((emoji) => (
            <DropdownMenuItem
              key={emoji}
              onSelect={() => choose(emoji)}
              aria-label={`React with ${emoji}`}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full p-0 text-xl focus:bg-muted"
            >
              {emoji}
            </DropdownMenuItem>
          ))}
          {mine && onUnsend && (
            <DropdownMenuItem
              onSelect={() => {
                if (window.confirm("Unsend this message? It will be removed from the chat.")) onUnsend();
              }}
              className="h-10 cursor-pointer rounded-full px-3 text-sm font-medium text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              Unsend
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {reaction && (
        <span
          aria-label={`Current reaction ${reaction}. Hold the message to change or remove`}
          className={cn(
            "relative -mt-1.5 flex w-fit min-h-7 items-center rounded-full border bg-background px-2 text-sm shadow-sm",
            mine ? "ml-auto mr-1" : "ml-1",
          )}
        >
          {reaction}
        </span>
      )}
    </div>
  );
}
