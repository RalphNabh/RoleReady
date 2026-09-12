# RoleReady

**An evidence-first job companion for technical interns and new grads.**

RoleReady starts where candidates already make decisions: on the job page. Its Chrome extension turns a posting into a truthful Proof Map; its web command center turns that map into a focused application, project sprint, coding assessment, and spoken interview practice.

Built solo at AI Tinkerers, September 12, 2026.

## What works

- **Chrome extension:** reads supported LinkedIn, Greenhouse, Lever, and Simplify job pages in context; returns evidence-grounded fit, recruiter lens, Proof Map, cited company intelligence, and a truthful resume angle.
- **Cloud command center:** GitHub sign-in, verified Evidence Vault, saved jobs, pipeline, calendar, job workspace, and context imported directly from the extension.
- **Proof Sprints:** turn a visible gap into a small deliverable without inventing credentials.
- **Assessment room:** original coding exercise in JavaScript, TypeScript, Python, Java, C++, and C#. Submissions run only through a server-side proxy to Piston; raw code is not stored.
- **Voice interview room:** uses OpenRouter for transcription, adaptive interview feedback, and speech synthesis, with native browser voice as a resilient fallback. Raw audio is not stored.
- **Company intelligence:** Exa research is displayed with a URL, date, and `Publicly reported` label.

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
APP_URL=https://your-project.vercel.app
ALLOWED_EXTENSION_ORIGIN=chrome-extension://your-extension-id
```

Optional audio-model variables have sensible defaults in `.env.example`. Do not commit or paste private keys into the extension.

### 4. Use the extension

1. Open `chrome://extensions`, enable Developer mode, and **Load unpacked** using this repository folder.
2. Copy the extension ID.
3. Add `chrome-extension://<your-id>` as `ALLOWED_EXTENSION_ORIGIN` in Vercel.
4. In **Extension options**, add your Vercel deployment URL as the live agent URL.
5. Open a supported job page, open RoleReady, analyze it, save it, and select **Open Command Center**.

The command center receives the saved job context. Sign in with GitHub to persist it to your own Supabase workspace.

## Two-minute demo

1. On a real job page, open the extension and show the Proof Map: Proven, Partial, and Gap—not a generic match score.
2. Show the Recruiter Lens and Exa-backed, dated company intelligence.
3. Save the role and open the command center; show the imported job workspace and a Proof Sprint.
4. Open the six-language assessment and run a short JavaScript or Python solution.
5. Start the spoken interview; answer one question and show feedback tied to that role’s evidence.

## Architecture

```text
Job-board DOM → Chrome extension → OpenRouter + Exa analysis
                                  ↓
                         RoleReady web command center
                                  ↓
        Supabase (GitHub auth, RLS data, private resume storage)
                                  ↓
         Assessment proxy → Piston sandbox | Voice → OpenRouter STT/LLM/TTS
```

## Privacy and integrity

- No automatic applications or mass autofill.
- Unconfirmed resume/LinkedIn material cannot become Proof Map evidence.
- Company/interview research is identified as public reporting, not private company knowledge.
- Microphone audio is held only for the active transcription request; it is not persisted.
- The public Piston endpoint is rate-limited and is used only for low-volume hackathon practice. Production should use a dedicated sandbox deployment.
