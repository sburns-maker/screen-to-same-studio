/**
 * Device-private recording of Voice Studio audition audio.
 * Recordings live only in this browser's IndexedDB until the user shares/downloads.
 */
export const SAMPLE_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
] as const;

export function pickSampleMime(isSupported: (t: string) => boolean): string | null {
  return SAMPLE_MIME_CANDIDATES.find((t) => isSupported(t)) ?? null;
}

export function sampleExtension(mime: string): "webm" | "m4a" {
  return mime.startsWith("audio/mp4") ? "m4a" : "webm";
}

function slug(s: string): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .toLowerCase()
      .slice(0, 40) || "voice"
  );
}

export function sampleFilename(character: string, candidate: string, at: Date, mime: string): string {
  const ts = at.toISOString().replace(/\.\d+Z$/, "Z").replace(/:/g, "-");
  return `${slug(character)}_${slug(candidate)}_${ts}.${sampleExtension(mime)}`;
}

export type SampleMeta = {
  character: string;
  candidate: string;
  voiceId: string;
  recordedAt: string;
  mime: string;
  durationMs: number;
  audible: boolean;
  partial: boolean;
};
export type StoredSample = SampleMeta & { blob: Blob };

/** Whether a finished recording is worth keeping/sharing. */
export function sampleVerdict(s: { size: number; audible: boolean }): "ok" | "silent" | "empty" {
  if (s.size === 0) return "empty";
  return s.audible ? "ok" : "silent";
}

/** Records a stream; resolves with the blob on stop (including partial recordings). */
export function startSampleRecording(stream: MediaStream) {
  const mime = pickSampleMime((t) => MediaRecorder.isTypeSupported(t));
  if (!mime) throw new Error("This browser can't record audio samples.");
  const rec = new MediaRecorder(stream, { mimeType: mime });
  const chunks: Blob[] = [];
  const started = Date.now();
  let failed = false;
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const done = new Promise<{ blob: Blob; mime: string; durationMs: number; failed: boolean }>((resolve) => {
    rec.onerror = () => {
      failed = true;
    };
    rec.onstop = () =>
      resolve({ blob: new Blob(chunks, { type: mime }), mime, durationMs: Date.now() - started, failed });
  });
  rec.start(1000); // chunks every second so a crash still leaves partial audio
  return {
    done,
    stop() {
      if (rec.state !== "inactive") {
        try {
          rec.stop();
        } catch {
          /* already stopped */
        }
      }
    },
  };
}

const DB = "voice-studio-samples";
const STORE = "latest";
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).finally(() => d.close()) as Promise<T>;
}
export const saveSample = (s: StoredSample) => tx("readwrite", (o) => o.put(s, "sample"));
export const loadSample = () => tx<StoredSample | undefined>("readonly", (o) => o.get("sample"));
export const deleteSample = () => tx("readwrite", (o) => o.delete("sample"));
