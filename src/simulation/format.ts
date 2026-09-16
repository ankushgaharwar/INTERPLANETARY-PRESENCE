export const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

export const formatSeconds = (seconds: number, precision = 3) =>
  `${seconds.toFixed(precision)}s`;

export const formatClock = (seconds: number) => {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const tenths = Math.floor((safeSeconds % 1) * 10);

  return `${minutes.toString().padStart(2, "0")}:${wholeSeconds
    .toString()
    .padStart(2, "0")}.${tenths}`;
};

export const formatPayload = (bits: number) => {
  if (bits < 1_000_000) {
    return `${(bits / 1_000).toFixed(bits < 10_000 ? 1 : 0)} kbit`;
  }

  return `${(bits / 1_000_000).toFixed(bits < 10_000_000 ? 2 : 1)} Mbit`;
};
