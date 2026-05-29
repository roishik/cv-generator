import { KnowledgeBase } from "@/lib/schemas/knowledge-base";

export const SAMPLE_RESUME_TEXT = `Dana Whitfield
dana@example.com · +1 415 555 0142 · linkedin.com/in/danawhitfield

Senior Product Manager at Northstar AI
2021 - Present
- Led the 0 to 1 launch of an LLM developer platform, growing to 40,000 monthly active developers in 14 months.
- Defined the API roadmap with engineering leadership and cut time-to-first-call.
- Ran weekly experiments that lifted activation 22%.

Product Manager at Mapline
2017 - 2021
- Owned the geospatial analytics suite used by 300 enterprise customers.
- Shipped a self-serve onboarding flow that reduced sales-assist tickets 35%.`;

export const EXP_NORTHSTAR = "11111111-1111-4111-8111-111111111111";
export const EXP_MAPLINE = "22222222-2222-4222-8222-222222222222";

/** A clean, valid KnowledgeBase used to exercise tailoring + truthfulness. */
export const SAMPLE_KB = KnowledgeBase.parse({
  narrative: "Product leader building 0 to 1 ML products.",
  header: {
    name: "Dana Whitfield",
    title: "Senior Product Manager",
    website: "danawhitfield.dev",
    summaryLong:
      "Product leader with 9 years building 0 to 1 ML-powered products.",
  },
  contact: {
    email: "dana@example.com",
    phone: "+1 415 555 0142",
    linkedin: "linkedin.com/in/danawhitfield",
  },
  experiences: [
    {
      id: EXP_NORTHSTAR,
      company: "Northstar AI",
      role: "Senior Product Manager",
      period: "2021 — Present",
      location: "San Francisco, CA",
      bulletsFull: [
        "Led the 0 to 1 launch of an LLM developer platform, growing to 40,000 monthly active developers in 14 months.",
        "Defined the API roadmap with engineering leadership; cut time-to-first-call from 30 min to under 5.",
        "Ran weekly experiments that lifted activation 22% and retention 11%.",
      ],
      angles: [
        {
          label: "Platform growth",
          jdSignals: ["platform", "growth", "developers", "api"],
          bulletIdxs: [0, 1],
        },
        {
          label: "Experimentation",
          jdSignals: ["experimentation", "activation"],
          bulletIdxs: [2],
        },
      ],
      tags: ["product", "platform", "api", "ml", "growth"],
    },
    {
      id: EXP_MAPLINE,
      company: "Mapline",
      role: "Product Manager",
      period: "2017 — 2021",
      bulletsFull: [
        "Owned the geospatial analytics suite used by 300+ enterprise customers.",
        "Shipped a self-serve onboarding flow that reduced sales-assist tickets 35%.",
      ],
      angles: [
        {
          label: "Enterprise",
          jdSignals: ["enterprise", "analytics", "onboarding"],
          bulletIdxs: [0, 1],
        },
      ],
      tags: ["product", "analytics", "enterprise", "onboarding"],
    },
  ],
  education: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      institution: "University of Washington",
      degree: "B.S. Computer Science",
      period: "2012 — 2016",
    },
  ],
  leadership: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      name: "PM Mentorship Circle",
      description: "Founded a 30-person mentorship program for early-career PMs.",
      tags: ["mentorship", "leadership"],
    },
  ],
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
  languages: [
    { name: "English", level: "Native" },
    { name: "Spanish", level: "Professional" },
  ],
});

export const SAMPLE_JD = `We are hiring a Senior Product Manager to lead our developer platform and API.
You will run experimentation, drive growth among developers, and own the product roadmap.
Experience with ML products and analytics is a plus. Kubernetes experience required.`;
