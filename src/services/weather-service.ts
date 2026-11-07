import type { WeatherConfig } from "../config.js";
import { logger } from "../utils/logger.js";
import { normaliseCoordinate } from "../utils/validation.js";

/* ------------------------------------------------------------------ */
/* Domain types returned to the tools                                  */
/* ------------------------------------------------------------------ */

export interface WeatherAlert {
  event: string;
  areaDesc: string;
  severity: string;
  urgency: string;
  certainty: string;
  headline: string | null;
  description: string | null;
  instruction: string | null;
  effective: string | null;
  expires: string | null;
  senderName: string | null;
}

export interface ForecastPeriod {
  number: number;
  name: string;
  startTime: string;
  endTime: string;
  isDaytime: boolean;
  temperature: number | null;
  temperatureUnit: string;
  probabilityOfPrecipitation: number | null;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  detailedForecast: string;
}

export interface Forecast {
  location: string | null;
  gridId: string;
  gridX: number;
  gridY: number;
  updated: string | null;
  periods: ForecastPeriod[];
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export type WeatherErrorKind =
  | "timeout"
  | "network"
  | "not_found"
  | "rate_limited"
  | "unavailable"
  | "http"
  | "invalid_response";

export class WeatherServiceError extends Error {
  constructor(
    message: string,
    readonly kind: WeatherErrorKind,
    readonly status?: number,
  ) {
    super(message);
    this.name = "WeatherServiceError";
  }
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface WeatherServiceOptions {
  fetch?: FetchLike;
  /** Delay between retries, ms. Tests set this to 0. */
  retryDelayMs?: number;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class WeatherService {
  private readonly fetchImpl: FetchLike;
  private readonly retryDelayMs: number;

  constructor(
    private readonly config: WeatherConfig,
    options: WeatherServiceOptions = {},
  ) {
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.retryDelayMs = options.retryDelayMs ?? 750;
  }

  /** Active alerts for a validated, upper-case state/territory code. */
  async getAlerts(state: string): Promise<WeatherAlert[]> {
    const url = `${this.config.apiBase}/alerts/active?area=${encodeURIComponent(state)}`;
    const body = await this.requestJson(url);

    if (!Array.isArray(body.features)) {
      throw new WeatherServiceError("NWS alerts response did not contain a 'features' list", "invalid_response");
    }

    return body.features
      .map((feature) => (isObject(feature) && isObject(feature.properties) ? feature.properties : null))
      .filter((p): p is Json => p !== null)
      .map((p) => ({
        event: str(p.event, "Unknown event"),
        areaDesc: str(p.areaDesc, "Unknown area"),
        severity: str(p.severity, "Unknown"),
        urgency: str(p.urgency, "Unknown"),
        certainty: str(p.certainty, "Unknown"),
        headline: strOrNull(p.headline),
        description: strOrNull(p.description),
        instruction: strOrNull(p.instruction),
        effective: strOrNull(p.effective),
        expires: strOrNull(p.expires),
        senderName: strOrNull(p.senderName),
      }));
  }

  /**
   * Forecast for a coordinate, using the documented two-step NWS workflow:
   *   1. GET /points/{lat},{lon}  -> properties.forecast (URL of the grid forecast)
   *   2. GET that forecast URL     -> properties.periods
   */
  async getForecast(latitude: number, longitude: number): Promise<Forecast> {
    const lat = normaliseCoordinate(latitude);
    const lon = normaliseCoordinate(longitude);

    let points: Json;
    try {
      points = await this.requestJson(`${this.config.apiBase}/points/${lat},${lon}`);
    } catch (err) {
      if (err instanceof WeatherServiceError && err.kind === "not_found") {
        throw new WeatherServiceError(
          `No NWS forecast data for ${lat}, ${lon}. The NWS only covers the United States and its territories.`,
          "not_found",
          err.status,
        );
      }
      throw err;
    }

    const props = isObject(points.properties) ? points.properties : null;
    const forecastUrl = props ? strOrNull(props.forecast) : null;
    if (!props || !forecastUrl) {
      throw new WeatherServiceError(
        "NWS points response did not include a forecast URL for this location",
        "invalid_response",
      );
    }

    const relLoc = isObject(props.relativeLocation) ? props.relativeLocation : null;
    const relProps = relLoc && isObject(relLoc.properties) ? relLoc.properties : null;
    const location =
      relProps && strOrNull(relProps.city) && strOrNull(relProps.state)
        ? `${str(relProps.city)}, ${str(relProps.state)}`
        : null;

    const forecast = await this.requestJson(forecastUrl);
    const fprops = isObject(forecast.properties) ? forecast.properties : null;
    if (!fprops || !Array.isArray(fprops.periods)) {
      throw new WeatherServiceError("NWS forecast response did not contain a 'periods' list", "invalid_response");
    }

    const periods: ForecastPeriod[] = fprops.periods.filter(isObject).map((p, i) => {
      const pop = isObject(p.probabilityOfPrecipitation) ? numOrNull(p.probabilityOfPrecipitation.value) : null;
      return {
        number: numOrNull(p.number) ?? i + 1,
        name: str(p.name, `Period ${i + 1}`),
        startTime: str(p.startTime),
        endTime: str(p.endTime),
        isDaytime: p.isDaytime === true,
        temperature: numOrNull(p.temperature),
        temperatureUnit: str(p.temperatureUnit, "F"),
        probabilityOfPrecipitation: pop,
        windSpeed: str(p.windSpeed, "Unknown"),
        windDirection: str(p.windDirection, ""),
        shortForecast: str(p.shortForecast, "No summary"),
        detailedForecast: str(p.detailedForecast, ""),
      };
    });

    return {
      location,
      gridId: str(props.gridId, "?"),
      gridX: numOrNull(props.gridX) ?? 0,
      gridY: numOrNull(props.gridY) ?? 0,
      updated: strOrNull(fprops.updateTime) ?? strOrNull(fprops.updated),
      periods,
    };
  }

  /* -------------------------------------------------------------- */

  private async requestJson(url: string): Promise<Json> {
    let attempt = 0;
    for (;;) {
      try {
        return await this.requestOnce(url);
      } catch (err) {
        const retryable =
          err instanceof WeatherServiceError &&
          (err.kind === "network" || err.kind === "unavailable" || err.kind === "timeout");
        if (!retryable || attempt >= this.config.maxRetries) throw err;
        attempt += 1;
        logger.warn("NWS request failed, retrying", { url, attempt, reason: (err as Error).message });
        if (this.retryDelayMs > 0) await sleep(this.retryDelayMs * attempt);
      }
    }
  }

  private async requestOnce(url: string): Promise<Json> {
    const started = Date.now();
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: {
          "User-Agent": this.config.userAgent,
          Accept: "application/geo+json",
        },
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === "TimeoutError" || name === "AbortError") {
        throw new WeatherServiceError(
          `The NWS API did not respond within ${this.config.timeoutMs / 1000}s`,
          "timeout",
        );
      }
      throw new WeatherServiceError(
        `Could not reach the NWS API: ${(err as Error)?.message ?? String(err)}`,
        "network",
      );
    }

    logger.debug("NWS response", { url, status: response.status, ms: Date.now() - started });

    if (!response.ok) {
      const detail = await this.readProblemDetail(response);
      const suffix = detail ? ` — ${detail}` : "";
      if (response.status === 404) {
        throw new WeatherServiceError(`NWS returned 404 Not Found${suffix}`, "not_found", 404);
      }
      if (response.status === 429) {
        throw new WeatherServiceError(`NWS rate limit hit (429). Try again shortly${suffix}`, "rate_limited", 429);
      }
      if (response.status >= 500) {
        throw new WeatherServiceError(
          `NWS API is temporarily unavailable (HTTP ${response.status})${suffix}`,
          "unavailable",
          response.status,
        );
      }
      throw new WeatherServiceError(`NWS API error (HTTP ${response.status})${suffix}`, "http", response.status);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new WeatherServiceError("NWS API returned a response that is not valid JSON", "invalid_response");
    }
    if (!isObject(body)) {
      throw new WeatherServiceError("NWS API returned an unexpected JSON shape", "invalid_response");
    }
    return body;
  }

  /** NWS errors are RFC 7807 problem+json; pull out the human-readable part if present. */
  private async readProblemDetail(response: Response): Promise<string | null> {
    try {
      const body: unknown = await response.json();
      if (isObject(body)) return strOrNull(body.detail) ?? strOrNull(body.title);
    } catch {
      /* body was not JSON; ignore */
    }
    return null;
  }
}
