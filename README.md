# RoleReady

**A browser-native job-search and interview practice agent.** RoleReady pairs an in-context job-page scout with a persistent Career Command Center. It reads opportunities where candidates already discover them, grounds recommendations in real evidence, and turns an application into an interview-practice plan.

Built from scratch at AI Tinkerers, September 12, 2026.

## Why a browser extension?

The job page is essential context: title, company, requirements, location, and source URL are captured where the candidate already works. RoleReady is not a generic chatbox placed beside a web page; its workflow starts from and reacts to the opportunity the user is actively considering.

## Working prototype

1. Open a supported job post on LinkedIn, Greenhouse, Lever, or Simplify Jobs.
2. Click the RoleReady extension icon to open the side panel.
3. Review the evidence-grounded role fit, gaps, and tailored resume angle.
4. Save the opportunity and start a voice mock interview.
5. Receive a transcript and structured feedback report.

## Career Command Center

Click the grid icon in the side panel to open the shared-data command center. It includes:

- **Best matches:** opportunities ranked by evidence-grounded fit.
- **Pipeline:** saved, applied, assessment, interview, and offer stages.
- **Calendar:** assessment, interview, and follow-up milestones set per job.
- **Evidence vault:** the candidate facts RoleReady is permitted to use.
- **Preparation plan:** a truthful application angle, a fast proof-of-work sprint, a role-specific knowledge check, and public research sources.

The prototype ships with a clearly labelled demo candidate profile. Edit it from **Extension options** before demonstrating your own profile.

### Optional live-agent mode

The extension remains usable without cloud services. To enable live analysis and sourced public interview research, deploy this repository to Vercel and add `OPENROUTER_API_KEY`, `EXA_API_KEY`, and `ALLOWED_EXTENSION_ORIGIN` as server-side environment variables. Set the last value to `chrome-extension://<your Chrome extension ID>`. Then add the deployed URL in Extension options. Never place either key in the extension or commit it to GitHub.

## Install locally in Chrome

1. Download or clone this repository.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Select **Load unpacked** and choose this repository's root folder.
4. Open a supported job post, then click the RoleReady icon.
5. Allow microphone access when you start the mock interviewer.

## Privacy and truthfulness

- Candidate profile data stays in `chrome.storage.local` in this prototype.
- RoleReady does not submit applications or fabricate credentials.
- Resume suggestions must be reviewed by the candidate before use.
- The current prototype is deterministic and offline-first so the full demo works without API keys. Exa-backed source citations and OpenRouter orchestration are the planned live-data integrations.

## Architecture

```text
Job-board DOM → content script → shared extension storage → side panel scout
                                                       ├─ evidence-grounded fit analysis
                                                       ├─ save application state
                                                       └─ voice mock interviewer + rubric
                                                               │
                                                               ▼
                                                   Career Command Center
                                                   ├─ ranked opportunities
                                                   ├─ application pipeline + calendar
                                                   └─ preparation plans + knowledge checks
```

## Demo script

Open a job post and say: “RoleReady meets candidates on the page where a decision starts.” Open the side panel, show the fit evidence and truthful tailored bullet, then press **Practice with voice interviewer**. Answer briefly, select **Finish & get feedback**, and show the rubric.

## Roadmap

- Exa: retrieve publicly available company and interview-prep sources with citations.
- OpenRouter: orchestrate grounded job matching, tailored writing, and adaptive follow-up questions.
- Companion dashboard: saved applications, feedback history, and a candidate-controlled evidence vault.

## Team

Built solo by [RalphNabh](https://github.com/RalphNabh).
