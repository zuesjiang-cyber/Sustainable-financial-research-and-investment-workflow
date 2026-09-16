import crypto from "node:crypto";
import type { UsageRecord } from "../../shared/v2Domain";
import type { V2Store } from "./v2Store";

const CNY_PER_1K_INPUT = 0.012;
const CNY_PER_1K_OUTPUT = 0.048;
const SEARCH_CNY = 0.08;

export function estimateModelCny(inputTokens: number, outputTokens: number): number {
  return Number(((inputTokens / 1000) * CNY_PER_1K_INPUT + (outputTokens / 1000) * CNY_PER_1K_OUTPUT).toFixed(4));
}

export class BudgetGuard {
  constructor(private readonly store: V2Store) {}

  async canStartPaidTask(estimateCny: number): Promise<{ ok: boolean; reason?: string; settings?: Awaited<ReturnType<V2Store["getSettings"]>> }> {
    const settings = await this.store.getSettings();
    const used = settings.spentCny + settings.reservedCny + estimateCny;
    if (used > settings.monthlyBudgetCny) {
      return { ok: false, reason: "本月研究预算已用尽，已暂停新的收费任务。历史查看和输入保存仍可用。", settings };
    }
    return { ok: true, settings };
  }

  async reserve(kind: UsageRecord["kind"], estimateCny: number, runId: string | null, model: string | null): Promise<UsageRecord> {
    const record: UsageRecord = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      kind,
      model,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      estimatedCny: estimateCny,
      runId,
      reserved: true,
      settled: false,
    };
    await this.store.addUsage(record);
    return record;
  }

  async settle(record: UsageRecord, actual: Partial<UsageRecord>): Promise<void> {
    const settled: UsageRecord = {
      ...record,
      ...actual,
      reserved: false,
      settled: true,
      at: new Date().toISOString(),
    };
    await this.store.addUsage(settled);
  }

  searchCost(): number {
    return SEARCH_CNY;
  }
}
