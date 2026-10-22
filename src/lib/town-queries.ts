import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { loadTown } from "./town.functions";
export function useTown() {
  const load = useServerFn(loadTown);
  return useQuery({
    queryKey: ["town"],
    queryFn: () => load(),
    refetchInterval: 30_000,
    retry: false,
  });
}
