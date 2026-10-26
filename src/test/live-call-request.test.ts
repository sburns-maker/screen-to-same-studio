import { expect, it } from "vitest";
import { liveCallRequest, liveCallFailure } from "@/lib/live-call-request";
import { auditionSessionConfig } from "@/lib/voice-audition-modes";
it("uses the same voice/audio shape as the working Studio path without speculative Realtime turn settings", () => {
  const request = liveCallRequest("private-sdp", "voice_tess", "private-context", true);
  const studio = auditionSessionConfig("tess", "voice_tess", "scripted", "test");
  expect(request.session.audio).toEqual(studio.audio);
  expect(request.session.model).toBe(studio.model);
  expect(request.session.delegation).toEqual(studio.delegation);
  expect(JSON.stringify(request)).not.toContain("turn_detection");
  expect(request.session.input[0]?.content[0]?.text).not.toBe(
    liveCallRequest("sdp", "voice_tess", "context", false).session.input[0]?.content[0]?.text,
  );
});
it("reports only safe provider code/parameter/request ID, never messages, SDP or prompts", () => {
  const error = liveCallFailure(
    400,
    JSON.stringify({
      error: {
        code: "unknown_parameter",
        param: "session.audio.input.turn_detection",
        message: "SECRET PROMPT SDP API KEY",
      },
    }),
    "req_123",
  );
  expect(error).toMatchObject({
    status: 400,
    code: "unknown_parameter",
    param: "session.audio.input.turn_detection",
    requestId: "req_123",
  });
  expect(error.message).toContain("parameter session.audio.input.turn_detection");
  expect(JSON.stringify(error)).not.toContain("SECRET");
  expect(
    liveCallFailure(
      400,
      JSON.stringify({
        error: { code: "SECRET", param: "secret.customer.text", message: "SECRET" },
      }),
      "SECRET",
    ),
  ).toMatchObject({ code: "unclassified", param: null, requestId: null });
  expect(liveCallFailure(400, "not json", null).code).toBe("unclassified");
  expect(liveCallFailure(400, "null", null).code).toBe("unclassified");
});
