import { createContext, useContext } from "react";
import type { MediaItem } from "./media";
import type { CharacterKey } from "./characters";
export const MediaContext = createContext<{
  items: MediaItem[];
  character?: CharacterKey | undefined;
}>({ items: [] });
export const useConversationMedia = () => useContext(MediaContext);
