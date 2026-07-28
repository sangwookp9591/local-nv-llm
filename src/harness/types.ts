export type ToolErrorType =
  | "PATH_NOT_FOUND"
  | "PATH_NOT_ALLOWED"
  | "PERMISSION_DENIED"
  | "COMMAND_NOT_FOUND"
  | "COMMAND_FAILED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "INVALID_ARGUMENT"
  | "USER_APPROVAL_REQUIRED"
  | "DUPLICATE_FAILURE"
  | "TRANSIENT_ERROR"
  | "UNKNOWN_ERROR";

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  errorType?: ToolErrorType;
  path?: string;
  executionMs?: number;
}

export interface ActionFingerprint {
  toolName: string;
  normalizedArgs: string;
  workingDirectory: string;
  hash: string;
}

export interface FailureRecord {
  fingerprint: string;
  errorType: ToolErrorType;
  attempts: number;
  lastFailedAt: number;
  isOpen: boolean;
}
