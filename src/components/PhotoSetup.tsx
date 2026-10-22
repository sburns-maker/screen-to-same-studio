import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { checkPhotoSetup } from "@/lib/photo-setup.functions";

type Status = Awaited<ReturnType<typeof checkPhotoSetup>>;
export function PhotoSetup({ tessConversationId }: { tessConversationId?: string | undefined }) {
  const check = useServerFn(checkPhotoSetup);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = async (checkModel = false) => {
    setBusy(true);
    setError("");
    try {
      setStatus(await check({ data: { checkModel } }));
    } catch {
      setError("Could not check setup. Check your connection and sign-in, then retry.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="mt-6 rounded-2xl bg-surface p-4">
      <summary className="cursor-pointer text-[15px]">Advanced: photo setup and testing</summary>
      <p className="mt-3 text-xs text-muted-foreground">
        Check configuration here without SSH. These checks do not generate images, send messages or
        change memories. Model access checks do not verify a paid generation.
      </p>
      <button
        className="mt-3 rounded-lg bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
        disabled={busy}
        onClick={() => void load()}
      >
        Check setup
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm">
          {error}
        </p>
      )}
      {status && (
        <div className="mt-3 space-y-3 text-sm">
          <div>
            <span className="text-muted-foreground">Your account ID</span>
            <code className="mt-1 block select-all break-all text-xs">{status.userId}</code>
            <p className="mt-1 text-xs text-muted-foreground">
              Use this ID for DEVELOPER_PHOTO_USER_IDS in Lovable Cloud secrets.
            </p>
          </div>
          <ul className="space-y-1">
            <li>
              OpenAI server key: {status.keyPresent ? "present (not yet verified)" : "missing"}
            </li>
            <li>Supabase server configuration: {status.servicePresent ? "present" : "missing"}</li>
            <li>Delivery migration: {status.migration}</li>
            <li>Tess canonical reference: {status.tessReference}</li>
            <li>Developer flag: {status.developerFlag ? "enabled" : "disabled"}</li>
            <li>Your developer access: {status.developerAllowed ? "allowed" : "not enabled"}</li>
            <li>
              {status.model} account access: {status.modelAccess}
            </li>
          </ul>
          {status.migration === "missing" && (
            <p className="text-xs">
              The merged code still needs migration 0008 applied through your database management
              UI. Merging the source does not install that database function.
            </p>
          )}
          {!status.developerAllowed && (
            <p className="text-xs">
              In Lovable Cloud secrets, set ENABLE_DEV_PHOTO_ACTIONS to true and
              DEVELOPER_PHOTO_USER_IDS to your account ID above. Keep these server-side.
            </p>
          )}
          <button
            className="rounded-lg border px-3 py-2 disabled:opacity-50"
            disabled={busy || !status.developerAllowed || !status.keyPresent}
            onClick={() => void load(true)}
          >
            Check OpenAI model access
          </button>
          {status.developerAllowed && tessConversationId && (
            <Link
              className="block underline"
              to="/debug/$conversationId"
              params={{ conversationId: tessConversationId }}
            >
              Open Tess photo preview and test
            </Link>
          )}
        </div>
      )}
    </details>
  );
}
