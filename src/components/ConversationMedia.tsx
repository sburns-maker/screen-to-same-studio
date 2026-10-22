import { useMemo } from "react";
import { conversationMedia } from "@/lib/media";
import type { CharacterKey } from "@/lib/characters";
import { MediaContext } from "@/lib/media-context";
export function ConversationMedia({
  messages,
  character,
  children,
}: {
  messages: Parameters<typeof conversationMedia>[0];
  character?: CharacterKey | undefined;
  children: React.ReactNode;
}) {
  const items = useMemo(() => conversationMedia(messages), [messages]);
  return <MediaContext.Provider value={{ items, character }}>{children}</MediaContext.Provider>;
}
