import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { loadPhone } from "./phone-calls.functions";
export function usePhone(conversation?: string) {
  const load = useServerFn(loadPhone);
  return useQuery({
    queryKey: conversation ? ["phone", conversation] : ["phone"],
    queryFn: () => load({ data: { conversation } }),
    refetchInterval: 5000,
    retry: false,
  });
}
