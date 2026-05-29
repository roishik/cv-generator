import * as React from "react";
import type { CvData, ThemeTokens } from "@/lib/schemas/cv-data";

// Type 2 — centered clean (was cv-clean.html). Reproduced 1:1, data-driven.
// Ignores photoUrl + leadership; renders languages + inline ·-joined skills.

function InlineSkills({ items, field }: { items: string[]; field: string }) {
  return (
    <div className="skills-inline" data-section="skills" data-field={field}>
      {items.map((s, i) => (
        <div className="skill-item" key={i}>
          <div className="skill-bullet" />
          <span className="skill-text" data-skill-index={i}>
            {s}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Clean({ data }: { data: CvData; theme: ThemeTokens }) {
  const { header, contact, summary, skills, experience, education, languages } = data;
  const contactBits: React.ReactNode[] = [];
  if (contact.location)
    contactBits.push(
      <span key="loc" data-field="location">
        {contact.location}
      </span>,
    );
  if (contact.phone)
    contactBits.push(
      <span key="phone" data-field="phone">
        {contact.phone}
      </span>,
    );
  if (contact.email)
    contactBits.push(
      <span key="email" data-field="email">
        {contact.email}
      </span>,
    );
  if (contact.linkedin)
    contactBits.push(
      <span key="li" data-field="linkedin">
        {contact.linkedin}
      </span>,
    );
  if (header.website)
    contactBits.push(
      <a key="web" className="cv-website" data-field="website">
        {header.website}
      </a>,
    );

  return (
    <>
      <header className="cv-header" data-section="header">
        <h1 className="name" data-field="name">
          {header.name}
        </h1>
        <div className="title" data-field="title">
          {header.title}
        </div>
        <div className="contact">
          {contactBits.map((bit, i) => (
            <React.Fragment key={i}>
              {bit}
              {i < contactBits.length - 1 ? "·" : null}
            </React.Fragment>
          ))}
        </div>
        <p className="summary" data-field="summary">
          {summary}
        </p>
      </header>

      <section>
        <h2 className="section-title">Professional Experience</h2>
        {experience.map((exp, i) => (
          <div className="entry" key={i} data-exp-index={i}>
            <div className="entry-row">
              <div className="left">
                <span className="org" data-field="company">
                  {exp.company}
                </span>
                <span className="sep">|</span>
                <span className="role" data-field="title">
                  {exp.role}
                </span>
              </div>
              {exp.period && (
                <div className="right" data-field="period">
                  {exp.period}
                </div>
              )}
            </div>
            <ul className="bullets" data-field="bullets">
              {exp.bullets.map((b, j) => (
                <li className="exp-bullet" key={j}>
                  {b}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section>
        <h2 className="section-title">Education</h2>
        {education.map((edu, i) => (
          <div className="entry" key={i} data-edu-index={i}>
            <div className="entry-row">
              <div className="left">
                <span className="org" data-field="institution">
                  {edu.institution}
                </span>
                {edu.degree && (
                  <>
                    <span className="sep">|</span>
                    <span className="role" data-field="degree">
                      {edu.degree}
                    </span>
                  </>
                )}
              </div>
              {edu.period && (
                <div className="right" data-field="period">
                  {edu.period}
                </div>
              )}
            </div>
            {edu.note && (
              <div className="edu-note" data-field="note">
                {edu.note}
              </div>
            )}
          </div>
        ))}
      </section>

      <section>
        <h2 className="section-title">Skills &amp; Languages</h2>
        <div className="skills-line">
          <span className="label">Professional:</span> <InlineSkills items={skills.professional} field="professional" />
        </div>
        <div className="skills-line">
          <span className="label">Strengths:</span> <InlineSkills items={skills.soft} field="soft" />
        </div>
        {languages.length > 0 && (
          <div className="languages-line">
            <span className="label">Languages:</span>{" "}
            {languages.map((l) => `${l.name} (${l.level})`).join(", ")}.
          </div>
        )}
      </section>
    </>
  );
}
