import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const conversationsQuery = queryOptions({
  queryKey: ["conversations"],
  queryFn: async () => {
    const { data, error } = await supabase.from("conversations").select("*, character:characters(*)");
    if (error) throw error;
    return data ?? [];
  },
});

export const conversationQuery = (conversationId: string | undefined) =>
  queryOptions({
    queryKey: ["conversation", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*, character:characters(*)")
        .eq("id", conversationId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const messagesQuery = (conversationId: string | undefined, limit = 200) =>
  queryOptions({
    queryKey: ["messages", conversationId, limit],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, sender, body, created_at, visible_at, metadata")
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).reverse();
    },
  });

export const stateQuery = (conversationId: string | undefined) =>
  queryOptions({
    queryKey: ["tess_state", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase.from("tess_state").select("*").eq("conversation_id", conversationId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const debriefsQuery = (conversationId: string | undefined) =>
  queryOptions({
    queryKey: ["debriefs", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("debriefs")
        .select("*")
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

export const memoriesQuery = (conversationId: string | undefined) =>
  queryOptions({
    queryKey: ["memories", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memories")
        .select("*")
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

export const userTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
};
