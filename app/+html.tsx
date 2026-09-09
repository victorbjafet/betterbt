import { ScrollViewStyleReset } from 'expo-router/html';

const SITE_NAME = 'BetterBT';
const SITE_DESCRIPTION =
  'Real-time Blacksburg Transit tracking with live buses, route maps, stop arrivals, and service alerts.';
const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL ?? 'https://betterbt.vbjfr.xyz';
const PREVIEW_IMAGE = `${SITE_URL}/app-icon.png`;
// Google Search Console ownership proof. Must stay in <head> on every page.
const GOOGLE_SITE_VERIFICATION = 'EQPczDHUXekwK8GhPX9xxhvfDcR_oLVVksm5OXJzZbM';

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        {/* Fallback only. expo-router injects react-helmet's <title> ahead of
            this one, so the tag that actually wins is the <Head> in
            app/_layout.tsx — keep the two in sync. */}
        <title>{SITE_NAME}</title>
        <meta name="description" content={SITE_DESCRIPTION} />
        <meta name="application-name" content={SITE_NAME} />
        <meta name="theme-color" content="#0F1117" />
        <meta name="google-site-verification" content={GOOGLE_SITE_VERIFICATION} />

        <link rel="canonical" href={SITE_URL} />
        {/* Icons live in public/, which Expo copies to the export root verbatim.
            Bundled assets/ paths are content-hashed by the exporter, so linking
            them from here would 404. */}
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png" />
        <link rel="apple-touch-icon" href="/app-icon.png" />

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={SITE_NAME} />
        <meta property="og:title" content={SITE_NAME} />
        <meta property="og:description" content={SITE_DESCRIPTION} />
        <meta property="og:url" content={SITE_URL} />
        <meta property="og:image" content={PREVIEW_IMAGE} />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={SITE_NAME} />
        <meta name="twitter:description" content={SITE_DESCRIPTION} />
        <meta name="twitter:image" content={PREVIEW_IMAGE} />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
