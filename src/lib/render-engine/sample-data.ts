import type { CvData } from "@/lib/schemas/cv-data";

// Generalized, fictional sample CvData (NO personal data baked into templates).
// Exercises every optional field: photo-less (monogram), leadership (sidebar),
// languages (clean). Mirrors planning/04-master-plan.md §2 example.
export const sampleCvData: CvData = {
  schemaVersion: 1,
  header: {
    name: "Dana Whitfield",
    title: "Senior Product Manager · AI Platforms",
    website: "danawhitfield.dev",
    summary:
      "Product leader with 9 years building 0→1 ML-powered products. Shipped a developer platform to 40k MAU and led a 12-person cross-functional team.",
  },
  contact: {
    email: "dana@example.com",
    phone: "+1 415 555 0142",
    location: "San Francisco, CA",
    linkedin: "linkedin.com/in/danawhitfield",
  },
  summary:
    "Product leader with 9 years building 0→1 ML-powered products. Shipped a developer platform to 40k MAU and led a 12-person cross-functional team.",
  skills: {
    professional: [
      "Product Strategy",
      "ML/AI Products",
      "Roadmapping",
      "SQL",
      "A/B Testing",
      "Developer Platforms",
    ],
    soft: ["Cross-functional leadership", "Stakeholder alignment", "Mentoring"],
  },
  experience: [
    {
      kbExperienceId: "8f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f",
      company: "Northstar AI",
      role: "Senior Product Manager",
      period: "2021 — Present",
      location: "San Francisco, CA",
      bullets: [
        "Led the 0→1 launch of an LLM developer platform, growing to 40,000 monthly active developers in 14 months.",
        "Defined the API roadmap with eng leadership; cut time-to-first-call from 30 min to under 5.",
        "Ran weekly experiments that lifted activation 22% and retention 11%.",
      ],
    },
    {
      kbExperienceId: "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      company: "Mapline",
      role: "Product Manager",
      period: "2017 — 2021",
      location: "Remote",
      bullets: [
        "Owned the geospatial analytics suite used by 300+ enterprise customers.",
        "Shipped a self-serve onboarding flow that reduced sales-assist tickets 35%.",
      ],
    },
  ],
  education: [
    {
      kbEducationId: "2b3c4d5e-6f7a-8b9c-0d1e-2f3a4b5c6d7e",
      institution: "University of Washington",
      degree: "B.S. Computer Science",
      period: "2012 — 2016",
      note: "Minor in Statistics",
    },
  ],
  leadership: [
    {
      kbLeadershipId: "3c4d5e6f-7a8b-9c0d-1e2f-3a4b5c6d7e8f",
      name: "PM Mentorship Circle",
      description: "Founded and ran a 30-person mentorship program for early-career PMs.",
      url: "pmcircle.org",
    },
  ],
  languages: [
    { name: "English", level: "Native" },
    { name: "Spanish", level: "Professional" },
  ],
};
