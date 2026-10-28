/** Tavus now identifies the speaker by role on a shared speaking event. */
export function presenterSpeakingEvent(payload: unknown): "started" | "stopped" | null {
  if (!payload || typeof payload !== "object") return null;
  const event = payload as { event_type?: string; properties?: { role?: string } };
  const type = event.event_type || "";
  const role = String(event.properties?.role || "").toLowerCase();
  if (["conversation.replica.started_speaking", "conversation.replica-started-speaking"].includes(type)) return "started";
  if (["conversation.replica.stopped_speaking", "conversation.replica-stopped-speaking"].includes(type)) return "stopped";
  if (!["pal", "replica"].includes(role)) return null;
  if (type === "conversation.started_speaking") return "started";
  if (type === "conversation.stopped_speaking") return "stopped";
  return null;
}

/** A missing acknowledgement must not deadlock the script forever. */
export function hostTurnFinished({ now, sentAt, stoppedAt, speaking, sawEvents }: {
  now: number; sentAt: number; stoppedAt: number; speaking: boolean; sawEvents: boolean;
}): boolean {
  if (speaking) return false;
  if (!sentAt) return !stoppedAt || now - stoppedAt > 1500;
  if (stoppedAt >= sentAt && now - stoppedAt > 1500) return true;
  return now - sentAt > (sawEvents ? 45000 : 25000);
}

/** Recompute from the server's duration, independent of the browser wall clock. */
export function hostClockInstruction(snapshot: {
  state: string; secondsUntilStart: number | null; secondsUntilEnd: number | null; receivedAt: number;
} | null, now: number): string {
  const rule = "Never repeat a remaining-time number from earlier dialogue or a script. If this clock is unavailable, tell viewers to check the on-screen countdown without giving a number.";
  if (!snapshot) return rule;
  const elapsed = Math.max(0, (now - snapshot.receivedAt) / 1000);
  const raw = snapshot.state === "live" ? snapshot.secondsUntilEnd : snapshot.secondsUntilStart;
  if (raw == null || !Number.isFinite(raw)) return rule;
  const seconds = Math.max(0, Math.floor(raw - elapsed));
  const duration = `${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds`;
  if (snapshot.state === "live") return `CURRENT COUNTDOWN: ${seconds ? duration + " remain before this drop ends" : "this drop has ended; do not say the offer is still live"}. This supersedes ALL earlier time estimates. Use only this fresh time if mentioning a duration; it keeps decreasing. ${rule}`;
  if (snapshot.state === "waiting" || snapshot.state === "upcoming") return `CURRENT COUNTDOWN: ${duration} until the scheduled start, NOT time left to buy. ${rule}`;
  return `CURRENT COUNTDOWN: the drop has ended. Do not say the offer is still live. ${rule}`;
}

export const HOST_CLOSING_SCRIPT = "That brings this OneDailyDrop Live to a close! This drop has ended. Thanks for watching and sending in your questions. Follow OneDailyDrop for the next drop, and I will see you next time. Bye for now!";
