// Only reviewed database messages may reach the player. Never expose raw SQL,
// provider errors or private context, and never automatically replay a mutation.
export function experienceActionError(message: string): string {
  switch (message) {
    case "Experience changed; refresh":
    case "Confirmed plan changed; refresh":
    case "Stale generation":
      return "Your saved outing changed while this screen was open. Refresh the saved outing, then retry. Your draft and recorded progress are preserved.";
    case "A scene is still generating; retry shortly":
      return "A response is still being prepared for this outing. Refresh its status before retrying.";
    case "Retry the pending scene first":
      return "An earlier response needs recovery. Use Retry pending scene to continue your saved outing.";
    case "Experience moment limit reached; finish the outing":
      return "This outing has reached its scene limit. Finish here or finish the remaining portion automatically; your recorded progress is preserved.";
    case "Experience ownership does not permit this action":
    case "Experience transition unavailable":
      return "This action is not available in the outing’s current state. Refresh the saved outing to see its current controls.";
    case "Finish the earlier experience before continuing this outing":
      return message;
    case "Resolve conflicting accepted plans before this outing":
      return "Accepted plans overlap. Review the conflicting plans before starting this outing.";
    default:
      return message.includes("limit")
        ? "Experience usage or retry limit reached. Recorded progress is safe."
        : "The outing action could not be saved. Refresh the saved outing before retrying. Recorded progress is preserved.";
  }
}
