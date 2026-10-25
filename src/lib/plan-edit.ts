import { z } from "zod";
import { zonedInstant } from "./calendar-time";
/** Same strict wall-clock conversion used by conversational scheduling. */
export function easternInstant(date: string, time: string): Date {
  const instant = zonedInstant(date, time, "America/New_York");
  if (!instant)
    throw new Error(
      "Choose a valid, unambiguous Eastern date and time (check daylight saving time).",
    );
  return new Date(instant);
}

export const planEditSchema = z.object({
  id: z.string().uuid(),
  planId: z.string().uuid(),
  version: z.number().int().nonnegative(),
  title: z.string().trim().min(1).max(120),
  date: z.string().regex(/^20\d{2}-\d{2}-\d{2}$/),
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes: z.number().int().min(15).max(360),
  place: z.string().max(80).nullable(),
  confirmed: z.boolean(),
});
