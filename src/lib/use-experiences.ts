import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { experienceSnapshot } from "./living-experiences.functions";
export function useExperiences() {
  const load = useServerFn(experienceSnapshot);
  return useQuery({
    queryKey: ["living-experiences"],
    queryFn: () => load(),
    refetchInterval: 15000,
    retry: false,
  });
}
