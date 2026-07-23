# TypeScript API SDK Plan

## Goal

Provide an idiomatic TypeScript client that mirrors the remotely meaningful
`@csvdatabase/csdb` API one-for-one, converts calls into the documented JSON
command envelope, and sends them to the CSDB TypeScript server.

## Mapping

| Library API | SDK API | JSON command |
| --- | --- | --- |
| `db.table(name)` | same | builds a command locally |
| `where`, `select`, `join`, `orderBy`, `limit` | same | modifies a `SelectPlan` |
| `all`, `first` | async | `select` |
| `insert`, `update`, `delete` | async | matching mutation kind |
| `byPrimaryKey` | async | `by-primary-key` |
| `db.sql` | async | `sql` |
| `db.execute` | async | matching `QueryPlan` |
| `db.createTable`, `db.dropTable` | async | matching DDL kind |
| `db.validate` | async | `validate` |
| `db.toString` | async | `serialize` |
| `db.saveSync` | no-op | server mutations already persist atomically |

## Remote Extensions

- `CSDBClient` connection configuration
- `configureCSDB` default-client setup
- `client.health()`
- `client.send()` raw typed commands
- bearer authentication
- custom Fetch transport and headers
- timeouts and caller abort signals
- HTTP, protocol, transport, and timeout error metadata

## Compatibility Boundary

Network terminal operations necessarily return `Promise` values. Local document
internals, arbitrary CSDB text parsing, executor access, and path-based file writes
cannot cross the existing server contract and are not emulated.

## Acceptance Criteria

- Every remotely meaningful database and table method retains its original name
  and argument shape.
- Fluent calls produce the exact documented server JSON.
- SQL, query plans, table mutations, DDL, validation, serialization, and primary
  keys decode their expected result shape.
- Bigints are losslessly converted before JSON serialization.
- Server errors map into stable SDK error classes with request IDs.
- Timeouts, aborts, custom transports, API keys, and path-prefixed base URLs work.
- Unit tests, declaration generation, package contents, and a live server test pass.
