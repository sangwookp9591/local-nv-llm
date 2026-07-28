import { describe, it, expect } from "vitest";
import { detectLocalIntent } from "./local-intent-router.js";

describe("LocalIntentRouter", () => {
  it("detects LIST_MODELS intent correctly", () => {
    expect(detectLocalIntent("어떤 모델이 있지?")).toBe("LIST_MODELS");
    expect(detectLocalIntent("모델 뭐 있어?")).toBe("LIST_MODELS");
    expect(detectLocalIntent("사용 가능한 모델 알려줘")).toBe("LIST_MODELS");
    expect(detectLocalIntent("what models are available?")).toBe("LIST_MODELS");
    expect(detectLocalIntent("list models")).toBe("LIST_MODELS");
  });

  it("detects CURRENT_MODEL intent correctly", () => {
    expect(detectLocalIntent("너 무슨 모델이야?")).toBe("CURRENT_MODEL");
    expect(detectLocalIntent("지금 어떤 모델이야?")).toBe("CURRENT_MODEL");
    expect(detectLocalIntent("현재 모델이 뭐야?")).toBe("CURRENT_MODEL");
    expect(detectLocalIntent("what model are you?")).toBe("CURRENT_MODEL");
  });

  it("detects CURRENT_STATUS intent correctly", () => {
    expect(detectLocalIntent("현재 상태 알려줘")).toBe("CURRENT_STATUS");
    expect(detectLocalIntent("연결 상태")).toBe("CURRENT_STATUS");
    expect(detectLocalIntent("status")).toBe("CURRENT_STATUS");
  });

  it("returns null for normal queries that should go to LLM", () => {
    expect(detectLocalIntent("Spring Boot 대량 엑셀 처리 방법 알려줘")).toBeNull();
    expect(detectLocalIntent("이 모델의 장단점을 설명해줘")).toBeNull();
  });
});
