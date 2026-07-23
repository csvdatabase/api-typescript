import type { CSDBClient, OpenRemoteCSDBOptions, RequestOptions } from "./client.js";
import { CSDBProtocolError } from "./errors.js";
import { TableQuery } from "./table.js";
import type {
  CommandResult,
  MutationResult,
  QueryPlan,
  Row,
  RowValue,
  SQLResult,
  SerializeOptions,
  TableSchema
} from "./types.js";

export class CSDBDatabase {
  readonly path: string;

  constructor(readonly client: CSDBClient, readonly database: string) {
    this.path = database;
  }

  get autoSave(): boolean {
    return true;
  }

  set autoSave(value: boolean) {
    if (!value) {
      throw new CSDBProtocolError("Remote CSDB databases always persist successful mutations.");
    }
  }

  table(name: string): TableQuery {
    return new TableQuery(this, name);
  }

  async sql(statement: string, params: RowValue[] = [], options: RequestOptions = {}): Promise<SQLResult> {
    const result = await this.client.send(this.database, { kind: "sql", statement, params }, options);
    return sqlResult(result, "sql");
  }

  async execute(plan: QueryPlan, options: RequestOptions = {}): Promise<Row[] | MutationResult> {
    const result = await this.client.send(this.database, plan, options);
    return plan.kind === "select" ? rowsResult(result, "execute") : mutationResult(result, "execute");
  }

  async createTable(schema: TableSchema, options: RequestOptions = {}): Promise<MutationResult> {
    const result = await this.client.send(this.database, { kind: "create-table", schema }, options);
    return mutationResult(result, "createTable");
  }

  async dropTable(name: string, options: RequestOptions = {}): Promise<MutationResult> {
    const result = await this.client.send(this.database, { kind: "drop-table", table: name }, options);
    return mutationResult(result, "dropTable");
  }

  async validate(options: RequestOptions = {}): Promise<void> {
    const result = await this.client.send(this.database, { kind: "validate" }, options);
    if (!("valid" in result) || result.valid !== true) {
      throw resultError("validate");
    }
  }

  async toString(options?: SerializeOptions, requestOptions: RequestOptions = {}): Promise<string> {
    const command = options ? { kind: "serialize" as const, options } : { kind: "serialize" as const };
    const result = await this.client.send(this.database, command, requestOptions);
    if (!("text" in result) || typeof result.text !== "string") throw resultError("toString");
    return result.text;
  }

  saveSync(): void {
    // Successful server mutations are persisted before their promises resolve.
  }

  async save(options: OpenRemoteCSDBOptions = {}): Promise<void> {
    await this.validate(options);
  }
}

export function rowsResult(result: CommandResult, operation: string): Row[] {
  if (!("rows" in result) || !Array.isArray(result.rows)) throw resultError(operation);
  return result.rows;
}

export function mutationResult(result: CommandResult, operation: string): MutationResult {
  if (!("rowsAffected" in result) || typeof result.rowsAffected !== "number") {
    throw resultError(operation);
  }
  return { rowsAffected: result.rowsAffected };
}

function sqlResult(result: CommandResult, operation: string): SQLResult {
  if ("rows" in result && Array.isArray(result.rows)) return result.rows;
  return mutationResult(result, operation);
}

export function resultError(operation: string): CSDBProtocolError {
  return new CSDBProtocolError(`CSDB server returned an unexpected result for ${operation}.`);
}
