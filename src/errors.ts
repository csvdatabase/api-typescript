export interface ErrorMetadata {
  status?: number;
  remoteCode?: string;
  requestId?: string;
  cause?: unknown;
}

export class CSDBError extends Error {
  readonly status: number | undefined;
  readonly remoteCode: string | undefined;
  readonly requestId: string | undefined;

  constructor(message: string, readonly code = "CSDB_ERROR", metadata: ErrorMetadata = {}) {
    super(message, metadata.cause !== undefined ? { cause: metadata.cause } : undefined);
    this.name = "CSDBError";
    this.status = metadata.status;
    this.remoteCode = metadata.remoteCode;
    this.requestId = metadata.requestId;
  }
}

export class ValidationError extends CSDBError {
  constructor(message: string, metadata: ErrorMetadata = {}) {
    super(message, "CSDB_VALIDATION_ERROR", metadata);
    this.name = "ValidationError";
  }
}

export class SQLError extends CSDBError {
  constructor(message: string, metadata: ErrorMetadata = {}) {
    super(message, "CSDB_SQL_ERROR", metadata);
    this.name = "SQLError";
  }
}

export class CSDBAPIError extends CSDBError {
  constructor(message: string, remoteCode: string, status: number, requestId?: string) {
    super(message, remoteCode, {
      status,
      remoteCode,
      ...(requestId ? { requestId } : {})
    });
    this.name = "CSDBAPIError";
  }
}

export class CSDBTransportError extends CSDBError {
  constructor(message: string, cause?: unknown, code = "CSDB_TRANSPORT_ERROR") {
    super(message, code, cause !== undefined ? { cause } : {});
    this.name = "CSDBTransportError";
  }
}

export class CSDBProtocolError extends CSDBTransportError {
  constructor(message: string, cause?: unknown) {
    super(message, cause, "CSDB_PROTOCOL_ERROR");
    this.name = "CSDBProtocolError";
  }
}

export class CSDBTimeoutError extends CSDBTransportError {
  constructor(readonly timeoutMs: number, cause?: unknown) {
    super(`CSDB request timed out after ${timeoutMs}ms.`, cause, "CSDB_TIMEOUT_ERROR");
    this.name = "CSDBTimeoutError";
  }
}
