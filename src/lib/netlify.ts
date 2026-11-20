/** Netlify passes the Blobs credentials to functions in this variable or global. */
export function isOnNetlify(): boolean {
  return Boolean(
    process.env.NETLIFY_BLOBS_CONTEXT ||
    (globalThis as { netlifyBlobsContext?: unknown }).netlifyBlobsContext
  );
}
