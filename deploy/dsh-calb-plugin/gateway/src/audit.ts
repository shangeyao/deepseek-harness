/** Structured audit log line for gateway security events. */
export function auditLog(event: string, fields: Record<string, string | number | boolean | undefined>): void {
  const payload = {
    ts: new Date().toISOString(),
    event,
    ...Object.fromEntries(
      Object.entries(fields).filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined),
    ),
  }
  process.stdout.write(`[calb-audit] ${JSON.stringify(payload)}\n`)
}
