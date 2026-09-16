import { networkInterfaces } from 'node:os'

const ALL_INTERFACES_HOST = '0.0.0.0'

export interface LanTrustSnapshot {
  /** Non-loopback IPv4 addresses when the gateway binds all interfaces. */
  lanAddresses: string[]
  /** Authorities accepted by dsh web /api trust fence (port-less IP or host[:port]). */
  trustedHosts: string[]
}

/**
 * Resolve LAN-trust authorities for user dsh processes behind a gateway bind.
 * Mirrors {@link resolveLanTrust} in `@deepseek-ai/dsh-web-app`: port-less IP
 * literals match any port; explicit host:port entries match exactly.
 * @param bindHost - gateway listen host (`GATEWAY_HOST`).
 * @param extra - additional entries from `CALB_TRUSTED_HOSTS`.
 */
export function resolveLanTrust(bindHost: string, extra: readonly string[]): LanTrustSnapshot {
  const lanAddresses = bindHost === ALL_INTERFACES_HOST
    ? Object.values(networkInterfaces()).flat()
      .filter((iface): iface is NonNullable<typeof iface> =>
        iface !== undefined && iface.family === 'IPv4' && !iface.internal)
      .map(iface => iface.address)
    : bindHost === '127.0.0.1' || bindHost === '::1' || bindHost === 'localhost'
      ? []
      : [bindHost]
  const trusted = new Set<string>([...lanAddresses, ...extra])
  return { lanAddresses, trustedHosts: [...trusted] }
}

/**
 * Human-facing login URLs to print when the gateway starts.
 * @param bindHost - gateway listen host.
 * @param port - gateway listen port.
 * @param lanAddresses - derived LAN IPv4 literals.
 * @param trustedHosts - full trusted-host list (may include hostnames).
 */
export function publicLoginUrls(
  bindHost: string,
  port: number,
  lanAddresses: readonly string[],
  trustedHosts: readonly string[],
): string[] {
  const urls = new Set<string>()
  const portSuffix = String(port)

  if (bindHost === ALL_INTERFACES_HOST) {
    for (const address of lanAddresses) urls.add(`http://${address}:${portSuffix}/login`)
    if (lanAddresses.length === 0) urls.add(`http://127.0.0.1:${portSuffix}/login`)
  } else {
    urls.add(`http://${bindHost}:${portSuffix}/login`)
  }

  for (const entry of trustedHosts) {
    const urlHost = entry.includes(':') ? entry : `${entry}:${portSuffix}`
    urls.add(`http://${urlHost}/login`)
  }

  return [...urls]
}
