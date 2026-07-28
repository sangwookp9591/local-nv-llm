export class NvidiaApiError extends Error {
  public statusCode?: number;
  public code?: string;

  constructor(message: string, statusCode?: number, code?: string) {
    super(message);
    this.name = "NvidiaApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function normalizeNvidiaError(error: unknown): NvidiaApiError {
  if (error instanceof NvidiaApiError) return error;

  if (error && typeof error === "object" && "message" in error) {
    const errObj = error as { message: string; status?: number; code?: string };
    const msg = String(errObj.message);

    if (msg.includes("401") || msg.includes("Unauthorized") || msg.includes("Unauthenticated")) {
      return new NvidiaApiError("NVIDIA API Key가 유효하지 않거나 인증에 실패했습니다.", 401, "UNAUTHORIZED");
    }
    if (msg.includes("429") || msg.includes("Rate limit")) {
      return new NvidiaApiError("API 요청 한도(Rate Limit)를 초과했습니다. 잠시 후 다시 시도해주세요.", 429, "RATE_LIMIT");
    }
    if (msg.includes("404") || msg.includes("not found")) {
      return new NvidiaApiError("요청한 모델을 찾을 수 없거나 접근 권한이 없습니다.", 404, "NOT_FOUND");
    }

    return new NvidiaApiError(msg, errObj.status, errObj.code);
  }

  return new NvidiaApiError(String(error) || "알 수 없는 NVIDIA API 오류가 발생했습니다.");
}
