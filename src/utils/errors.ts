export interface SerializableError {
  name: string;
  message: string;
  phase?: string;
  code?: string;
  details?: Record<string, unknown>;
  cause?: SerializableError;
}

export type AppErrorPhase =
  | "cli"
  | "config"
  | "browser"
  | "resume"
  | "linkedin_auth"
  | "linkedin_easy_apply"
  | "external_apply"
  | "llm"
  | "database";

export class AppError extends Error {
  readonly phase: AppErrorPhase;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(input: {
    message: string;
    phase: AppErrorPhase;
    code: string;
    cause?: unknown;
    details?: Record<string, unknown>;
  }) {
    super(input.message, input.cause ? { cause: input.cause } : undefined);
    this.name = "AppError";
    this.phase = input.phase;
    this.code = input.code;
    this.details = input.details;
  }
}

function isErrorWithCause(value: unknown): value is Error & { cause?: unknown } {
  return value instanceof Error;
}

export function serializeError(error: unknown): SerializableError {
  if (isErrorWithCause(error)) {
    return {
      name: error.name,
      message: error.message,
      ...(error instanceof AppError
        ? {
            phase: error.phase,
            code: error.code,
            ...(error.details ? { details: error.details } : {}),
          }
        : {}),
      ...(error.cause ? { cause: serializeError(error.cause) } : {}),
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
  };
}

export function getErrorMessage(error: unknown): string {
  const serialized = serializeError(error);
  const prefix = serialized.phase ? `[${serialized.phase}] ` : "";
  return `${prefix}${serialized.message}`;
}

export function ensureAppError(
  error: unknown,
  fallback: {
    message: string;
    phase: AppErrorPhase;
    code: string;
    details?: Record<string, unknown>;
  },
): AppError {
  if (error instanceof AppError) {
    return error;
  }

  return new AppError({
    ...fallback,
    cause: error,
  });
}
