// Vite gives every production JavaScript bundle a content-specific filename.
// Compare that filename, since a small site update may keep the same product version.
export function publishedBundlePath(html: string): string | null {
  const match = html.match(/<script\b[^>]*\bsrc=["']([^"']*\/assets\/index-[^"']+\.js)["'][^>]*>/i);
  return match?.[1] ?? null;
}

export async function latestBundlePath(baseUrl: string): Promise<string> {
  const url = new URL('index.html', new URL(baseUrl, window.location.origin));
  url.searchParams.set('update-check', String(Date.now()));
  const response = await fetch(url, {cache: 'no-store'});
  if (!response.ok) throw new Error(`Update check failed (${response.status})`);
  const bundle = publishedBundlePath(await response.text());
  if (!bundle) throw new Error('Published app bundle was not found');
  return new URL(bundle, url).pathname;
}
