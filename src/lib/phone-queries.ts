import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { loadPhone } from "./phone-calls.functions";
export function usePhone() {
  const load = useServerFn(loadPhone);
  return useQuery({
    queryKey: ["phone"],
    queryFn: () => load(),
    refetchInterval: 5000,
    retry: false,
  });
}
