# SEER architecture

## Boundaries
- Next.js App Router: UI and authenticated server handlers.
- Supabase Auth: identity; membership records are the source of authorization.
- Postgres: multi-tenant records, enforced by RLS and scoped foreign keys.
- AI assistant: separate server-only adapter with scoped retrieval, allowlisted tools, audit logs, and explicit confirmation for writes. Never place model keys in NEXT_PUBLIC variables.
- Billing and WhatsApp: server-side providers with verified webhook signatures and idempotency.

## Release gates
1. Fix organization-scoped foreign keys for child/guardian/branch references before enabling writes.
2. Add owner/admin provisioning and role-specific RLS; verify cross-tenant denial.
3. Create a real AI provider adapter and data minimization policy before allowing live assistant answers.
4. Accessibility and responsive checks at 375, 768, 1024 and 1440px.
5. CI typecheck, tests, dependency review and production smoke tests.

## Current scope
The assistant UI is an explicit non-AI placeholder. No payment, AI, messaging or external action is enabled.
