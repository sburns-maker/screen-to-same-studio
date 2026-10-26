import { useState } from "react";
import {
  disableRingtone,
  enableRingtone,
  ringtoneEnabled,
  startRingtone,
} from "@/lib/call-ringtone";
export function RingtoneSettings() {
  const [enabled, setEnabled] = useState(ringtoneEnabled);
  const [error, setError] = useState("");
  return (
    <div className="mb-5 rounded-2xl border p-4 text-sm">
      <p className="font-medium">Incoming call sound</p>
      <p className="my-2 text-muted-foreground">
        Ringing works while the app is open. After reopening, tap Enable & test sound if your
        browser blocks audio. Device silent mode and volume still apply.
      </p>
      <button
        className="min-h-11 underline"
        onClick={async () => {
          try {
            await enableRingtone();
            setEnabled(true);
            setError("");
            await startRingtone(new Date(Date.now() + 900).toISOString());
          } catch {
            setError(
              "Sound is blocked. Check browser permissions and device volume, then try again.",
            );
          }
        }}
      >
        Enable & test sound
      </button>
      {enabled && (
        <button
          className="ml-4 min-h-11 underline"
          onClick={() => {
            disableRingtone();
            setEnabled(false);
          }}
        >
          Mute ringtone
        </button>
      )}
      <p role="status">
        {error || (enabled ? "Ringtone enabled on this device" : "Ringtone off on this device")}
      </p>
    </div>
  );
}
