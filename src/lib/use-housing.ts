import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { loadHousing } from "./housing.functions";
export function useHousing() {
  const load = useServerFn(loadHousing);
  return useQuery({
    queryKey: ["housing"],
    queryFn: () => load(),
    refetchInterval: 30000,
    retry: false,
  });
}
