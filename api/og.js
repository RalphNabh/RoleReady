import React from "react";
import { ImageResponse } from "@vercel/og";

const h = React.createElement;
const ROLE_READY_MARK = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgdmlld0JveD0iMCAwIDUxMiA1MTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPHJlY3Qgd2lkdGg9IjUxMiIgaGVpZ2h0PSI1MTIiIHJ4PSIxMzYiIGZpbGw9IiMxNzIwMzMiLz4KICA8cGF0aCBkPSJNMzgyIDE0MkMzNDcgMTA2IDI5OSA4NCAyNDYgODRDMTM5IDg0IDUyIDE3MSA1MiAyNzhDNTIgMzM3IDc4IDM5MCAxMjAgNDI2IiBzdHJva2U9IiM2RTk4RkYiIHN0cm9rZS13aWR0aD0iMzAiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgogIDxwYXRoIGQ9Ik0xMjAgNDI2TDExMyAzMzhMMTk5IDM4OUwxMjAgNDI2WiIgZmlsbD0iIzZFOThGRiIvPgogIDxwYXRoIGQ9Ik0xNjYgMTQySDI2NUMzMzUgMTQyIDM3NyAxNzcgMzc3IDIzOEMzNzcgMjc3IDM1OCAzMDUgMzI2IDMyMUwzODkgMzk2SDMwNUwyNTIgMzM3SDIzMFYzOTZIMTY2VjE0MlpNMjMwIDE5NlYyODRIMjYwQzI5MyAyODQgMzEyIDI3MCAzMTIgMjQxQzMxMiAyMTEgMjkzIDE5NiAyNjAgMTk2SDIzMFoiIGZpbGw9IndoaXRlIi8+CiAgPGNpcmNsZSBjeD0iMzgyIiBjeT0iMTQyIiByPSIxOCIgZmlsbD0iI0E3QzBGRiIvPgo8L3N2Zz4K";

function proofRow(label, status, accent) {
  return h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderTop: "1px solid #e5eaf2", fontSize: 20, color: "#24334a" } },
    h("div", { style: { display: "flex", alignItems: "center", gap: 12 } },
      h("div", { style: { width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 99, background: accent === "green" ? "#e8f7ef" : "#fff0e3", color: accent === "green" ? "#147a57" : "#b96512", fontSize: 10, fontWeight: 800 } }, accent === "green" ? "OK" : "!"),
      h("span", null, label)
    ),
    h("span", { style: { padding: "5px 9px", borderRadius: 99, background: accent === "green" ? "#e8f7ef" : "#fff0e3", color: accent === "green" ? "#147a57" : "#b96512", fontSize: 13, fontWeight: 800, letterSpacing: 0.6 } }, status)
  );
}

export default async function handler(_req, res) {
  const image = new ImageResponse(
    h("div", { style: { width: "100%", height: "100%", display: "flex", overflow: "hidden", background: "linear-gradient(135deg, #eaf3ff 0%, #f8fbff 48%, #edf5ff 100%)", color: "#172842", fontFamily: "sans-serif" } },
      h("div", { style: { width: "100%", height: "100%", display: "flex", padding: "66px 72px", position: "relative" } },
        h("div", { style: { position: "absolute", width: 580, height: 580, borderRadius: 9999, background: "radial-gradient(circle, rgba(82, 140, 231, 0.25), rgba(82, 140, 231, 0))", right: -175, top: -260 } }),
        h("div", { style: { width: "57%", display: "flex", flexDirection: "column", justifyContent: "space-between" } },
          h("div", { style: { display: "flex", alignItems: "center", gap: 14, fontSize: 28, fontWeight: 800, letterSpacing: -1 } },
            h("img", { src: ROLE_READY_MARK, width: 48, height: 48 }),
            h("span", null, "RoleReady")
          ),
          h("div", { style: { display: "flex", flexDirection: "column" } },
            h("div", { style: { display: "flex", alignItems: "center", gap: 9, color: "#4876ad", fontSize: 16, fontWeight: 800, letterSpacing: 2 } },
              h("span", { style: { width: 9, height: 9, borderRadius: 99, background: "#3a7cdf", display: "flex" } }),
              "THE EVIDENCE-FIRST CAREER AGENT"
            ),
            h("div", { style: { display: "flex", flexDirection: "column", marginTop: 22, fontSize: 64, lineHeight: 1.02, letterSpacing: -3.5, fontWeight: 750 } },
              h("span", null, "Know what a job will"),
              h("span", { style: { color: "#326fd0" } }, "question. Before they do.")
            ),
            h("p", { style: { margin: "22px 0 0", maxWidth: 520, color: "#5b6c83", fontSize: 22, lineHeight: 1.45 } }, "A truthful Proof Map for every job you are considering.")
          ),
          h("div", { style: { display: "flex", gap: 12, color: "#677890", fontSize: 17 } },
            h("span", null, "Proof Map"), h("span", null, "·"), h("span", null, "Recruiter Lens"), h("span", null, "·"), h("span", null, "Proof Sprints")
          )
        ),
        h("div", { style: { alignSelf: "center", width: "43%", display: "flex", flexDirection: "column", padding: "22px 27px", border: "1px solid #cbd8eb", borderRadius: 22, background: "rgba(255,255,255,.92)", boxShadow: "0 25px 55px rgba(35, 67, 109, .16)" } },
          h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 18 } },
            h("div", { style: { display: "flex", alignItems: "center", gap: 10 } }, h("img", { src: ROLE_READY_MARK, width: 32, height: 32 }), h("span", { style: { fontSize: 18, fontWeight: 800 } }, "RoleReady")),
            h("span", { style: { color: "#5d7593", fontSize: 12, fontWeight: 800, letterSpacing: 1 } }, "LIVE CONTEXT")
          ),
          h("p", { style: { margin: "7px 0 2px", color: "#647995", fontSize: 13, fontWeight: 800, letterSpacing: 1.2 } }, "EVIDENCE FIT"),
          h("div", { style: { display: "flex", alignItems: "baseline", gap: 8, paddingBottom: 13 } }, h("span", { style: { color: "#17325e", fontSize: 52, fontWeight: 800, letterSpacing: -2 } }, "76%"), h("span", { style: { color: "#23785b", fontSize: 15, fontWeight: 700 } }, "two proof gaps")),
          h("div", { style: { display: "flex", flexDirection: "column", padding: "14px", border: "1px solid #eadfbf", borderRadius: 12, background: "#fffaf0", color: "#4b432f" } },
            h("span", { style: { color: "#a57520", fontSize: 12, fontWeight: 800, letterSpacing: 1 } }, "RECRUITER LENS"),
            h("span", { style: { marginTop: 6, fontSize: 17, fontWeight: 700 } }, "Make algorithms evidence obvious.")
          ),
          h("div", { style: { display: "flex", flexDirection: "column", marginTop: 13 } },
            h("span", { style: { color: "#647995", fontSize: 12, fontWeight: 800, letterSpacing: 1 } }, "PROOF MAP"),
            proofRow("Programming", "PROVEN", "green"), proofRow("Algorithms", "GAP", "amber"), proofRow("Testing", "GAP", "amber")
          )
        )
      )
    ),
    { width: 1200, height: 630 }
  );
  const body = Buffer.from(await image.arrayBuffer());
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  return res.status(200).send(body);
}
