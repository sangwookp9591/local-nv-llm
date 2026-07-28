export interface AdaptiveControllerOptions {
  initialConcurrency?: number;
  maxConcurrency?: number;
  reduceFactor?: number;
  additiveIncrease?: number;
  successWindow?: number;
  defaultCooldownMs?: number;
}

export class AdaptiveController {
  private currentConcurrency: number;
  private maxConcurrency: number;
  private reduceFactor: number;
  private additiveIncrease: number;
  private successWindow: number;
  private defaultCooldownMs: number;

  private consecutiveSuccesses = 0;
  private total429Count = 0;
  private inCascade = false;
  private cascadeStartedAt = 0;
  private observedCeiling?: number;
  private ceilingObservedAt = 0;
  private ceilingTtlMs = 30 * 60_000; // 30 mins TTL

  constructor(options?: AdaptiveControllerOptions) {
    this.currentConcurrency = options?.initialConcurrency ?? 1;
    this.maxConcurrency = options?.maxConcurrency ?? 2;
    this.reduceFactor = options?.reduceFactor ?? 0.75;
    this.additiveIncrease = options?.additiveIncrease ?? 1;
    this.successWindow = options?.successWindow ?? 25;
    this.defaultCooldownMs = options?.defaultCooldownMs ?? 2000;
  }

  public getConcurrency(): number {
    return this.currentConcurrency;
  }

  public setConcurrency(val: number): void {
    this.currentConcurrency = Math.max(1, Math.min(this.maxConcurrency, val));
  }

  public get429Count(): number {
    return this.total429Count;
  }

  public getObservedCeiling(): number | undefined {
    if (this.observedCeiling && Date.now() - this.ceilingObservedAt > this.ceilingTtlMs) {
      this.observedCeiling = undefined; // Expired
    }
    return this.observedCeiling;
  }

  public recordSuccess(): void {
    this.inCascade = false;
    this.consecutiveSuccesses++;

    if (this.consecutiveSuccesses >= this.successWindow) {
      this.consecutiveSuccesses = 0;
      let effectiveMax = this.maxConcurrency;

      const ceiling = this.getObservedCeiling();
      if (ceiling !== undefined) {
        effectiveMax = Math.min(this.maxConcurrency, Math.ceil(ceiling * 1.1));
      }

      this.currentConcurrency = Math.min(
        effectiveMax,
        this.currentConcurrency + this.additiveIncrease
      );
    }
  }

  public record429(): void {
    this.total429Count++;
    this.consecutiveSuccesses = 0;

    // Record ceiling
    this.observedCeiling = this.currentConcurrency;
    this.ceilingObservedAt = Date.now();

    // Cascade Dampening: Only reduce once per cascade burst
    if (!this.inCascade) {
      this.inCascade = true;
      this.cascadeStartedAt = Date.now();
      this.currentConcurrency = Math.max(
        1,
        Math.floor(this.currentConcurrency * this.reduceFactor)
      );
    }
  }

  public reset(): void {
    this.currentConcurrency = 1;
    this.consecutiveSuccesses = 0;
    this.total429Count = 0;
    this.inCascade = false;
    this.observedCeiling = undefined;
  }
}
