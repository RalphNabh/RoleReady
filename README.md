# RoleReady

**An evidence-first job companion for technical interns and new grads.**

RoleReady starts where candidates already make decisions: on the job page. Its Chrome extension turns a posting into a truthful Proof Map; its web command center turns that map into a focused application, project sprint, coding assessment, and spoken interview practice.

Built solo at AI Tinkerers, September 12, 2026.

## What works

- **Chrome extension:** reads supported LinkedIn, Greenhouse, Lever, Simplify, and Google Careers pages in context. Structured `JobPosting` data is preferred when present; Proof Map requirements can jump back to the matching page text.
- **Guided evidence onboarding:** a four-step first-run flow collects career focus, selected public GitHub repositories, a private resume or LinkedIn CSV export, and an optional LinkedIn reference link. Each source stays separate until the candidate explicitly approves the exact facts to use.
- **Evidence Vault:** users can refresh selected public GitHub projects or replace their private resume/export when their work changes. RoleReady proposes claims, but only user-approved items become evidence.
- **Sourced discovery:** the public Simplify tracker is ranked against confirmed evidence. Users can also connect official public Greenhouse and Lever job boards, with source and freshness labels.
- **Role workspace:** persistent pipeline, real milestones, Proof Sprints, source-ranked Company Intelligence, and a customizable truthful Application Studio with print-to-PDF and DOCX export.
- **Assessment room:** an adaptive three-challenge original practice set in JavaScript, TypeScript, Python, Java, C++, and C#. Hidden Piston checks run server-side; RoleReady stores result summaries, never raw code.
- **Interview meeting:** an animated, voice-led four-turn interview with an optional local-only camera preview, transient audio, typed fallback, and an opt-in private scorecard.
- **Reminders:** optional Resend emails 3 days, 1 day, and the morning of a milestone; duplicate deliveries are prevented.

## Setup

### 1. Deploy to Vercel

Import this public GitHub repository into Vercel. Set the project’s root directory to this folder if Vercel asks.

### 2. Create Supabase data and GitHub login

1. Create a Supabase project.
2. Open **SQL Editor**, paste and run [`supabase/schema.sql`](supabase/schema.sql).
3. In **Authentication → Providers**, enable GitHub and provide the GitHub OAuth client credentials.
4. Add your deployed URL as the Supabase Site URL and redirect URL.
5. In Vercel, add `SUPABASE_URL` and `SUPABASE_ANON_KEY` from Supabase **Project Settings → API**.

The Supabase anon key is a public client identifier; the included row-level-security policies keep each person’s data private.

### 3. Add Vercel environment variables

Copy all variable names from [`.env.example`](.env.example) into **Vercel → Project → Settings → Environment Variables**:

```text
OPENROUTER_API_KEY
EXA_API_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
APP_URL=https://your-project.vercel.app
ALLOWED_EXTENSION_ORIGIN=chrome-extension://your-extension-id
RESEND_API_KEY
REMINDER_FROM=RoleReady <reminders@your-domain.com>
CRON_SECRET
```

Optional audio-model variables have sensible defaults in `.env.example`. Do not commit or paste private keys into the extension.

### 4. Use the extension

1. Open `chrome://extensions`, enable Developer mode, and **Load unpacked** using this repository folder.
2. Copy the extension ID.
3. Add `chrome-extension://<your-id>` as `ALLOWED_EXTENSION_ORIGIN` in Vercel.
4. In the signed-in web app, open **Evidence Vault → Connect Chrome** and generate a one-time workspace connection key.
5. In **Extension options**, add your Vercel deployment URL and paste that key. The extension then analyzes roles against only your confirmed cloud evidence.
6. Open a supported job page, open RoleReady, analyze it, save it, and select **Open Command Center**.

The command center receives the saved job context. Sign in with GitHub to persist it to your own Supabase workspace.

## Two-minute demo

1. On a real job page, open the extension and show the Proof Map: Proven, Partial, and Gap—not a generic match score.
2. Show the Recruiter Lens and Exa-backed, dated company intelligence.
3. Save the role and open the command center; show the imported job workspace and a Proof Sprint.
4. Open the Application Studio, select verified evidence, and export a reviewed application kit.
5. Open the six-language assessment and run a short JavaScript or Python solution through hidden checks.
6. Join the four-turn interview meeting; show a role-aware question and final scorecard.

## Architecture

```text
Job-board DOM → Chrome extension → paired extension key → OpenRouter + Exa analysis
                                                           ↓
             Simplify tracker / official Greenhouse / Lever → RoleReady web command center
                                                           ↓
     Supabase (GitHub auth, RLS data, approved evidence, private resume storage)
                                                           ↓
    Assessment proxy → Piston sandbox | Voice → OpenRouter STT/LLM/TTS | Email → Resend
```

## Privacy and integrity

- No automatic applications or mass autofill.
- Unconfirmed resume/LinkedIn material cannot become Proof Map evidence.
- LinkedIn profile URLs are saved only as a candidate-owned reference; RoleReady does not scrape LinkedIn. Public GitHub repository metadata and README text can be refreshed only for repositories the candidate selects.
- Company/interview research is identified as public reporting, not private company knowledge.
- Microphone audio is held only for the active transcription request; it is not persisted.
- The public Piston endpoint is rate-limited and is used only for low-volume hackathon practice. Production should use a dedicated sandbox deployment.
- Chrome Web Store release: use `npm run package:extension` to create `dist/roleready-chrome-extension.zip`. Its static listing icon assets live in `assets/icon16.png`, `assets/icon48.png`, and `assets/icon128.png`; host the included [`privacy.html`](privacy.html) as the listing’s privacy-policy URL. Set `ALLOWED_EXTENSION_ORIGIN` to the final store extension ID before enabling live analysis for others.
