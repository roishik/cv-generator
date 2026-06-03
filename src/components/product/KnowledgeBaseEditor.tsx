"use client";

/**
 * KnowledgeBaseEditor — the durable source-of-truth editor (spec §4.5).
 *
 * Edits structured sections (header, contact, experience[], education, skills)
 * plus per-experience "angles to highlight" (the JD-signal lenses that feed the
 * tailoring prompt) and a freeform "Career narrative & angles" panel — the
 * productized career-knowledge.md. RLS-scoped save with explicit Save + status.
 *
 * Accessibility: every field is labelled + tied; sections are fieldsets with
 * legends; add/remove buttons have aria-labels; the save status is announced.
 */

import * as React from "react";
import { Plus, Trash2, Save, Loader2, X, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { saveKnowledgeBase, editProfileWithAi } from "@/app/(app)/knowledge-base/actions";
import type { EditableKnowledgeBase } from "@/app/(app)/knowledge-base/schema";

type Exp = EditableKnowledgeBase["experiences"][number];
type Edu = EditableKnowledgeBase["education"][number];

export function KnowledgeBaseEditor({ initial }: { initial: EditableKnowledgeBase }) {
  const [data, setData] = React.useState<EditableKnowledgeBase>(initial);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [aiOpen, setAiOpen] = React.useState(false);
  const [aiInstruction, setAiInstruction] = React.useState("");
  const [aiBusy, setAiBusy] = React.useState(false);

  const handleEditWithAi = React.useCallback(async () => {
    const instruction = aiInstruction.trim();
    if (!instruction) return;
    setAiBusy(true);
    try {
      const res = await editProfileWithAi({ current: data, instruction });
      if (res.ok && res.data) {
        setData(res.data);
        setDirty(true);
        setAiOpen(false);
        setAiInstruction("");
        toast.success("Applied — review the changes, then Save profile.");
      } else {
        toast.error(res.error ?? "Couldn't apply that edit.");
      }
    } catch (e) {
      toast.error((e as Error).message ?? "Couldn't apply that edit.");
    } finally {
      setAiBusy(false);
    }
  }, [aiInstruction, data]);

  const update = React.useCallback((fn: (d: EditableKnowledgeBase) => void) => {
    setData((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
  }, []);

  const handleSave = React.useCallback(async () => {
    setSaving(true);
    try {
      const res = await saveKnowledgeBase(data);
      if (res.ok) {
        setDirty(false);
        toast.success("Profile saved.");
      } else {
        toast.error(res.error ?? "Couldn't save your profile.");
      }
    } catch (e) {
      toast.error((e as Error).message ?? "Couldn't save your profile.");
    } finally {
      setSaving(false);
    }
  }, [data]);

  return (
    <div className="space-y-8">
      {/* Sticky save bar */}
      <div className="sticky top-0 z-10 -mx-1 flex items-center justify-between gap-3 bg-background/95 px-1 py-2 backdrop-blur">
        <p className="text-[12px] text-muted-foreground" aria-live="polite">
          {saving ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setAiOpen(true)}
            disabled={saving}
            size="sm"
            variant="outline"
          >
            <Wand2 className="h-4 w-4" aria-hidden />
            Edit with AI
          </Button>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="h-4 w-4" aria-hidden />
            )}
            Save profile
          </Button>
        </div>
      </div>

      {/* Edit-with-AI dialog */}
      <Dialog open={aiOpen} onOpenChange={(o) => !aiBusy && setAiOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit profile with AI</DialogTitle>
            <DialogDescription>
              Describe the change in plain language — e.g. “add an MSc in Computer
              Science from MIT, 2021”, “add a bullet about leading the migration to
              Acme”, or “remove the Globex role”. The AI updates your profile; you
              review and then <strong>Save profile</strong>.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={aiInstruction}
            onChange={(e) => setAiInstruction(e.target.value)}
            rows={4}
            autoFocus
            placeholder="Tell the AI what to change…"
            disabled={aiBusy}
            className="text-[14px]"
          />
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAiOpen(false)} disabled={aiBusy}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleEditWithAi} disabled={aiBusy || !aiInstruction.trim()}>
              {aiBusy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Applying…
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" aria-hidden /> Apply
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <Section title="Header">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" id="kb-name" required>
            <Input
              id="kb-name"
              value={data.header.name}
              onChange={(e) => update((d) => void (d.header.name = e.target.value))}
            />
          </Field>
          <Field label="Title / positioning line" id="kb-title">
            <Input
              id="kb-title"
              value={data.header.title}
              onChange={(e) => update((d) => void (d.header.title = e.target.value))}
            />
          </Field>
          <Field label="Website" id="kb-website">
            <Input
              id="kb-website"
              value={data.header.website ?? ""}
              onChange={(e) => update((d) => void (d.header.website = e.target.value))}
            />
          </Field>
        </div>
        <Field label="Professional summary" id="kb-summary">
          <Textarea
            id="kb-summary"
            value={data.header.summaryLong}
            onChange={(e) => update((d) => void (d.header.summaryLong = e.target.value))}
            className="min-h-[90px]"
          />
        </Field>
      </Section>

      {/* Contact */}
      <Section title="Contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" id="kb-email">
            <Input
              id="kb-email"
              type="email"
              value={data.contact.email ?? ""}
              onChange={(e) => update((d) => void (d.contact.email = e.target.value))}
            />
          </Field>
          <Field label="Phone" id="kb-phone">
            <Input
              id="kb-phone"
              value={data.contact.phone ?? ""}
              onChange={(e) => update((d) => void (d.contact.phone = e.target.value))}
            />
          </Field>
          <Field label="Location" id="kb-location">
            <Input
              id="kb-location"
              value={data.contact.location ?? ""}
              onChange={(e) => update((d) => void (d.contact.location = e.target.value))}
            />
          </Field>
          <Field label="LinkedIn" id="kb-linkedin">
            <Input
              id="kb-linkedin"
              value={data.contact.linkedin ?? ""}
              onChange={(e) => update((d) => void (d.contact.linkedin = e.target.value))}
            />
          </Field>
        </div>
      </Section>

      {/* Experience */}
      <Section
        title="Experience"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              update((d) =>
                void d.experiences.push({
                  company: "",
                  role: "",
                  bulletsFull: [""],
                  angles: [],
                  tags: [],
                } as Exp),
              )
            }
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add role
          </Button>
        }
      >
        {data.experiences.length === 0 && (
          <p className="text-[13px] text-muted-foreground">No roles yet. Add your first.</p>
        )}
        <div className="space-y-4">
          {data.experiences.map((exp, i) => (
            <ExperienceCard
              key={exp.id ?? `new-${i}`}
              exp={exp}
              onChange={(fn) => update((d) => fn(d.experiences[i]!))}
              onRemove={() => update((d) => void d.experiences.splice(i, 1))}
            />
          ))}
        </div>
      </Section>

      {/* Education */}
      <Section
        title="Education"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              update((d) => void d.education.push({ institution: "" } as Edu))
            }
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add education
          </Button>
        }
      >
        <div className="space-y-4">
          {data.education.map((edu, i) => (
            <div
              key={edu.id ?? `new-${i}`}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-[13px] font-semibold text-foreground">
                  {edu.institution || "New education"}
                </h4>
                <button
                  type="button"
                  onClick={() => update((d) => void d.education.splice(i, 1))}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Remove ${edu.institution || "education"}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Institution" id={`edu-inst-${i}`} required>
                  <Input
                    id={`edu-inst-${i}`}
                    value={edu.institution}
                    onChange={(e) => update((d) => void (d.education[i]!.institution = e.target.value))}
                  />
                </Field>
                <Field label="Degree" id={`edu-deg-${i}`}>
                  <Input
                    id={`edu-deg-${i}`}
                    value={edu.degree ?? ""}
                    onChange={(e) => update((d) => void (d.education[i]!.degree = e.target.value))}
                  />
                </Field>
                <Field label="Period" id={`edu-per-${i}`}>
                  <Input
                    id={`edu-per-${i}`}
                    value={edu.period ?? ""}
                    onChange={(e) => update((d) => void (d.education[i]!.period = e.target.value))}
                  />
                </Field>
                <Field label="Note" id={`edu-note-${i}`}>
                  <Input
                    id={`edu-note-${i}`}
                    value={edu.note ?? ""}
                    onChange={(e) => update((d) => void (d.education[i]!.note = e.target.value))}
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Skills */}
      <Section title="Skills">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Professional (one per line)" id="kb-prof">
            <Textarea
              id="kb-prof"
              value={data.skills.professional.join("\n")}
              onChange={(e) =>
                update(
                  (d) =>
                    void (d.skills.professional = e.target.value.split("\n").map((s) => s)),
                )
              }
              className="min-h-[120px]"
            />
          </Field>
          <Field label="Soft (one per line)" id="kb-soft">
            <Textarea
              id="kb-soft"
              value={data.skills.soft.join("\n")}
              onChange={(e) =>
                update((d) => void (d.skills.soft = e.target.value.split("\n").map((s) => s)))
              }
              className="min-h-[120px]"
            />
          </Field>
        </div>
      </Section>

      {/* Career narrative & angles */}
      <Section title="Career narrative & angles">
        <p className="mb-2 text-[12px] text-muted-foreground">
          Richer than any one CV — what to emphasise for different roles. Never invented;
          the tailoring guardrail only ever selects from true facts you record here.
        </p>
        <Field label="Narrative (markdown-friendly)" id="kb-narrative">
          <Textarea
            id="kb-narrative"
            value={data.narrative}
            onChange={(e) => update((d) => void (d.narrative = e.target.value))}
            className="min-h-[160px]"
            placeholder="What to emphasise for X vs Y roles; context a single CV can't hold…"
          />
        </Field>
      </Section>
    </div>
  );
}

