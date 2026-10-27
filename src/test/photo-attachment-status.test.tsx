import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PhotoAttachmentStatus } from "@/components/PhotoAttachmentStatus";
afterEach(cleanup);
it("shows a pending attachment without a broken image or retry button", () => {
  const view = render(<PhotoAttachmentStatus pending={{ actionId: "owned" }} />);
  expect(screen.getByRole("status")).toHaveTextContent("You can keep chatting");
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
  view.rerender(<PhotoAttachmentStatus />);
  expect(screen.queryByRole("status")).toBeNull();
});
it("shows a terminal delivery failure and no automatic retry control", () => {
  render(
    <PhotoAttachmentStatus failure="Photo could not be delivered. No automatic retry was made." />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("No automatic retry");
  expect(screen.queryByRole("img")).toBeNull();
});
