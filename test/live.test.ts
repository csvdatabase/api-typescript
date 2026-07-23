import assert from "node:assert/strict";
import { test } from "node:test";
import { CSDBClient } from "../src/index.js";

const serverUrl = process.env.CSDB_TEST_SERVER_URL;
const database = process.env.CSDB_TEST_DATABASE ?? "payroll";

test(
  "SDK talks to a live CSDB TypeScript server",
  { skip: serverUrl ? false : "Set CSDB_TEST_SERVER_URL to run the live integration test." },
  async () => {
    const client = new CSDBClient({
      baseUrl: serverUrl!,
      ...(process.env.CSDB_TEST_API_KEY ? { apiKey: process.env.CSDB_TEST_API_KEY } : {})
    });
    assert.deepEqual(await client.health(), { status: "ok" });
    const db = await client.openCSDB(database);
    const workers = await db.table("workers").select(["id", "email"]).orderBy("id").all();
    assert.deepEqual(workers, [
      { id: "w_001", email: "ada@example.com" },
      { id: "w_002", email: "grace@example.com" }
    ]);
  }
);
