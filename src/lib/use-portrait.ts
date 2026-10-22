import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { loadActivePortraits } from "./visual-profiles.functions";
export function usePortraits() {
  const load = useServerFn(loadActivePortraits);
  return useQuery({
    queryKey: ["active-portraits"],
    queryFn: () => load(),
    staleTime: 10 * 60_000,
    retry: false,
  });
}
