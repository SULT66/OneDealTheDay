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
