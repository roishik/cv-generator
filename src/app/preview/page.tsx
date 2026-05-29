export const runtime = "nodejs";

// Dev-only visual inspection route: iframes BOTH templates (served by the
// sibling /preview/[template] route handler) at true A4 (794×1123) so the
// render engine can be eyeballed without the full app.
export default function PreviewPage() {
  return (
    <main style={{ background: "#e9e9ec", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 18, marginBottom: 16 }}>CV Render Engine — Preview (sample data)</h1>
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
        <figure style={{ margin: 0 }}>
          <figcaption style={{ marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
            Type 1 — Sidebar
          </figcaption>
          <iframe
            title="sidebar"
            src="/preview/sidebar"
            width={794}
            height={1123}
            style={{ border: "1px solid #ccc", boxShadow: "0 4px 24px rgba(0,0,0,0.15)" }}
          />
        </figure>
        <figure style={{ margin: 0 }}>
          <figcaption style={{ marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
            Type 2 — Clean
          </figcaption>
          <iframe
            title="clean"
            src="/preview/clean"
            width={794}
            height={1123}
            style={{ border: "1px solid #ccc", boxShadow: "0 4px 24px rgba(0,0,0,0.15)" }}
          />
        </figure>
      </div>
    </main>
  );
}
