/** @type {import('next').NextConfig} */

// Static export is the default so the app can be hosted on GitLab Pages / any static host.
// `SIGNSPEAK_STANDALONE=1` switches to a Node server build (needed only if the optional
// FastAPI-style proxy or an SSR deployment is ever added).
const standalone = process.env.SIGNSPEAK_STANDALONE === '1';

const nextConfig = {
  reactStrictMode: true,
  // `output: 'export'` produces a fully static site in ./out. There are no API routes by
  // design: every feature runs in the browser (see docs/technical-architecture.md §9).
  ...(standalone ? {} : { output: 'export' }),
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  eslint: {
    // Linting runs as its own CI job (`npm run lint`) so build output stays readable.
    ignoreDuringBuilds: true,
  },
  // Security headers. Only applied for a server build: with `output: 'export'` Next.js
  // cannot emit response headers at all, and declaring them here just prints
  // "Specified 'headers' will not automatically work with 'output: export'" four times.
  // The static export is covered by `public/_headers`, which hosts such as Netlify,
  // Cloudflare Pages and GitLab Pages read directly.
  ...(standalone
    ? {
        async headers() {
          return [
            {
              source: '/(.*)',
              headers: [
                { key: 'X-Content-Type-Options', value: 'nosniff' },
                { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
              ],
            },
          ];
        },
      }
    : {}),
};

export default nextConfig;
