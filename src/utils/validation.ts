import { z } from "zod";

/**
 * Codes accepted by the NWS `area` filter that correspond to US states,
 * the District of Columbia and US territories.
 */
export const US_STATE_CODES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC", "PR", "VI", "GU", "AS", "MP",
] as const;

export type UsStateCode = (typeof US_STATE_CODES)[number];

const STATE_SET: ReadonlySet<string> = new Set(US_STATE_CODES);

/** Accepts "ca", " CA ", "Ca" etc.; normalises to upper case and checks it is a real code. */
export const stateCodeSchema = z
  .string()
  .trim()
  .length(2, "State code must be exactly 2 letters (e.g. CA, NY, TX)")
  .regex(/^[A-Za-z]{2}$/, "State code must contain letters only (e.g. CA, NY, TX)")
  .transform((s) => s.toUpperCase())
  .refine((s) => STATE_SET.has(s), {
    message: "Not a recognised US state or territory code (e.g. CA, NY, TX, DC, PR)",
  });

export const latitudeSchema = z
  .number({ error: "Latitude must be a number" })
  .finite("Latitude must be a finite number")
  .min(-90, "Latitude must be between -90 and 90")
  .max(90, "Latitude must be between -90 and 90");

export const longitudeSchema = z
  .number({ error: "Longitude must be a number" })
  .finite("Longitude must be a finite number")
  .min(-180, "Longitude must be between -180 and 180")
  .max(180, "Longitude must be between -180 and 180");

/** Raw shapes used directly as MCP tool input schemas. */
export const alertsInputShape = {
  state: stateCodeSchema.describe("Two-letter US state or territory code, e.g. CA, NY, TX"),
};

export const forecastInputShape = {
  latitude: latitudeSchema.describe("Latitude of the location in decimal degrees (-90 to 90)"),
  longitude: longitudeSchema.describe("Longitude of the location in decimal degrees (-180 to 180)"),
};

export const alertsInputSchema = z.object(alertsInputShape);
export const forecastInputSchema = z.object(forecastInputShape);

/**
 * NWS /points rejects (301-redirects) coordinates with more than 4 decimal places,
 * so we round to 4 (~11 m precision) before calling it.
 */
export function normaliseCoordinate(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** Human-readable summary of a Zod error, for tool error messages. */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
    .join("; ");
}
