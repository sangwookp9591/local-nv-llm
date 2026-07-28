export class TokenBucket {
  private capacity: number;
  private rpm: number;
  private tokens: number;
  private lastRefillAt: number;
  private getTime: () => number;

  constructor(capacity: number, rpm: number, getTimeFunc = () => Date.now()) {
    this.capacity = capacity;
    this.rpm = rpm;
    this.tokens = capacity;
    this.getTime = getTimeFunc;
    this.lastRefillAt = this.getTime();
  }

  public updateRate(capacity: number, rpm: number): void {
    this.capacity = capacity;
    this.rpm = rpm;
    this.tokens = Math.min(this.tokens, capacity);
  }

  private refill(): void {
    const now = this.getTime();
    const elapsedMs = now - this.lastRefillAt;
    if (elapsedMs <= 0) return;

    const refillTokens = (elapsedMs * this.rpm) / 60_000;
    this.tokens = Math.min(this.capacity, this.tokens + refillTokens);
    this.lastRefillAt = now;
  }

  public getTokens(): number {
    this.refill();
    return this.tokens;
  }

  public tryConsume(tokens = 1): number {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return 0; // Success immediately
    }

    // Calculate required wait time in ms
    const missing = tokens - this.tokens;
    const refillMsPerToken = 60_000 / this.rpm;
    return Math.ceil(missing * refillMsPerToken);
  }
}
