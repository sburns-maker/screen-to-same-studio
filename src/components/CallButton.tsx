import { Phone } from "lucide-react";
import { Link } from "@tanstack/react-router";

/** Opens the live voice call screen; nothing is dialed until the user taps Call there. */
export function CallButton({ conversationId, name }: { conversationId: string; name: string }) {
  return (
    <Link
      to="/live-call/$conversationId"
      params={{ conversationId }}
      search={{}}
      aria-label={`Call ${name}`}
      className="flex h-11 w-11 items-center justify-center rounded-full border"
    >
      <Phone className="h-5 w-5" />
    </Link>
  );
}
