import { useRelationshipCommitments } from "@/lib/use-relationship-commitments";
import { RelationshipMilestones } from "./RelationshipMilestones";

export function ContactRelationshipStory({ characterKey, characterName }: {
  characterKey: string;
  characterName: string;
}) {
  const query = useRelationshipCommitments(characterKey);
  if (query.isLoading) return null;
  if (query.error) return <p role="alert" className="text-sm text-muted-foreground">Relationship history is temporarily unavailable.</p>;
  if (!query.data?.available) return null;
  return <RelationshipMilestones events={query.data.events} characterName={characterName} />;
}
