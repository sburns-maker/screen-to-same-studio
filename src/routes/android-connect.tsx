import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";

/**
 * Browser-only OAuth continuation for the Android app.
 * A one-time ECDH key is created inside Android Keystore. The public key
 * and random state are carried into this page; only encrypted tokens return.
 * Google's login remains in Chrome, never an embedded Android WebView.
 */
export const Route = createFileRoute("/android-connect")({
  head: () => ({ meta: [
    { title: "Android connection · Tess" },
    { name: "description", content: "Securely connect the Tess Android app to your existing account." },
    { property: "og:title", content: "Android connection · Tess" },
    { property: "og:description", content: "Securely connect the Tess Android app to your existing account." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  ssr: false,
  component: AndroidConnect,
});

const STORAGE = "lw-android-connect-v1";
type Pending = { pub: string; state: string; created: number };
const base64url = (data: ArrayBuffer | Uint8Array): string => {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
function unbase64url(value: string): Uint8Array<ArrayBuffer> {
  const text = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(text + "=".repeat((4 - text.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
function pendingSession(): Pending | null {
  const query = new URLSearchParams(window.location.search);
  const pub = query.get("pub");
  const state = query.get("state");
  if (pub && state && pub.length < 1200 && /^[A-Za-z0-9_-]+$/.test(pub) &&
      /^[A-Za-z0-9_-]{32,64}$/.test(state)) {
    const flow: Pending = { pub, state, created: Date.now() };
    localStorage.setItem(STORAGE, JSON.stringify(flow));
    window.history.replaceState(window.history.state, "", "/android-connect");
    return flow;
  }
  try {
    const value = localStorage.getItem(STORAGE);
    if (!value) return null;
    const flow = JSON.parse(value) as Pending;
    if (Date.now() - flow.created > 10 * 60_000 || !flow.pub || !flow.state) {
      localStorage.removeItem(STORAGE);
      return null;
    }
    return flow;
  } catch { return null; }
}

function AndroidConnect() {
  const [flow] = useState(() => pendingSession());
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [readyToReturn, setReadyToReturn] = useState<string | null>(null);
  const [message, setMessage] = useState("Checking your existing Living World login…");
  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (active) {
        setSignedIn(Boolean(data.user));
        setMessage(error ? "Sign in with Google to continue." :
          data.user ? "Signed in. Return securely to the Android app." :
          "Sign in with the same Google account you use for Tess and the others.");
      }
    }).catch(() => { if (active) setMessage("Unable to check sign-in. Retry the page."); });
    return () => { active = false; };
  }, []);

  async function google() {
    if (!flow) return;
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/android-connect",
    });
    if (result.error) {
      setMessage(result.error.message ?? "Google sign-in was not completed.");
      setBusy(false);
    } else if (!result.redirected) {
      const { data } = await supabase.auth.getUser();
      setSignedIn(Boolean(data.user));
      setBusy(false);
    }
  }

  async function returnToApp() {
    if (!flow) return;
    setBusy(true);
    setMessage("Encrypting your one-time Android sign-in…");
    try {
      const { data: user, error: userError } = await supabase.auth.getUser();
      if (userError || !user.user) throw new Error("Your Google session expired. Sign in again.");
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) throw new Error("Your login session is not available.");
      // A refresh token is secret and single-use. Encrypt before constructing a URI.
      const session = data.session;
      const appKey = await crypto.subtle.importKey("spki", unbase64url(flow.pub),
        { name: "ECDH", namedCurve: "P-256" }, false, []);
      const ephemeral = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
      const shared = await crypto.subtle.deriveBits(
        { name: "ECDH", public: appKey }, ephemeral.privateKey, 256);
      const material = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
      const salt = unbase64url(flow.state);
      const key = await crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt,
          info: new TextEncoder().encode("living-world-android-auth-v1") },
        material, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const dataToEncrypt = JSON.stringify({
        state: flow.state,
        issuedAt: Date.now(),
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key,
        new TextEncoder().encode(dataToEncrypt));
      const pub = await crypto.subtle.exportKey("spki", ephemeral.publicKey);
      const handoff = base64url(new TextEncoder().encode(JSON.stringify({
        version: 1, pub: base64url(pub), iv: base64url(iv), payload: base64url(encrypted),
      })));
      // The return is initiated by a separate explicit user action so Chrome
      // does not block navigation following asynchronous WebCrypto work.
      setReadyToReturn(handoff);
      setMessage("Secure Google sign-in is ready. Tap Open Living World Home.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to complete encrypted sign-in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-6 text-foreground">
      <h1 className="text-3xl font-semibold">Connect Living World Home</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      {readyToReturn ? (
        <button onClick={() => {
          localStorage.removeItem(STORAGE);
          window.location.assign("livingworld://auth?data=" + encodeURIComponent(readyToReturn));
        }} className="min-h-12 rounded-full bg-primary px-5 text-primary-foreground">
          Open Living World Home
        </button>
      ) : !flow ? (
        <p className="rounded-xl border p-4 text-sm">
          This sign-in request has expired. Open Living World Home and tap Connect with Google again.
        </p>
      ) : !signedIn ? (
        <button onClick={() => void google()} disabled={busy}
          className="min-h-12 rounded-full bg-primary px-5 text-primary-foreground disabled:opacity-50">
          Continue with Google
        </button>
      ) : (
        <button onClick={() => void returnToApp()} disabled={busy}
          className="min-h-12 rounded-full bg-primary px-5 text-primary-foreground disabled:opacity-50">
          Return to Living World Home
        </button>
      )}
      <p className="text-xs text-muted-foreground">
        Only continue if you started sign-in from Living World Home. Sign-in happens in Chrome;
        the transfer is encrypted for your installed app and expires in ten minutes.
      </p>
    </main>
  );
}
