import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { loadSchedule } from "./scheduling.functions";
export function useSchedule() {
  const load = useServerFn(loadSchedule);
  return useQuery({
    queryKey: ["schedule"],
    queryFn: () => load(),
    refetchInterval: 10000,
    retry: false,
  });
}
export async function invalidateSchedule(cache: QueryClient) {
  await Promise.all(
    [
      "schedule",
      "interactive-world",
      "living-experiences",
      "experience-history",
      "experience-diagnostics",
      "town",
      "inbox",
    ].map((key) => cache.invalidateQueries({ queryKey: [key] })),
  );
}
