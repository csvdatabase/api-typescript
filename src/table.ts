import type { RequestOptions } from "./client.js";
import type { CSDBDatabase } from "./database.js";
import { mutationResult, resultError, rowsResult } from "./database.js";
import { andExpr, comparison, parseExpression } from "./expression.js";
import type {
  ComparisonOp,
  Expr,
  InsertPlan,
  MutationResult,
  OrderBy,
  Row,
  RowValue,
  SelectPlan
} from "./types.js";

export class TableQuery {
  private predicate?: Expr;
  private joins: SelectPlan["joins"] = [];
  private ordering: OrderBy[] = [];
  private maxRows?: number;
  private projection: string[] | "*" = "*";

  constructor(private readonly db: CSDBDatabase, private readonly tableName: string) {}

  where(column: string, op: ComparisonOp, value: RowValue): TableQuery;
  where(match: Row): TableQuery;
  where(expression: string): TableQuery;
  where(columnOrMatch: string | Row, op?: ComparisonOp, value?: RowValue): TableQuery {
    if (typeof columnOrMatch === "string" && op) {
      this.predicate = andExpr(this.predicate, comparison(columnOrMatch, op, value ?? null));
    } else if (typeof columnOrMatch === "string") {
      this.predicate = andExpr(this.predicate, parseExpression(columnOrMatch));
    } else {
      for (const [column, expected] of Object.entries(columnOrMatch)) {
        this.predicate = andExpr(this.predicate, comparison(column, "=", expected));
      }
    }
    return this;
  }

  select(columns: string[] | "*"): TableQuery {
    this.projection = columns;
    return this;
  }

  join(relationship: string): TableQuery {
    this.joins.push({ table: relationship, relationship });
    return this;
  }

  orderBy(column: string, direction: "asc" | "desc" = "asc"): TableQuery {
    this.ordering.push({ column, direction });
    return this;
  }

  limit(count: number): TableQuery {
    this.maxRows = count;
    return this;
  }

  async all(options: RequestOptions = {}): Promise<Row[]> {
    const result = await this.db.client.send(this.db.database, this.selectPlan(), options);
    return rowsResult(result, "TableQuery.all");
  }

  async first(options: RequestOptions = {}): Promise<Row | undefined> {
    return (await this.limit(1).all(options))[0];
  }

  async insert(row: Row | Row[], options: RequestOptions = {}): Promise<MutationResult> {
    const rows = Array.isArray(row) ? row : [row];
    const command = { kind: "insert", table: this.tableName, rows } satisfies InsertPlan;
    const result = await this.db.client.send(this.db.database, command, options);
    return mutationResult(result, "TableQuery.insert");
  }

  async update(values: Row, options: RequestOptions = {}): Promise<MutationResult> {
    const result = await this.db.client.send(
      this.db.database,
      {
        kind: "update",
        table: this.tableName,
        set: values,
        ...(this.predicate ? { where: this.predicate } : {})
      },
      options
    );
    return mutationResult(result, "TableQuery.update");
  }

  async delete(options: RequestOptions = {}): Promise<MutationResult> {
    const result = await this.db.client.send(
      this.db.database,
      {
        kind: "delete",
        table: this.tableName,
        ...(this.predicate ? { where: this.predicate } : {})
      },
      options
    );
    return mutationResult(result, "TableQuery.delete");
  }

  async byPrimaryKey(value: RowValue | RowValue[], options: RequestOptions = {}): Promise<Row | undefined> {
    const result = await this.db.client.send(
      this.db.database,
      { kind: "by-primary-key", table: this.tableName, key: value },
      options
    );
    if (!("row" in result)) throw resultError("TableQuery.byPrimaryKey");
    return result.row ?? undefined;
  }

  private selectPlan(): SelectPlan {
    return {
      kind: "select",
      table: this.tableName,
      columns: this.projection,
      joins: this.joins,
      ...(this.predicate ? { where: this.predicate } : {}),
      orderBy: this.ordering,
      ...(this.maxRows !== undefined ? { limit: this.maxRows } : {}),
      output: "objects"
    };
  }
}
