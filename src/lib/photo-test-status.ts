export function photoTestStatus(result: Record<string, unknown> | null, busy: boolean) {
  if (busy)
    return { canDeliver: false, message: "Working… please wait for the result.", showChat: false };
  if (!result)
    return {
      canDeliver: false,
      message: "Enter the current context, then preview eligibility first.",
      showChat: false,
    };
  if (typeof result["error"] === "string")
    return { canDeliver: false, message: result["error"], showChat: false };
  if (typeof result["count"] === "number" && result["count"] > 0)
    return {
      canDeliver: false,
      message:
        "Message queued successfully. Open the conversation to see it when its normal delay ends.",
      showChat: true,
    };
  if (result["replayed"] === true)
    return {
      canDeliver: false,
      message:
        "This request was already processed. Open the conversation; retrying will not generate another image.",
      showChat: true,
    };
  const opportunity = result["opportunity"] as { eligible?: boolean; reason?: string } | undefined;
  if (!opportunity?.eligible)
    return {
      canDeliver: false,
      message:
        opportunity?.reason ||
        (typeof result["reason"] === "string"
          ? result["reason"]
          : "This opportunity is unavailable."),
      showChat: false,
    };
  if (!result["providerConfigured"] || !result["textProviderConfigured"])
    return {
      canDeliver: false,
      message: "Required AI server configuration is missing. Check photo setup in Settings.",
      showChat: false,
    };
  if (!result["deliveryMigrationReady"])
    return {
      canDeliver: false,
      message: "Safe photo delivery is unavailable. Check the migration status in Settings.",
      showChat: false,
    };
  return {
    canDeliver: true,
    message:
      "Eligible now. Ask character to share makes a real request and may incur image charges. She can still decline.",
    showChat: false,
  };
}
