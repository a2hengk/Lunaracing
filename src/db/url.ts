/**
 * pg behandelt sslmode=require heute schon wie verify-full und warnt bei jeder Verbindung,
 * dass sich das ändert. Mit verify-full explizit bleibt das Verhalten gleich (Zertifikat
 * wird geprüft) und die Warnung verschwindet. Neon-URLs enthalten standardmäßig require.
 */
export function pgUrl(url: string): string;
export function pgUrl(url: string | undefined): string | undefined;
export function pgUrl(url: string | undefined) {
  if (!url) return url;
  return url.replace(/([?&]sslmode=)(require|prefer|verify-ca)(?=&|$)/, "$1verify-full");
}
