import { describe, it, expect } from "vitest";
import { renderTemplateBody } from "@/lib/render-engine/render";
import { sampleCvData } from "@/lib/render-engine/sample-data";
import { sidebarDefault, cleanDefault } from "@/lib/render-engine/themes/registry";

// Snapshot the rendered BODY markup (not the giant base64 font <style>) so the
// structural fidelity of each template is pinned and regressions are obvious.
describe("rendered HTML snapshots", () => {
  it("sidebar body markup", () => {
    expect(renderTemplateBody(sampleCvData, sidebarDefault)).toMatchSnapshot();
  });
  it("clean body markup", () => {
    expect(renderTemplateBody(sampleCvData, cleanDefault)).toMatchSnapshot();
  });
});
