const app = document.querySelector("#app");
const template = document.querySelector("#job-template");
let context;
let recognition;
let transcript = [];

const words = (text) => new Set((text || "").toLowerCase().match(/[a-z][a-z+#.-]{1,}/g) || []);
const intersection = (a, b) => [...a].filter((item) => b.has(item));

function offlineAnalyze(job, profile) {
  const pageWords = words(`${job.title} ${job.description}`);
  const skills = profile.skills || [];
  const matched = skills.filter((skill) => pageWords.has(skill.toLowerCase()));
  const seniorSignals = ["senior", "staff", "principal", "5+ years", "7+ years"];
  const isSenior = seniorSignals.some((term) => job.description.toLowerCase().includes(term));
  const score = Math.max(35, Math.min(94, 47 + matched.length * 8 + (isSenior ? -18 : 0)));
  const project = (profile.projects || [])[0];
  const strengths = [
    matched.length ? `Direct overlap: ${matched.join(", ")}.` : `Your project work is relevant to this product-building role.`,
    project ? `${project.name} gives you a concrete story about ${project.skills.join(", ")}.` : "Your experience gives you concrete delivery examples.",
    `Your target role (${profile.targetRole || "early-career engineering"}) aligns with this opportunity.`
  ];
  const gaps = [];
  if (!pageWords.has("typescript")) gaps.push("Confirm the required stack and learn any named tools before an interview.");
  if (isSenior) gaps.push("This posting signals seniority; prioritize similar intern/new-grad variants.");
  else gaps.push("Prepare one quantified impact story for each listed requirement.");
  const bullet = project
    ? `Built ${project.name}, a ${project.summary.replace(/^Built |^Created /, "").replace(/\.$/, "")}; applied ${project.skills.slice(0, 3).join(", ")} to deliver a user-focused product.`
    : "Add one truthful project bullet that mirrors the job’s most important technical requirement.";
  return { score, strengths, gaps, bullet, matched };
}

async function analyze(job, profile) {
  if (!profile.apiBaseUrl) return { ...offlineAnalyze(job, profile), mode: "offline", sources: [] };
  try {
    const response = await fetch(`${profile.apiBaseUrl.replace(/\/$/, "")}/api/agent`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "analyze", job, profile })
    });
    if (!response.ok) throw new Error("Live agent unavailable");
    const { analysis, sources } = await response.json();
    return { ...analysis, bullet: analysis.resumeBullet, matched: profile.skills || [], mode: "live", sources: sources || [] };
  } catch (error) {
    console.warn("Using RoleReady offline analysis", error);
    return { ...offlineAnalyze(job, profile), mode: "offline", sources: [] };
  }
}

function speak(text) {
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.04;
  speechSynthesis.speak(utterance);
}

async function render() {
  const { currentJob: job, candidateProfile: profile } = context;
  if (!job?.description) {
    app.innerHTML = `<section class="empty"><span>✦</span><h1>Open a job posting</h1><p>Visit LinkedIn, Greenhouse, Lever, or Simplify Jobs. RoleReady will read the role in context.</p></section>`;
    return;
  }
  const result = await analyze(job, profile);
  const fragment = template.content.cloneNode(true);
  fragment.querySelector(".job-title").textContent = job.title;
  fragment.querySelector(".company").textContent = `${job.company}${job.location ? ` · ${job.location}` : ""}`;
  fragment.querySelectorAll(".score").forEach((el) => el.textContent = `${result.score}%`);
  fragment.querySelector(".score-note").textContent = result.score > 70 ? "Strong application target" : "Worth a strategic look";
  fragment.querySelector(".strengths").innerHTML = result.strengths.map((x) => `<li>${x}</li>`).join("");
  fragment.querySelector(".gaps").innerHTML = result.gaps.map((x) => `<li>${x}</li>`).join("");
  fragment.querySelector(".resume-bullet").textContent = result.bullet;
  if (result.sources?.length) {
    const sources = fragment.querySelector("#sources");
    sources.classList.remove("hidden");
    sources.querySelector(".source-list").innerHTML = result.sources.map((source) => `<a target="_blank" rel="noreferrer" href="${source.url}"><b>${source.title}</b><span>${source.highlights?.[0] || "Open source"}</span></a>`).join("");
  }
  app.replaceChildren(fragment);
  document.querySelector("#save").onclick = () => saveApplication(job, result);
  document.querySelector("#practice").onclick = () => showPractice(job, profile, result);
}

