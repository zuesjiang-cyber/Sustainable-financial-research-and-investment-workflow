/**
 * Small, framework-independent guard for async UI work.
 *
 * A caller takes a token before starting a request and checks `isCurrent`
 * before committing the result. Incrementing the generation invalidates every
 * request started before that point (input changes, project switches, close,
 * etc.).
 */
export interface AsyncGenerationGuard {
  current(): number;
  next(): number;
  isCurrent(token: number): boolean;
}

export function createAsyncGenerationGuard(initialGeneration = 0): AsyncGenerationGuard {
  let generation = initialGeneration;

  return {
    current: () => generation,
    next: () => {
      generation += 1;
      return generation;
    },
    isCurrent: (token: number) => token === generation,
  };
}
