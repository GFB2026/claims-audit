# claims-audit

Independently verify what someone is telling you, **before** you sign, hire, or invest — not after.

Not a harness demo. A workflow built and proven on a real target (see [examples/](examples/)) that fans out research, extracts falsifiable claims, and adversarially verifies each one with three independent reviewers instructed to *disprove it first*.

---

## Why this exists

Every vendor pitch, funding announcement, and resume makes claims a buyer can't easily check — security certifications, revenue growth, "world's largest" superlatives, a founder's track record. Diligence is supposed to catch the ones that don't hold up, but manual diligence is slow and usually just re-reads the same press release three times.

This does the chase — search, fetch, extract, adversarially verify, synthesize — in about an hour, and it does not take a subject's own materials as proof of themselves. A claim only survives if independent evidence backs it; the default when uncertain is "unverified," not "probably fine."

## What it found on a real run

Run against a real, named, actively-fundraising AI startup (identity redacted here — see [examples/sample-report.md](examples/sample-report.md) for the full report):

- ✅ Founder's prior industry role — independently confirmed across 3 separate professional-data sources, not just their bio page
- ✅ Funding amount and lead investors — confirmed via primary press release + 8 independent syndicating outlets
- ✅ Company's legal existence and named officers — confirmed via a public regulatory filing, not press alone
- ❌ "World's largest and fastest-growing [X] library" — no independent source corroborates it; a named competitor's own public numbers, converted to the same unit, imply the opposite
- ❌ "30x revenue growth," "200%+ NRR," "100% renewal rate" — appear only in the company's own announcement; zero independent confirmation of any of the three

That's the shape of the output: specific claims, specific verdicts, specific sources — not a vibe.

## Honest scope

- This is a [Claude Code](https://claude.com/claude-code) **Workflow script** — it runs inside Claude Code's multi-agent orchestration runtime, not as a standalone CLI/binary. You need Claude Code to run it.
- It audits **public claims only**. It is not a SOC 2 report review, a signed security questionnaire, a reference call, or contract-term legal review — it tells you where to focus those, and sometimes surfaces a reason to push harder before signing.
- "Unverified" does not mean "false." It means no independent source could confirm it at the time of the audit — treat it as a question to ask directly, not a settled negative.

## Try it

```js
Workflow({
  scriptPath: "workflows/vendor-claims-audit.js",
  args: { vendor: "Acme Corp", url: "https://acme.com" },
})
```

Five phases — Scope → Search → Fetch → Verify → Synthesize — five procurement risk categories (security & compliance, company viability, customer references, product/technical claims, support & pricing), each claim checked by 3 independent adversarial passes before it's marked substantiated. Output maps onto [`REPORT_TEMPLATE.md`](REPORT_TEMPLATE.md).

See [`PACKAGING.md`](PACKAGING.md) for how this scales to other lanes (ad-claims substantiation, executive background checks, competitive-intel monitoring) — same engine, different claim schema.

---

## Identity

> I run companies with agents in production — mail, desk, money, human gates. This is the diligence layer for claims those agents (or anyone) get told.

X: [@gregfredabytes](https://x.com/gregfredabytes) · GitHub: [GFB2026](https://github.com/GFB2026)

## License

MIT
