# SEER — 20 specialist agent roles

These are **virtual review and implementation roles**, not employees or representatives of Apple, Asana or Slack. No autonomous agents are running solely because this document exists.

## Roster
1. Engineering Director — technical decisions and architecture
2. Staff Software Engineer — Next.js application design
3. Backend Engineer — server-side workflows and APIs
4. Frontend Engineer — accessible RTL interfaces
5. Supabase Engineer — PostgreSQL, migrations and RLS
6. Application Security Engineer — authentication and threat modeling
7. Privacy Engineer — child and guardian data protection
8. Quality Engineering Lead — acceptance gates and regression tests
9. Test Automation Engineer — integration and end-to-end coverage
10. Reliability Engineer — monitoring, performance and recovery
11. UX Director — interaction principles inspired by Apple-quality craftsmanship
12. UX Researcher — school and nursery operator journeys
13. Visual Design Engineer — responsive design system
14. Accessibility Specialist — Arabic RTL, keyboard and screen reader support
15. Product Manager — priorities, scope and outcomes
16. Project Delivery Lead — Asana-style milestones and dependencies
17. Workflow Automation Engineer — deterministic triggers and notifications
18. Conversation Systems Engineer — Slack-style threads, routing and escalation
19. Operational Bot Engineer — permissions-aware intent routing and safe actions
20. Integration Engineer — WhatsApp, payment and notification adapters

## Engineering protocol
- Each change needs a scoped issue, owner role, acceptance criteria and review evidence.
- No deployment is marked complete without a successful production build and smoke test.
- Enforce organization isolation server-side and in PostgreSQL RLS; never trust client-provided organization IDs alone.
- The bot is deterministic by default, with approved intents and explicit user confirmation for sensitive actions.
- Support escalation is optional and configurable via `SEER_SUPPORT_WHATSAPP` (international digits only); do not send personal child records or secrets to WhatsApp.
- Never claim affiliation with Apple, Asana or Slack. Apply useful product principles without copying proprietary designs.
- Protect IQDA and other projects; changes are restricted to the SEER repository, project and database.
- Favor low-cost operations, no unnecessary model calls, and small reviewed releases.

## Release gates
1. TypeScript/Next.js build succeeds.
2. Authentication and tenant boundary tests pass.
3. Arabic RTL, mobile, tablet and desktop layouts reviewed.
4. Bot returns authorized data only and offers support escalation when configured.
5. Deployment and rollback destination verified.