function saveApplication(job, result) {
  chrome.runtime.sendMessage({ type: "SAVE_APPLICATION", application: { job, result, status: "saved" } }, () => {
    document.querySelector("#save").textContent = "✓ Saved — prep plan ready";
  });
}

function showPractice(job, profile, result) {
  const box = document.querySelector("#interview");
  const question = `Tell me about ${profile.projects?.[0]?.name || "a project"}. What problem did you solve, what was your specific contribution, and why is it relevant to the ${job.title} role at ${job.company}?`;
  document.querySelector("#question").textContent = question;
  box.classList.remove("hidden");
  box.scrollIntoView({ behavior: "smooth" });
  document.querySelector("#start").onclick = () => startInterview(question, job, result);
  document.querySelector("#finish").onclick = () => finishInterview(job, profile, result);
}

function startInterview(question, job, result) {
  transcript = [];
  document.querySelector("#start").textContent = "Listening…";
  document.querySelector("#finish").classList.remove("hidden");
  speak(`Thanks for joining. ${question}`);
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    document.querySelector("#transcript").textContent = "Voice recognition is not available in this browser. You can still describe your answer aloud, then select Finish for a demo feedback report.";
    return;
  }
  recognition = new Recognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onresult = (event) => {
    let text = "";
    for (let i = event.resultIndex; i < event.results.length; i++) text += event.results[i][0].transcript;
    transcript = [text];
    document.querySelector("#transcript").textContent = text;
  };
  recognition.start();
}

async function finishInterview(job, profile, result) {
  recognition?.stop();
  const answer = transcript.join(" ");
  const answerWords = words(answer);
  let score = Math.min(95, Math.max(52, 55 + (answer.length > 120 ? 12 : 0) + (intersection(answerWords, new Set(result.matched.map((x) => x.toLowerCase()))).length * 6)));
  let coachText = `Lead with the situation, name your exact contribution, then quantify the outcome. Connect it explicitly to ${job.company}’s needs: ${result.matched.join(", ") || "the role’s core skills"}.`;
  let nextQuestion = "Tell me about a technical decision you made under ambiguity and how you measured whether it worked.";
  let strengths = [];
  if (profile.apiBaseUrl) {
    try {
      const response = await fetch(`${profile.apiBaseUrl.replace(/\/$/, "")}/api/agent`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "interview-feedback", job, profile, answer, previousQuestion: document.querySelector("#question").textContent }) });
      const { feedback } = await response.json();
      if (feedback) { score = feedback.score; coachText = feedback.improvements?.join(" ") || feedback.summary; nextQuestion = feedback.nextQuestion || nextQuestion; strengths = feedback.strengths || []; }
    } catch { /* The offline rubric remains available for a reliable demo. */ }
  }
  const feedback = document.querySelector("#feedback");
  feedback.innerHTML = `<p class="eyebrow">INTERVIEW FEEDBACK</p><h2>${score}/100 — ${score > 75 ? "Strong foundation" : "Practice your structure"}</h2><div class="rubric"><p><b>Relevance</b><span>${Math.min(5, Math.round(score / 20))}/5</span></p><p><b>STAR structure</b><span>${answer.length > 160 ? "4/5" : "3/5"}</span></p><p><b>Technical evidence</b><span>${result.matched.length ? "4/5" : "3/5"}</span></p></div>${strengths.length ? `<h3>What worked</h3><p>${strengths.join(" ")}</p>` : ""}<h3>Coach’s next step</h3><p>${coachText}</p><h3>Next question</h3><p>${nextQuestion}</p>`;
  feedback.classList.remove("hidden");
  speak(`Interview complete. Your score is ${score} out of 100. Your biggest opportunity is to lead with your individual contribution and a measurable outcome.`);
}

document.querySelector("#settings").onclick = () => chrome.runtime.openOptionsPage();
document.querySelector("#dashboard").onclick = () => chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
chrome.runtime.sendMessage({ type: "GET_CONTEXT" }, (data) => { context = data; render(); });
