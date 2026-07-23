# CSDB TypeScript SDK

> **Start here:** Project-wide information, planning, and community resources
> live in the [main CSDB repository](https://github.com/csvdatabase/csdb).

## Introduction

This repository contains the TypeScript client for the CSDB JSON server. It
mirrors the native library API, converts operations into JSON commands, and sends
them over HTTP.

The package name is `@csvdatabase/api-typescript`.

## Use

```bash
npm install @csvdatabase/api-typescript
```

```ts
import { CSDBClient } from "@csvdatabase/api-typescript";

const client = new CSDBClient({
  baseUrl: process.env.CSDB_URL ?? "http://127.0.0.1:3000",
  apiKey: process.env.CSDB_API_KEY,
  timeoutMs: 30_000
});
const db = await client.openCSDB("payroll");
const workers = await db.table("workers").all();
```

Use HTTPS whenever the server is reached over a network, and keep API keys in
trusted server-side code. Requests are not retried automatically, so mutations
will never be repeated without your application deciding to do so.

Update to the latest release with:

```bash
npm install @csvdatabase/api-typescript@latest
```

## Development

The SDK requires Node.js 20.12 or newer and has no runtime dependencies.

```bash
npm ci
npm run check
```

Set `CSDB_TEST_SERVER_URL` and run `npm run test:live` to test against a running
CSDB server. See the [release process](https://github.com/csvdatabase/api-typescript/blob/main/RELEASING.md)
and [security policy](https://github.com/csvdatabase/api-typescript/blob/main/SECURITY.md)
for maintainer procedures.
