import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { loadRelationshipCommitments } from "./relationship-commitments.functions";

export function useRelationshipCommitments(characterKey: string) {
  const load = useServerFn(loadRelationshipCommitments);
  return useQuery({
    queryKey: ["relationship-commitments", characterKey],
    queryFn: () => load({ data: { characterKey } }),
    enabled: Boolean(characterKey),
    retry: false,
  });
}
