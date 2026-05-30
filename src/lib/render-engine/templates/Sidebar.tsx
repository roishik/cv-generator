import * as React from "react";
import type { CvData, ThemeTokens } from "@/lib/schemas/cv-data";
import { EmailIcon, PhoneIcon, LocationIcon, LinkedinIcon } from "./shared/icons";

// Type 1 — navy sidebar (was cv-main.html). Reproduced 1:1, data-driven.
// React renders identically in-browser (live preview) and via
// renderToStaticMarkup (server PDF) — single source of truth.

/** Derives initials for the monogram photo fallback (e.g. "Dana Whitfield" → "DW"). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function Sidebar({ data }: { data: CvData; theme: ThemeTokens }) {
  const { header, contact, summary, skills, experience, education, leadership } = data;
  return (
    <div className="cv-page">
      <aside className="sidebar">
        {/* Photo (circular) with graceful monogram fallback */}
        <div className="sidebar-photo">
          <div className="photo-circle">
            {data.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- render engine emits static HTML for the PDF/preview pipeline; next/image is not applicable here.
              <img src={data.photoUrl} alt={header.name} />
            ) : (
              <span className="photo-monogram">{initials(header.name)}</span>
            )}
          </div>
        </div>

        {/* Contact */}
        <div className="sidebar-section" data-section="contact">
          <div className="sidebar-section-header">Contact</div>
          {contact.email && (
            <div className="contact-item">
              <EmailIcon />
              <span className="contact-text" data-field="email">
                {contact.email}
              </span>
            </div>
          )}
          {contact.phone && (
            <div className="contact-item">
              <PhoneIcon />
              <span className="contact-text" data-field="phone">
                {contact.phone}
              </span>
            </div>
          )}
          {contact.location && (
            <div className="contact-item">
              <LocationIcon />
              <span className="contact-text" data-field="location">
                {contact.location}
              </span>
            </div>
          )}
          {contact.linkedin && (
            <div className="contact-item">
              <LinkedinIcon />
              <span className="contact-text" data-field="linkedin">
                {contact.linkedin}
              </span>
            </div>
          )}
        </div>

        {/* Professional Skills — omit the section entirely when empty. */}
        {skills.professional.length > 0 && (
          <>
            <div className="sidebar-divider" />
            <div className="sidebar-section" data-section="skills">
              <div className="sidebar-section-header">Professional Skills</div>
              <div data-field="professional">
                {skills.professional.map((s, i) => (
                  <div className="skill-item" key={i}>
                    <div className="skill-bullet" />
                    <span className="skill-text" data-skill-index={i}>
                      {s}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Soft Skills — omit the section entirely when empty. */}
        {skills.soft.length > 0 && (
          <>
            <div className="sidebar-divider" />
            <div className="sidebar-section" data-section="soft-skills">
              <div className="sidebar-section-header">Soft Skills</div>
              <div data-field="soft">
                {skills.soft.map((s, i) => (
                  <div className="skill-item" key={i}>
                    <div className="skill-bullet" />
                    <span className="skill-text" data-skill-index={i}>
                      {s}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Leadership & Impact (sidebar-only) */}
        {leadership.length > 0 && (
          <>
            <div className="sidebar-divider" />
            <div className="sidebar-section" data-section="leadership" style={{ flex: 1 }}>
              <div className="sidebar-section-header">Leadership &amp; Impact</div>
              {leadership.map((l, i) => (
                <div className="project-item" key={i} data-leadership-index={i}>
                  <div className="project-name" data-field="name">
                    {l.name}
                  </div>
                  {l.url ? (
                    <div className="project-desc" data-field="description">
                      {l.description}{" "}
                      <a href={l.url.startsWith("http") ? l.url : `https://${l.url}`}>{l.url}</a>
                    </div>
                  ) : (
                    <div className="project-desc" data-field="description">
                      {l.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </aside>

      <main className="main-content">
        <header className="cv-header" data-section="header">
          <h1 className="cv-name" data-field="name">
            {header.name}
          </h1>
          <div className="cv-title" data-field="title">
            {header.title}
          </div>
          {header.website && (
            <a className="cv-website" data-field="website">
              {header.website}
            </a>
          )}
          <p className="cv-summary" data-field="summary">
            {summary}
          </p>
        </header>

        <div className="main-divider" />

        <section className="experience-section" data-section="experience">
          <div className="main-section-header">Experience</div>
          <div className="experience-list">
            {experience.map((exp, i) => (
              <div className="experience-entry" key={i} data-exp-index={i}>
                <div className="exp-company-period">
                  <span data-field="company">{exp.company}</span>
                  {exp.period && (
                    <>
                      {"  |  "}
                      <span data-field="period">{exp.period}</span>
                    </>
                  )}
                </div>
                <div className="exp-job-title" data-field="title">
                  {exp.role}
                </div>
                <ul className="exp-bullets" data-field="bullets">
                  {exp.bullets.map((b, j) => (
                    <li className="exp-bullet" key={j}>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <div className="main-divider" />

        <section className="education-section" data-section="education">
          <div className="main-section-header">Education</div>
          {education.map((edu, i) => (
            <div className="education-entry" key={i} data-edu-index={i}>
              <div className="edu-institution" data-field="institution">
                {edu.institution}
              </div>
              {edu.period && (
                <div className="edu-period" data-field="period">
                  {edu.period}
                </div>
              )}
              {edu.degree && (
                <div className="edu-degree" data-field="degree">
                  {edu.degree}
                </div>
              )}
              {edu.note && (
                <div className="edu-note" data-field="note">
                  {edu.note}
                </div>
              )}
            </div>
          ))}
        </section>

        <div className="references-line">References available upon request</div>
      </main>
    </div>
  );
}
