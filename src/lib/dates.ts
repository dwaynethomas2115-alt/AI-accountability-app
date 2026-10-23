// Convert a wall-clock date in an IANA timezone without assuming a fixed UTC offset.
// Reject missing/ambiguous DST hours rather than silently moving the user's event.
export function wallTime(iso: string, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const p = Object.fromEntries(parts.map((v) => [v.type, v.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
  };
}
export function toInstant(date: string, time: string, zone: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    throw new Error("Use YYYY-MM-DD and HH:MM.");
  const naive = Date.parse(`${date}T${time}:00Z`);
  if (
    !Number.isFinite(naive) ||
    new Date(naive).toISOString().slice(0, 10) !== date
  )
    throw new Error("Choose a valid date.");
  // Nearby offsets capture standard time, daylight time, and half-hour transitions.
  const offsets = new Set<number>();
  for (const hours of [-36, -12, 0, 12, 36]) {
    const probe = naive + hours * 3600000;
    const local = wallTime(new Date(probe).toISOString(), zone);
    offsets.add(Date.parse(`${local.date}T${local.time}:00Z`) - probe);
  }
  const matches = [...offsets]
    .map((offset) => new Date(naive - offset).toISOString())
    .filter((iso) => {
      const w = wallTime(iso, zone);
      return w.date === date && w.time === time;
    });
  if (matches.length !== 1)
    throw new Error(
      matches.length
        ? "This hour occurs twice because of daylight saving. Choose a time outside the clock change."
        : "This local time does not exist because of daylight saving. Choose another time.",
    );
  return matches[0]!;
}
