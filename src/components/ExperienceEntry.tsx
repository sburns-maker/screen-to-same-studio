import { Link } from "@tanstack/react-router";
import { useExperiences } from "@/lib/use-experiences";
export function ExperienceEntry({ planId }: { planId: string }) {
  const q = useExperiences();
  const e = q.data?.scenes.find((x) => x.plan_id === planId);
  if (!e) return null;
  return (
    <Link
      to="/experiences"
      search={{ plan: planId }}
      className="mt-3 inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium"
    >
      {e.state === "completed"
        ? "View experience"
        : e.state === "paused"
          ? "Resume Experience"
          : "Experience this outing"}
    </Link>
  );
}
