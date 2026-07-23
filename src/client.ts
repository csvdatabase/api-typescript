import { CSDBDatabase } from "./database.js";
import {
  CSDBAPIError,
  CSDBError,
  CSDBProtocolError,
  CSDBTimeoutError,
  CSDBTransportError,
  SQLError,
  ValidationError
} from "./errors.js";
import type { CommandResult, ServerCommand } from "./types.js";
import { toWireValue } from "./wire.js";

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface CSDBClientOptions {
  baseUrl: string;
  apiKey?: string | undefined;
  timeoutMs?: number | undefined;
  headers?: HeadersInit | undefined;
  fetch?: FetchLike | undefined;
}

export interface RequestOptions {
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
}

export interface OpenRemoteCSDBOptions extends RequestOptions {
  validate?: boolean | undefined;
}

export interface HealthResult {
  status: "ok";
}

const DATABASE_NAME = /^[A-Za-z0-9_$-][A-Za-z0-9._$-]{0,127}$/;

export class CSDBClient {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  private readonly apiKey: string | undefined;
  private readonly defaultHeaders: Headers;
  private readonly fetchImplementation: FetchLike;

  constructor(options: CSDBClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.timeoutMs = timeoutValue(options.timeoutMs ?? 30_000, "timeoutMs");
    this.apiKey = options.apiKey?.trim() || undefined;
    this.defaultHeaders = new Headers(options.headers);
    const fetchImplementation = options.fetch ?? globalThis.fetch?.bind(globalThis);
    if (!fetchImplementation) {
      throw new CSDBTransportError("No Fetch implementation is available. Supply CSDBClientOptions.fetch.");
    }
    this.fetchImplementation = fetchImplementation;
  }

  database(name: string): CSDBDatabase {
    assertDatabaseName(name);
    return new CSDBDatabase(this, name);
  }

  async openCSDB(name: string, options: OpenRemoteCSDBOptions = {}): Promise<CSDBDatabase> {
    const database = this.database(name);
    if (options.validate !== false) await database.validate(options);
    return database;
  }

  async health(options: RequestOptions = {}): Promise<HealthResult> {
    const payload = await this.request("health", { method: "GET" }, options);
    if (!isObject(payload) || payload.status !== "ok") {
      throw new CSDBProtocolError("Health response does not contain status \"ok\".");
    }
    return { status: "ok" };
  }

  async send<TResult extends CommandResult = CommandResult>(
    database: string,
    command: ServerCommand,
    options: RequestOptions = {}
  ): Promise<TResult> {
    assertDatabaseName(database);
    const payload = await this.request(
      "v1/commands",
      {
        method: "POST",
        body: JSON.stringify(toWireValue({ database, command }))
      },
      options
    );
    if (!isObject(payload) || payload.ok !== true || !isObject(payload.result)) {
      throw new CSDBProtocolError("Command response does not contain a valid result object.");
    }
    return payload.result as TResult;
  }

  private async request(path: string, init: RequestInit, options: RequestOptions): Promise<unknown> {
    const timeoutMs = timeoutValue(options.timeoutMs ?? this.timeoutMs, "request timeoutMs");
    const controller = new AbortController();
    let rejectCancellation = (_error: CSDBError): void => undefined;
    const cancellation = new Promise<never>((_resolve, reject) => {
      rejectCancellation = reject;
    });
    const abortFromCaller = (): void => {
      const error = new CSDBTransportError("CSDB request was aborted.", options.signal?.reason);
      rejectCancellation(error);
      controller.abort(options.signal?.reason);
    };
    if (options.signal?.aborted) abortFromCaller();
    else options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => {
      const error = new CSDBTimeoutError(timeoutMs);
      rejectCancellation(error);
      controller.abort(error);
    }, timeoutMs);

    const headers = new Headers(this.defaultHeaders);
    headers.set("Accept", "application/json");
    if (init.body !== undefined) headers.set("Content-Type", "application/json");
    if (this.apiKey) headers.set("Authorization", `Bearer ${this.apiKey}`);

    try {
      const operation = (async (): Promise<unknown> => {
        const response = await this.fetchImplementation(this.endpoint(path), {
          ...init,
          headers,
          signal: controller.signal
        });
        const payload = await parseResponseBody(response);
        if (!response.ok || (isObject(payload) && payload.ok === false)) {
          throw remoteError(response, payload);
        }
        return payload;
      })();
      return await Promise.race([operation, cancellation]);
    } catch (error) {
      if (error instanceof CSDBError) throw error;
      if (options.signal?.aborted) throw new CSDBTransportError("CSDB request was aborted.", error);
      throw new CSDBTransportError("Unable to reach the CSDB server.", error);
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  private endpoint(path: string): string {
    return new URL(path.replace(/^\/+/, ""), this.baseUrl).toString();
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === "") {
    throw new CSDBProtocolError(`CSDB server returned an empty response with status ${response.status}.`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new CSDBProtocolError(
      `CSDB server returned invalid JSON with status ${response.status}.`,
      error
    );
  }
}

function remoteError(response: Response, payload: unknown): CSDBError {
  const body = isObject(payload) ? payload : {};
  const error = isObject(body.error) ? body.error : {};
  const code = typeof error.code === "string" ? error.code : "HTTP_ERROR";
  const message =
    typeof error.message === "string" ? error.message : `CSDB server returned HTTP ${response.status}.`;
  const requestId =
    typeof body.requestId === "string" ? body.requestId : response.headers.get("x-request-id") ?? undefined;
  const metadata = {
    status: response.status,
    remoteCode: code,
    ...(requestId ? { requestId } : {})
  };
  if (code === "VALIDATION_ERROR") return new ValidationError(message, metadata);
  if (code === "SQL_ERROR") return new SQLError(message, metadata);
  return new CSDBAPIError(message, code, response.status, requestId);
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new CSDBTransportError("baseUrl must be an absolute HTTP or HTTPS URL.", error);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CSDBTransportError("baseUrl must use HTTP or HTTPS.");
  }
  if (url.username || url.password) throw new CSDBTransportError("baseUrl must not contain credentials.");
  if (url.search || url.hash) throw new CSDBTransportError("baseUrl must not contain a query string or hash.");
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.toString();
}

function assertDatabaseName(name: string): void {
  if (!DATABASE_NAME.test(name)) {
    throw new CSDBProtocolError(
      "Database name must be 1-128 characters using letters, numbers, _, $, ., or - and cannot start with a dot."
    );
  }
}

function timeoutValue(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 300_000) {
    throw new CSDBTransportError(`${label} must be an integer between 1 and 300000.`);
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
