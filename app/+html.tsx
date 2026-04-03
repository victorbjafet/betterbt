import { ScrollViewStyleReset } from 'expo-router/html';

const SITE_NAME = 'BetterBT';
const SITE_DESCRIPTION =
  'Real-time Blacksburg Transit tracking with live buses, route maps, stop arrivals, and service alerts.';
const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL ?? 'https://betterbt.vbjfr.xyz';
const PREVIEW_IMAGE = `${SITE_URL}/assets/images/icon.png`;

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        <title>{SITE_NAME}</title>
        <meta name="description" content={SITE_DESCRIPTION} />
        <meta name="application-name" content={SITE_NAME} />
        <meta name="theme-color" content="#0F1117" />

        <link rel="canonical" href={SITE_URL} />
        <link rel="icon" type="image/png" sizes="32x32" href="/assets/images/favicon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/assets/images/icon.png" />
        <link rel="apple-touch-icon" href="/assets/images/icon.png" />

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