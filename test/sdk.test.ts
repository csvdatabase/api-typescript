import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CSDBAPIError,
  CSDBClient,
  CSDBProtocolError,
  CSDBTimeoutError,
  CSDBTransportError,
  SQLError,
  ValidationError,
  configureCSDB,
  connectCSDB,
  openCSDB,
  parseSQL,
  saveCSDB,
  serializeCSDB,
  CSDBDatabase,
  TableQuery,
  type FetchLike
} from "../src/index.js";

test("client configuration, health, authentication, and path prefixes", async () => {
  const transport = createTransport(() => ({ status: "ok" }));
  const client = new CSDBClient({
    baseUrl: "https://example.test/csdb",
    apiKey: "secret",
    headers: { "X-Tenant": "acme" },
    fetch: transport.fetch
  });

  assert.deepEqual(await client.health(), { status: "ok" });
  assert.equal(transport.requests[0]?.url, "https://example.test/csdb/health");
  assert.equal(transport.requests[0]?.headers.get("authorization"), "Bearer secret");
  assert.equal(transport.requests[0]?.headers.get("x-tenant"), "acme");
});

test("openCSDB validates by default and can create a lazy database handle", async () => {
  const transport = createTransport((_request, body) => {
    assert.deepEqual(body, { database: "payroll", command: { kind: "validate" } });
    return { ok: true, result: { valid: true } };
  });
  const client = new CSDBClient({ baseUrl: "http://localhost:3000", fetch: transport.fetch });
  const opened = await client.openCSDB("payroll");
  assert.equal(opened.path, "payroll");
  assert.equal(opened.autoSave, true);
  assert.equal(transport.requests.length, 1);

  const lazy = client.database("payroll");
  assert.equal(lazy.database, "payroll");
  assert.equal(transport.requests.length, 1);
  assert.throws(() => {
    lazy.autoSave = false;
  }, /always persist/);
});

test("remote classes retain every remotely meaningful library method name", () => {
  const databaseMethods = Object.getOwnPropertyNames(CSDBDatabase.prototype);
  for (const method of [
    "table",
    "sql",
    "execute",
    "createTable",
    "dropTable",
    "validate",
    "toString",
    "saveSync"
  ]) {
    assert.ok(databaseMethods.includes(method), `missing CSDBDatabase.${method}`);
  }

  const tableMethods = Object.getOwnPropertyNames(TableQuery.prototype);
  for (const method of [
    "where",
    "select",
    "join",
    "orderBy",
    "limit",
    "all",
    "first",
    "insert",
    "update",
    "delete",
    "byPrimaryKey"
  ]) {
    assert.ok(tableMethods.includes(method), `missing TableQuery.${method}`);
  }
});

test("fluent API builds the same select plan as the TypeScript library", async () => {
  const transport = createTransport(() => ({
    ok: true,
    result: { rows: [{ id: "s_001", worker: { id: "w_001" } }] }
  }));
  const client = new CSDBClient({ baseUrl: "http://localhost:3000", fetch: transport.fetch });
  const rows = await client
    .database("payroll")
    .table("sessions")
    .where("worker_id", "=", "w_001")
    .where("end_time IS NULL")
    .join("worker")
    .select(["id", "worker"])
    .orderBy("id", "desc")
    .limit(5)
    .all();

  assert.deepEqual(rows, [{ id: "s_001", worker: { id: "w_001" } }]);
  assert.deepEqual(transport.requests[0]?.body, {
    database: "payroll",
    command: {
      kind: "select",
      table: "sessions",
      columns: ["id", "worker"],
      joins: [{ table: "worker", relationship: "worker" }],
      where: {
        type: "and",
        left: {
          type: "comparison",
          op: "=",
          left: { type: "identifier", name: "worker_id" },
          right: { type: "literal", value: "w_001" }
        },
        right: {
          type: "is-null",
          expr: { type: "identifier", name: "end_time" },
          not: false
        }
      },
      orderBy: [{ column: "id", direction: "desc" }],
      limit: 5,
      output: "objects"
    }
  });
});

test("database and table terminal methods map one-for-one to command kinds", async () => {
  const transport = createTransport((_request, body) => {
    const command = commandOf(body);
    switch (command.kind) {
      case "select":
        return { ok: true, result: { rows: [{ id: "w_001" }] } };
      case "insert":
      case "update":
      case "delete":
        return { ok: true, result: { rowsAffected: 1 } };
      case "create-table":
      case "drop-table":
        return { ok: true, result: { rowsAffected: 0 } };
      case "sql":
        return command.statement.startsWith("SELECT")
          ? { ok: true, result: { rows: [{ id: "w_001" }] } }
          : { ok: true, result: { rowsAffected: 1 } };
      case "by-primary-key":
        return { ok: true, result: { row: { id: "w_001" } } };
      case "validate":
        return { ok: true, result: { valid: true } };
      case "serialize":
        return { ok: true, result: { text: "--- csdb\n" } };
      default:
        throw new Error(`Unhandled test command ${String(command.kind)}`);
    }
  });
  const client = new CSDBClient({ baseUrl: "http://localhost:3000", fetch: transport.fetch });
  const db = client.database("payroll");

  assert.deepEqual(await db.table("workers").all(), [{ id: "w_001" }]);
  assert.deepEqual(await db.table("workers").first(), { id: "w_001" });
  assert.deepEqual(await db.table("workers").insert({ id: "w_002", amount: 9_007_199_254_740_993n }), {
    rowsAffected: 1
  });
  assert.deepEqual(await db.table("workers").where({ id: "w_002" }).update({ email: "new@example.com" }), {
    rowsAffected: 1
  });
  assert.deepEqual(await db.table("workers").where("id", "=", "w_002").delete(), { rowsAffected: 1 });
  assert.deepEqual(await db.table("workers").byPrimaryKey("w_001"), { id: "w_001" });
  assert.deepEqual(await db.sql("SELECT id FROM workers"), [{ id: "w_001" }]);
  assert.deepEqual(
    await db.execute({ kind: "select", table: "workers", columns: "*", joins: [], orderBy: [] }),
    [{ id: "w_001" }]
  );
  assert.deepEqual(await db.createTable({ name: "tags", columns: { label: "text" } }), { rowsAffected: 0 });
  assert.deepEqual(await db.dropTable("tags"), { rowsAffected: 0 });
  await db.validate();
  assert.equal(await db.toString({ machineIndexes: "omit" }), "--- csdb\n");

  const beforeSaveSync = transport.requests.length;
  db.saveSync();
  assert.equal(transport.requests.length, beforeSaveSync);

  const insertRequest = transport.requests.find((request) => commandOf(request.body).kind === "insert");
  assert.equal(commandOf(insertRequest?.body).rows?.[0]?.amount, "9007199254740993");
});

