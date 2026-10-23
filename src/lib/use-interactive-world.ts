import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { loadInteractiveWorld } from "./interactive-world.functions";
export function useInteractiveWorld() {
  const load = useServerFn(loadInteractiveWorld);
  return useQuery({
    queryKey: ["interactive-world"],
    queryFn: () => load(),
    refetchInterval: 15000,
    retry: false,
  });
}
