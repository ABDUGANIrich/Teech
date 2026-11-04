# Teech

Teech is an AI-assisted learning app for turning a topic or study notes into
short, structured practice. Learn with **Sage**, then optionally teach what you
learned to **Pip** and receive feedback on your explanation.

**Production:** [teech-nu.vercel.app](https://teech-nu.vercel.app)

## What it does

- **Learn with Sage:** start with a topic or pasted notes, review an
  AI-generated course plan, and work through short lessons.
- **Practice, don't just read:** each lesson includes explanations, examples,
  concept checks, and an application problem.
- **Teach Pip:** turn completed Sage material into a reviewed teaching
  checklist, then explain it to Pip in the existing teaching flow.
- **Save and resume:** courses, topics, practice sessions, feedback, and
  progress are stored for signed-in users.
- **Public samples:** try the product without an account:
  - [`/teacher-sample`](https://teech-nu.vercel.app/teacher-sample) — a fixed
    Sage course demonstration.
  - [`/sample`](https://teech-nu.vercel.app/sample) — the Pip water-cycle
    sample. It uses live AI when configured or a clearly labeled preview.

AI-generated explanations and feedback can be incorrect. Teech does not claim
mastery, factual verification, or professional advice.

## Technology

- Next.js 16 with React 19 and TypeScript
- Supabase Auth and Postgres
- OpenRouter for structured AI responses
- Optional Keenable retrieval for current supporting material in Sage topic
  courses
- Tailwind CSS and Radix UI primitives
- Vitest and Playwright

## Local development

### Requirements

- Node.js 20+
- A Supabase project
- An OpenRouter API key for live AI behavior
- A Keenable API key only if supporting-material retrieval is enabled

Install dependencies and create local configuration:

```sh
npm ci
cp .env.example .env.local
```

Set the values in `.env.local`. The important settings are:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENROUTER_API_KEY=
OPENROUTER_MODEL=nvidia/nemotron-3.5-super-vl:free
OPENROUTER_ALLOWED_MODELS=nvidia/nemotron-3.5-super-vl:free
APP_URL=http://127.0.0.1:3000
ANONYMOUS_HASH_SECRET=
```

`SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `KEENABLE_API_KEY`, and
`ANONYMOUS_HASH_SECRET` are server-only secrets. Never prefix them with
`NEXT_PUBLIC_` or commit `.env.local`.

Apply the migrations in order to the target Supabase project:

```text
supabase/migrations/001_teech.sql
supabase/migrations/002_anonymous_daily_pool.sql
supabase/migrations/003_personal_minute_limit.sql
supabase/migrations/004_teacher_mode.sql
supabase/migrations/005_student_checkpoints.sql
```

For a new deployment, apply every migration. For an existing deployment, apply
only migrations that have not already been applied. If Keenable retrieval is
enabled, also apply the dated Keenable usage migration in
`supabase/migrations/`.

Start the development server:

```sh
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). `APP_URL` must exactly
match the origin used by the browser.

## Commands

```sh
npm run dev             # Start Next.js in development
npm run lint            # Run ESLint
npm run typecheck       # Run TypeScript checks
npm test                # Run Vitest
npm run test:e2e        # Build and run the default Playwright suite
npm run test:e2e:full   # Run the complete browser matrix
npm run build           # Create a production build
npm run start           # Serve the production build
```

The browser suite uses isolated local fixtures and does not prove that hosted
Supabase authentication, email delivery, or provider credentials are working.
After configuring a deployment, perform a small authenticated smoke test for
sign-up, course creation, practice, refresh/resume, deletion, and
cross-account isolation.

## Production deployment

Teech is deployed through **GitHub to Vercel**:

1. Apply any required Supabase migrations.
2. Run the relevant lint, type, unit, build, and browser checks.
3. Push the reviewed commit to the `master` branch.
4. Confirm that Vercel builds the commit and that the production URL serves it.

Configure these values in Vercel's **Production** environment, independently
from `.env.local`. Set `APP_URL` to the final HTTPS origin and configure the
same origin in Supabase Site URL and redirect settings. Enable email/password
authentication and use custom SMTP for reliable delivery.

The production deployment is a Node.js Next.js application; static export is
not supported. Keep purchased AI credits and automatic top-up disabled when
using the free-model configuration. OpenRouter and Keenable limits remain
authoritative, even when Teech's application quotas allow a request.

## Data and safety boundaries

- Personal routes require authentication; public samples do not create
  persistent personal accounts.
- Browser clients do not receive the Supabase service-role key, assessment
  answer keys, grading rubrics, or private provider credentials.
- AI requests are quota-limited and use server-side operation guards to avoid
  duplicate submissions.
- Notes, answers, and generated content are treated as untrusted text.
- Do not enable request-body logging in production.
- Deleting a user's account removes their personal learning data according to
  the configured Supabase relationships and retention policy.

## License

No open-source license has been declared for this repository. Contact the
repository owner before redistributing the code or product assets.
