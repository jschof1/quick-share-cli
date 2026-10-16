const PUBLIC_URL = 'https://pub-347aa0ad8b93489db6fe959dca5c3b05.r2.dev';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/download') return env.ASSETS.fetch(request);
    if (!['GET', 'HEAD'].includes(request.method)) {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const name = url.searchParams.get('file');
    if (!name || name.length > 1024 || /[\x00-\x1f\x7f]/.test(name) || name.split('/').some(part => !part || part === '.' || part === '..')) {
      return new Response('Invalid filename', { status: 400 });
    }
    // Stream from the existing public bucket; never buffer large videos in memory.
    const upstream = await fetch(`${PUBLIC_URL}/${name.split('/').map(encodeURIComponent).join('/')}`, { method: request.method });
    if (!upstream.ok) return new Response('File unavailable', { status: upstream.status });
    const filename = name.split('/').pop();
    const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    const headers = new Headers(upstream.headers);
    headers.set('Content-Disposition', `attachment; filename="${filename.replace(/[^a-zA-Z0-9._ -]/g, '_')}"; filename*=UTF-8''${encoded}`);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.delete('Accept-Ranges');
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
