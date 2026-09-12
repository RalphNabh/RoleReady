# RoleReady

**A browser-native job-search and interview practice agent.** RoleReady appears while a candidate is already viewing a job posting, reads the role in context, grounds recommendations in the candidate's real evidence, and turns an application into an interview-practice plan.

Built from scratch at AI Tinkerers, September 12, 2026.

## Why a browser extension?

The job page is essential context: title, company, requirements, location, and source URL are captured where the candidate already works. RoleReady is not a generic chatbox placed beside a web page; its workflow starts from and reacts to the opportunity the user is actively considering.

## Working prototype

1. Open a supported job post on LinkedIn, Greenhouse, Lever, or Simplify Jobs.
2. Click the RoleReady extension icon to open the side panel.
3. Review the evidence-grounded role fit, gaps, and tailored resume angle.
4. Save the opportunity and start a voice mock interview.
5. Receive a transcript and structured feedback report.

The prototype ships with a clearly labelled demo candidate profile. Edit it from **Extension options** before demonstrating your own profile.

### Optional live-agent mode

The extension remains usable without cloud services. To enable live analysis and sourced public interview research, deploy this repository to Vercel and add `OPENROUTER_API_KEY` and `EXA_API_KEY` as server-side environment variables. Then add the deployed URL in Extension options. Never place either key in the extension or commit it to GitHub.

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
Job-board DOM → content script → extension storage → side panel agent
                                                  ├─ evidence-grounded fit analysis
                                                  ├─ save application state
                                                  └─ voice mock interviewer + rubric
```

## Demo script

Open a job post and say: “RoleReady meets candidates on the page where a decision starts.” Open the side panel, show the fit evidence and truthful tailored bullet, then press **Practice with voice interviewer**. Answer briefly, select **Finish & get feedback**, and show the rubric.

## Roadmap

- Exa: retrieve publicly available company and interview-prep sources with citations.
- OpenRouter: orchestrate grounded job matching, tailored writing, and adaptive follow-up questions.
- Companion dashboard: saved applications, feedback history, and a candidate-controlled evidence vault.

## Team

Built solo by [RalphNabh](https://github.com/RalphNabh).
