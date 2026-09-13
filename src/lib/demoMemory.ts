import { DEMO_RESEARCH, type DemoResearchStatus } from "../data/demoResearch";

export interface DemoJudgment {
  id: string;
  status: DemoResearchStatus;
  note: string;
  question: string;
}
export interface DemoVersion {
  version: number;
  confirmedAt: string;
  items: DemoJudgment[];
}
export const DEMO_MEMORY_KEY = "fintrust:interactive-demo:v1";
export function initialDemoVersion(): DemoVersion {
  return {
    version: 0,
    confirmedAt: "初始研究基线",
    items: DEMO_RESEARCH.items.map((item) => ({
      id: item.id,
      status: "UNRESOLVED",
      note: "",
      question: item.nextQuestion,
    })),
  };
}
export function demoDraft(previous: DemoVersion): DemoJudgment[] {
  return previous.items.map((item) => ({
    ...item,
    status:
      previous.version === 0
        ? DEMO_RESEARCH.items.find((source) => source.id === item.id)!.status
        : item.status,
  }));
}
export function confirmDemo(
  history: DemoVersion[],
  items: DemoJudgment[],
  date = new Date().toISOString(),
): DemoVersion[] {
  if (
    items.length !== DEMO_RESEARCH.items.length ||
    new Set(items.map((item) => item.id)).size !== items.length
  )
    throw new Error("请保留全部跟踪观点");
  return [
    ...history,
    {
      version: history.length,
      confirmedAt: date,
      items: items.map((item) => ({ ...item })),
    },
  ];
}
export function restoreDemo(raw: string | null): DemoVersion[] {
  try {
    const value = JSON.parse(raw || "null");
    const statuses = [
      "SUPPORTED",
      "PARTIALLY_SUPPORTED",
      "WEAKENED",
      "UNRESOLVED",
    ];
    if (!Array.isArray(value) || !value.length || value.length > 100)
      return [initialDemoVersion()];
    if (
      !value.every(
        (v, index) =>
          v.version === index &&
          typeof v.confirmedAt === "string" &&
          Array.isArray(v.items) &&
          v.items.length === 6 &&
          new Set(v.items.map((i) => i.id)).size === 6 &&
          v.items.every(
            (i) =>
              DEMO_RESEARCH.items.some((source) => source.id === i.id) &&
              statuses.includes(i.status) &&
              typeof i.note === "string" &&
              typeof i.question === "string",
          ),
      )
    )
      return [initialDemoVersion()];
    return value;
  } catch {
    return [initialDemoVersion()];
  }
}
