/**
 * Node ESM loader hook that stubs stylesheet imports.
 *
 * Components under src/demo/ import their own CSS so the namespace stays
 * self-contained. Vite handles that natively; plain Node does not, and throws
 * ERR_UNKNOWN_FILE_EXTENSION. Rendering tests only need the markup, so a
 * stylesheet resolves to an empty module here.
 */
export async function load(url, context, nextLoad) {
  if (url.endsWith(".css")) {
    return { format: "module", source: "export default {};", shortCircuit: true };
  }
  return nextLoad(url, context);
}