// ── Experience card with bullets + angles + tags ────────────────────────────

function ExperienceCard({
  exp,
  onChange,
  onRemove,
}: {
  exp: Exp;
  onChange: (fn: (e: Exp) => void) => void;
  onRemove: () => void;
}) {
  const uid = React.useId();
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-[13px] font-semibold text-foreground">
          {exp.role || "New role"}
          {exp.company ? ` · ${exp.company}` : ""}
        </h4>
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Remove ${exp.role || "role"}`}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Company" id={`${uid}-co`} required>
          <Input
            id={`${uid}-co`}
            value={exp.company}
            onChange={(e) => onChange((x) => void (x.company = e.target.value))}
          />
        </Field>
        <Field label="Role" id={`${uid}-role`} required>
          <Input
            id={`${uid}-role`}
            value={exp.role}
            onChange={(e) => onChange((x) => void (x.role = e.target.value))}
          />
        </Field>
        <Field label="Period" id={`${uid}-per`}>
          <Input
            id={`${uid}-per`}
            value={exp.period ?? ""}
            onChange={(e) => onChange((x) => void (x.period = e.target.value))}
          />
        </Field>
        <Field label="Location" id={`${uid}-loc`}>
          <Input
            id={`${uid}-loc`}
            value={exp.location ?? ""}
            onChange={(e) => onChange((x) => void (x.location = e.target.value))}
          />
        </Field>
      </div>

      {/* Bullets */}
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between">
          <Label>Bullets (the superset the model selects from)</Label>
          <button
            type="button"
            onClick={() => onChange((x) => void x.bulletsFull.push(""))}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-3 w-3" aria-hidden /> Add bullet
          </button>
        </div>
        <div className="space-y-2">
          {exp.bulletsFull.map((b, j) => (
            <div key={j} className="flex items-start gap-2">
              <Textarea
                value={b}
                onChange={(e) => onChange((x) => void (x.bulletsFull[j] = e.target.value))}
                className="min-h-[44px] flex-1"
                aria-label={`Bullet ${j + 1}`}
              />
              <button
                type="button"
                onClick={() => onChange((x) => void x.bulletsFull.splice(j, 1))}
                className="mt-1 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Remove bullet ${j + 1}`}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Angles */}
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between">
          <Label>Angles to highlight (feeds tailoring)</Label>
          <button
            type="button"
            onClick={() => onChange((x) => void x.angles.push({ label: "", jdSignals: [] }))}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-3 w-3" aria-hidden /> Add angle
          </button>
        </div>
        <div className="space-y-2">
          {exp.angles.map((a, k) => (
            <div key={k} className="flex items-start gap-2 rounded-md bg-secondary/60 p-2">
              <div className="grid flex-1 gap-2 sm:grid-cols-2">
                <Input
                  value={a.label}
                  placeholder="Angle label (e.g. AI platform leadership)"
                  onChange={(e) => onChange((x) => void (x.angles[k]!.label = e.target.value))}
                  aria-label={`Angle ${k + 1} label`}
                />
                <Input
                  value={a.jdSignals.join(", ")}
                  placeholder="JD signals, comma-separated"
                  onChange={(e) =>
                    onChange(
                      (x) =>
                        void (x.angles[k]!.jdSignals = e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean)),
                    )
                  }
                  aria-label={`Angle ${k + 1} JD signals`}
                />
              </div>
              <button
                type="button"
                onClick={() => onChange((x) => void x.angles.splice(k, 1))}
                className="mt-1 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Remove angle ${k + 1}`}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Tags */}
      <div className="mt-3">
        <Field label="Tags (comma-separated)" id={`${uid}-tags`}>
          <Input
            id={`${uid}-tags`}
            value={exp.tags.join(", ")}
            onChange={(e) =>
              onChange(
                (x) =>
                  void (x.tags = e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)),
              )
            }
          />
        </Field>
      </div>
    </div>
  );
}

// ── Small layout helpers ────────────────────────────────────────────────────

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-3">
      <div className="flex items-center justify-between">
        <legend className="text-[15px] font-semibold text-foreground">{title}</legend>
        {action}
      </div>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  id,
  required,
  children,
}: {
  label: string;
  id: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={cn(required && "after:ml-0.5 after:text-destructive after:content-['*']")}>
        {label}
      </Label>
      {children}
    </div>
  );
}
