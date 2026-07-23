import { CSDBClient, type CSDBClientOptions, type OpenRemoteCSDBOptions } from "./client.js";
import { CSDBDatabase } from "./database.js";
import { CSDBTransportError } from "./errors.js";

export { CSDBClient } from "./client.js";
export type {
  CSDBClientOptions,
  FetchLike,
  HealthResult,
  OpenRemoteCSDBOptions,
  RequestOptions
} from "./client.js";
export { CSDBDatabase } from "./database.js";
export { TableQuery } from "./table.js";
export { parseSQL } from "./sql.js";
export {
  CSDBAPIError,
  CSDBError,
  CSDBProtocolError,
  CSDBTimeoutError,
  CSDBTransportError,
  SQLError,
  ValidationError
} from "./errors.js";
export type { ErrorMetadata } from "./errors.js";
export type {
  ByPrimaryKeyCommand,
  ColumnType,
  CommandResult,
  ComparisonOp,
  ComputedField,
  Constraint,
  CreateTablePlan,
  CSDBDocument,
  CSDBMetadata,
  DeletePlan,
  DropTablePlan,
  Expr,
  ForeignKey,
  InsertPlan,
  JoinPlan,
  MachineIndexingOptions,
  MachineSection,
  MutationResult,
  NormalizedTableSchema,
  OrderBy,
  PrimaryKey,
  Primitive,
  QueryPlan,
  ReferentialAction,
  Row,
  RowValue,
  SchemaIndex,
  SelectPlan,
  SerializeCommand,
  SerializeOptions,
  ServerCommand,
  SQLResult,
  SqlCommand,
  Table,
  TableSchema,
  UpdatePlan,
  ValidateCommand
} from "./types.js";

export interface OpenCSDBOptions extends OpenRemoteCSDBOptions {
  client?: CSDBClient;
}

let defaultClient: CSDBClient | undefined;

export function configureCSDB(options: CSDBClientOptions): CSDBClient {
  defaultClient = new CSDBClient(options);
  return defaultClient;
}

export function getDefaultCSDBClient(): CSDBClient {
  if (!defaultClient) {
    throw new CSDBTransportError(
      "No default CSDB client is configured. Call configureCSDB or pass OpenCSDBOptions.client."
    );
  }
  return defaultClient;
}

export function connectCSDB(database: string, client: CSDBClient = getDefaultCSDBClient()): CSDBDatabase {
  return client.database(database);
}

export async function openCSDB(database: string, options: OpenCSDBOptions = {}): Promise<CSDBDatabase> {
  const client = options.client ?? getDefaultCSDBClient();
  return client.openCSDB(database, options);
}

export async function saveCSDB(database: CSDBDatabase, options: OpenRemoteCSDBOptions = {}): Promise<void> {
  await database.save(options);
}

export function serializeCSDB(database: CSDBDatabase): Promise<string> {
  return database.toString();
}