test("default connection helpers preserve open, save, and serialize names", async () => {
  const transport = createTransport((_request, body) => {
    const kind = commandOf(body).kind;
    if (kind === "serialize") return { ok: true, result: { text: "document" } };
    return { ok: true, result: { valid: true } };
  });
  const configured = configureCSDB({ baseUrl: "http://localhost:3000", fetch: transport.fetch });
  assert.equal(connectCSDB("payroll").client, configured);
  const db = await openCSDB("payroll");
  await saveCSDB(db);
  assert.equal(await serializeCSDB(db), "document");
});

test("server failures map to validation, SQL, and general API errors", async () => {
  for (const [code, constructor] of [
    ["VALIDATION_ERROR", ValidationError],
    ["SQL_ERROR", SQLError],
    ["NOT_FOUND", CSDBAPIError]
  ] as const) {
    const transport = createTransport(() => ({
      status: 422,
      body: {
        ok: false,
        error: { code, message: `${code} message` },
        requestId: "req_test"
      }
    }));
    const client = new CSDBClient({ baseUrl: "http://localhost:3000", fetch: transport.fetch });
    await assert.rejects(client.database("payroll").validate(), (error: unknown) => {
      assert.ok(error instanceof constructor);
      assert.equal(error.requestId, "req_test");
      assert.equal(error.remoteCode, code);
      return true;
    });
  }
});

test("invalid responses, timeouts, and caller aborts become transport errors", async () => {
  const invalid = new CSDBClient({
    baseUrl: "http://localhost:3000",
    fetch: async () => new Response("not json", { status: 200 })
  });
  await assert.rejects(invalid.health(), CSDBProtocolError);

  const ignoresAbort: FetchLike = async () => new Promise<Response>(() => undefined);
  const timed = new CSDBClient({ baseUrl: "http://localhost:3000", fetch: ignoresAbort, timeoutMs: 10 });
  await assert.rejects(timed.health(), CSDBTimeoutError);

  const hangingFetch: FetchLike = async (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    });
  const controller = new AbortController();
  const aborted = new CSDBClient({ baseUrl: "http://localhost:3000", fetch: hangingFetch });
  const pending = aborted.health({ signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, CSDBTransportError);
});

test("the timeout covers stalled response bodies", async () => {
  const stalledBody: FetchLike = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"status":"ok"'));
        }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  const client = new CSDBClient({
    baseUrl: "http://localhost:3000",
    fetch: stalledBody,
    timeoutMs: 20
  });

  await assert.rejects(client.health(), CSDBTimeoutError);
});

test("caller aborts do not depend on a cooperative transport", async () => {
  const ignoresAbort: FetchLike = async () => new Promise<Response>(() => undefined);
  const client = new CSDBClient({
    baseUrl: "http://localhost:3000",
    fetch: ignoresAbort,
    timeoutMs: 1_000
  });
  const controller = new AbortController();
  const pending = client.health({ signal: controller.signal });
  controller.abort("test abort");

  await assert.rejects(
    Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error("The request did not abort promptly.")), 100);
      })
    ]),
    (error: unknown) => error instanceof CSDBTransportError && error.code === "CSDB_TRANSPORT_ERROR"
  );
});

test("parseSQL matches the library query-plan shape", () => {
  assert.deepEqual(parseSQL("SELECT id FROM workers WHERE email = ? ORDER BY id DESC LIMIT 2", ["a@example.com"]), {
    kind: "select",
    table: "workers",
    columns: ["id"],
    joins: [],
    where: {
      type: "comparison",
      op: "=",
      left: { type: "identifier", name: "email" },
      right: { type: "literal", value: "a@example.com" }
    },
    orderBy: [{ column: "id", direction: "desc" }],
    limit: 2,
    output: "flat"
  });
});

interface CapturedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
}

type Responder = (request: CapturedRequest, body: unknown) => unknown;

function createTransport(responder: Responder): { fetch: FetchLike; requests: CapturedRequest[] } {
  const requests: CapturedRequest[] = [];
  const fetch: FetchLike = async (input, init = {}) => {
    const body = typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    const request: CapturedRequest = {
      url: String(input),
      method: init.method ?? "GET",
      headers: new Headers(init.headers),
      body
    };
    requests.push(request);
    const response = responder(request, body);
    if (isRecord(response) && typeof response.status === "number" && "body" in response) {
      return new Response(JSON.stringify(response.body), {
        status: response.status,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  return { fetch, requests };
}

function commandOf(value: unknown): Record<string, any> {
  if (!isRecord(value) || !isRecord(value.command)) throw new Error("Expected a command envelope.");
  return value.command;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
