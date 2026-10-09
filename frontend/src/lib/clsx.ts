/** Minimal class-name combiner (avoids pulling in an extra dependency). */
export type ClassValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ClassValue[]
  | Record<string, boolean | null | undefined>;

export function clsx(inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const value of inputs) {
    if (!value) continue;
    if (typeof value === "string" || typeof value === "number") {
      out.push(String(value));
    } else if (Array.isArray(value)) {
      const nested = clsx(value);
      if (nested) out.push(nested);
    } else if (typeof value === "object") {
      for (const [key, on] of Object.entries(value)) {
        if (on) out.push(key);
      }
    }
  }
  return out.join(" ");
}
