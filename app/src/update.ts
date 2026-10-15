// Vite gives every production JavaScript bundle a content-specific filename.
// Compare that filename, since a small site update may keep the same product version.
export function publishedBundlePath(html: string): string | null {
  const match = html.match(/<script\b[^>]*\bsrc=["']([^"']*\/assets\/index-[^"']+\.js)["'][^>]*>/i);
  return match?.[1] ?? null;
}

export function publishedAssetPaths(html: string): string[] {
  return [...html.matchAll(/(?:src|href)=["']([^"']*\/assets\/[^"']+\.(?:js|css))["']/gi)].map(match => match[1]);
}

export async function latestBundlePath(baseUrl: string): Promise<string> {
  const url = new URL('index.html', new URL(baseUrl, window.location.origin));
  url.searchParams.set('update-check', String(Date.now()));
  const response = await fetch(url, {cache: 'no-store'});
  if (!response.ok) throw new Error(`Update check failed (${response.status})`);
  const html = await response.text();
  const bundle = publishedBundlePath(html);
  if (!bundle) throw new Error('Published app bundle was not found');
  // Do not leave the running app until its replacement code and styles are reachable.
  await Promise.all(publishedAssetPaths(html).map(async path => {
    const asset = await fetch(new URL(path, url), {cache: 'no-store'});
    if (!asset.ok) throw new Error(`Published asset unavailable (${asset.status}): ${path}`);
  }));
  return new URL(bundle, url).pathname;
}
