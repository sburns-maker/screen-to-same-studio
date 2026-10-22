import { afterEach, describe, expect, it, vi } from "vitest";
import { developerPhotosAllowed } from "@/lib/spontaneous-photo.server";

afterEach(() => vi.unstubAllEnvs());
describe("developer photo access", () => {
  it("requires an explicit flag and an exact authenticated user ID", () => {
    vi.stubEnv("ENABLE_DEV_PHOTO_ACTIONS", "false");
    vi.stubEnv("DEVELOPER_PHOTO_USER_IDS", "test-user, second-user");
    expect(developerPhotosAllowed("test-user")).toBe(false);
    vi.stubEnv("ENABLE_DEV_PHOTO_ACTIONS", "true");
    expect(developerPhotosAllowed("test-user")).toBe(true);
    expect(developerPhotosAllowed("second-user")).toBe(true);
    expect(developerPhotosAllowed("test")).toBe(false);
    expect(developerPhotosAllowed("other-user")).toBe(false);
    vi.stubEnv("DEVELOPER_PHOTO_USER_IDS", "");
    expect(developerPhotosAllowed("test-user")).toBe(false);
  });
});
