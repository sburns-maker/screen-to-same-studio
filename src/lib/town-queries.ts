import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { loadTown } from "./town.functions";
export function useTown() {
  const load = useServerFn(loadTown);
  return useQuery({
    queryKey: ["town"],
    queryFn: () => load(),
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: false,
  });
}
