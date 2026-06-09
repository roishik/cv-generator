"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { normalizeAnalyticsPath } from "@/lib/analytics/meta";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function safeMeasurementId(id: string | undefined): string | null {
  if (!id) return null;
  const clean = id.trim();
  return /^[A-Z0-9-]{4,40}$/.test(clean) ? clean : null;
}

export function GoogleAnalytics({ measurementId }: { measurementId?: string }) {
  const pathname = usePathname();
  const id = safeMeasurementId(measurementId);

  useEffect(() => {
    if (!id || !window.gtag) return;
    window.gtag("config", id, {
      page_path: normalizeAnalyticsPath(pathname),
      anonymize_ip: true,
    });
  }, [id, pathname]);

  if (!id) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${id}', { send_page_view: false, anonymize_ip: true });
        `}
      </Script>
    </>
  );
}
