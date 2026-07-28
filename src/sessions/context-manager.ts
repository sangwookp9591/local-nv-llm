import { ChatMessage } from "../providers/provider.js";
import { SessionData } from "./session-store.js";

export class ContextManager {
  private session: SessionData;

  constructor(session: SessionData) {
    this.session = session;
  }

  public getSession(): SessionData {
    return this.session;
  }

  public addMessage(message: ChatMessage): void {
    this.session.messages.push(message);
  }

  public getMessages(): ChatMessage[] {
    return this.session.messages;
  }

  public clearMessages(): void {
    this.session.messages = [];
    this.session.compactSummary = undefined;
  }

  public compact(summaryText: string): void {
    this.session.compactSummary = summaryText;
  }

  public getEffectiveMessages(systemPrompt?: string): ChatMessage[] {
    const effective: ChatMessage[] = [];

    if (systemPrompt) {
      effective.push({ role: "system", content: systemPrompt });
    }

    if (this.session.compactSummary) {
      effective.push({
        role: "system",
        content: `[이전 대화 요약]:\n${this.session.compactSummary}`,
      });
      // Compact 이후 최근 N개 메시지 유지 (최근 6개)
      const recent = this.session.messages.slice(-6);
      effective.push(...recent);
    } else {
      effective.push(...this.session.messages);
    }

    return effective;
  }
}
