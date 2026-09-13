export const meta = {
  name: 'vendor-claims-audit',
  description: 'Procurement due-diligence: independently verify a vendor\'s public claims (security, viability, customers, SLAs) before you sign',
  phases: [
    { title: 'Scope' },
    { title: 'Search' },
    { title: 'Fetch' },
    { title: 'Verify' },
    { title: 'Synthesize' },
  ],
}

const CATEGORIES = [
  { key: 'security_compliance', label: 'Security & compliance (SOC2/ISO/PCI certifications, data handling, breach history, security trust pages)' },
  { key: 'company_viability', label: 'Company viability (funding, headcount, years operating, financial stability, ownership/parent company)' },
  { key: 'customer_references', label: 'Customer base & references (named logos, customer counts, case studies, testimonials)' },
  { key: 'product_technical', label: 'Product & technical claims (integrations, performance benchmarks, uptime/SLA numbers, roadmap promises)' },
  { key: 'support_pricing', label: 'Support & pricing claims (response-time SLAs, guarantees, published pricing, contract terms)' },
]

function hostnameOf(u) {
  try { return new URL(u).hostname } catch (e) { return String(u).slice(0, 40) }
}

// Loose normalization so near-identical claim phrasing across sources (e.g. "SOC 2 Type II" vs
// "SOC2 Type 2 certified") collapses to the same dedup key instead of burning separate verify budget.
function normalizeClaimKey(claim) {
  return String(claim || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const SEARCH_SCHEMA = {
  type: 'object',
  properties: {
    urls: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          note: { type: 'string', description: 'Why this source is relevant to this risk category' },
        },
        required: ['url'],
      },
    },
  },
  required: ['urls'],
}

const CLAIMS_SCHEMA = {
  type: 'object',
  properties: {
    sourceQuality: { type: 'string', enum: ['vendor-primary', 'independent-review', 'press', 'regulatory-filing', 'social', 'unreliable'] },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string', description: 'One specific, falsifiable claim the vendor (or a review site) makes about them, in your own words' },
          category: { type: 'string', enum: CATEGORIES.map(c => c.key) },
          quote: { type: 'string', description: 'The exact supporting text from the page' },
        },
        required: ['claim', 'category', 'quote'],
      },
    },
  },
  required: ['claims', 'sourceQuality'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    refuted: { type: 'boolean', description: 'true if independent evidence contradicts this claim, or no independent source can substantiate it beyond the vendor\'s own word. Default to true when genuinely uncertain.' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    evidence: { type: 'string', description: 'What you found and why it does or does not substantiate the claim' },
    counterSource: { type: 'string', description: 'URL of any contradicting or corroborating independent source, or the literal text "none found"' },
  },
  required: ['refuted', 'confidence', 'evidence'],
}

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    vendor: { type: 'string' },
    overallRisk: { type: 'string', enum: ['low', 'medium', 'high'] },
    overallRiskRationale: { type: 'string', description: 'One paragraph explaining the risk rating, naming the specific categories and claims that drove it. Must reference the actual findings supplied, never generic boilerplate.' },
    categories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          verdict: { type: 'string', enum: ['substantiated', 'partially substantiated', 'unsubstantiated', 'no claims found'] },
          findings: { type: 'string', description: 'The specific claims found in this category and what corroborated or contradicted each, citing sources by domain' },
        },
        required: ['category', 'verdict', 'findings'],
      },
    },
    redFlags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Specific unsubstantiated or contradicted claims that materially raise procurement risk. Each item names the actual claim and why it matters. Empty array if none.',
    },
    confirmedStrengths: {
      type: 'array',
      items: { type: 'string' },
      description: 'Specific claims that were independently corroborated. Each item names the actual claim. Empty array if none.',
    },
    recommendation: { type: 'string', enum: ['proceed', 'proceed with conditions', 'request additional diligence', 'do not proceed'] },
    recommendationRationale: { type: 'string', description: 'One to two sentences justifying the recommendation, referencing the actual findings.' },
  },
  required: ['vendor', 'overallRisk', 'overallRiskRationale', 'categories', 'redFlags', 'confirmedStrengths', 'recommendation', 'recommendationRationale'],
}

phase('Scope')
const vendorLabel = typeof args === 'string' ? args : (args && (args.vendor || args.url || args.vendorUrl))
if (!vendorLabel) {
  throw new Error('Pass the vendor as args, e.g. Workflow({ scriptPath, args: { vendor: "Acme Corp", url: "https://acme.com" } }) or args: "Acme Corp https://acme.com"')
}
log(`Auditing vendor: ${vendorLabel}`)

phase('Search')
const searchResults = await parallel(CATEGORIES.map(cat => () =>
  agent(
    `You are researching a vendor "${vendorLabel}" for a procurement due-diligence audit. Find sources relevant to this risk category: ${cat.label}. Use WebSearch (and WebFetch if useful) to find BOTH the vendor's own claims (site, docs, press, trust/security page) AND independent sources (review sites like G2/Capterra/TrustRadius/Trustpilot, news, regulatory filings, security disclosure sites, third-party audits, complaint boards) that could corroborate or contradict those claims. Return the best 3-5 URLs with a one-line note on relevance.`,
    { label: `search:${cat.key}`, phase: 'Search', schema: SEARCH_SCHEMA }
  ).then(r => ({ category: cat.key, urls: (r && r.urls) || [] }))
))

const seenUrls = new Set()
const toFetch = []
let totalFound = 0
for (const { category, urls } of searchResults) {
  totalFound += urls.length
  for (const u of urls) {
    if (!u.url || seenUrls.has(u.url)) continue
    seenUrls.add(u.url)
    toFetch.push({ url: u.url, note: u.note, category })
  }
}
log(`${toFetch.length} unique sources to fetch (${totalFound - toFetch.length} duplicate URLs dropped across categories)`)

phase('Fetch')
const extracted = await pipeline(
  toFetch,
  item => agent(
    `Fetch ${item.url} (found for procurement risk category: ${item.category}, note: ${item.note || 'n/a'}). Extract every specific, falsifiable claim about the vendor "${vendorLabel}" that a procurement/security/legal reviewer would care about: security certifications, uptime/SLA numbers, customer counts or named customers, funding/financial stability, integration/technical capability claims, support response times, pricing guarantees. Quote the exact supporting text for each claim. If this is a review site, extract BOTH vendor-favorable and vendor-unfavorable claims/complaints — complaints are claims too (e.g. "multiple reviewers report support response times far exceeding the advertised SLA"). If nothing relevant is on the page, return an empty claims array — do not invent claims.`,
    { label: `fetch:${hostnameOf(item.url)}`, phase: 'Fetch', schema: CLAIMS_SCHEMA }
  ).then(r => (r || { claims: [], sourceQuality: 'unreliable' }))
)

const seenClaimText = new Set()
const allClaims = []
extracted.forEach((r, i) => {
  if (!r) return
  const src = toFetch[i]
  for (const c of (r.claims || [])) {
    const key = normalizeClaimKey(c.claim)
    if (!key || seenClaimText.has(key)) continue
    seenClaimText.add(key)
    allClaims.push({ ...c, source: src.url, sourceQuality: r.sourceQuality })
  }
})
log(`${allClaims.length} distinct claims extracted across ${toFetch.length} sources`)

const MAX_VERIFY = 90
let claimsToVerify = allClaims
if (allClaims.length > MAX_VERIFY) {
  log(`capping verification at ${MAX_VERIFY} claims (${allClaims.length - MAX_VERIFY} lower-priority claims skipped — vendor-primary claims and security/viability categories prioritized)`)
  const priority = c => (c.category === 'security_compliance' || c.category === 'company_viability' ? 0 : 1)
  claimsToVerify = [...allClaims].sort((a, b) => priority(a) - priority(b)).slice(0, MAX_VERIFY)
}

phase('Verify')
const verified = await pipeline(
  claimsToVerify,
  claim => parallel(Array.from({ length: 3 }, (_, i) =>
    () => agent(
      `Adversarially verify this claim about vendor "${vendorLabel}", made for a procurement due-diligence audit: "${claim.claim}" (category: ${claim.category}, source: ${claim.source}, supporting quote: "${claim.quote}"). Use WebSearch/WebFetch to independently corroborate or refute it — do not just trust the quote or the vendor's own site. A vendor's own marketing page or the source page itself never counts as independent corroboration of its own claim. Default to refuted=true if you cannot find independent corroboration.`,
      { label: `verify:${i}`, phase: 'Verify', schema: VERDICT_SCHEMA }
    )
  )).then(votes => {
    const valid = votes.filter(Boolean)
    const refuteCount = valid.filter(v => v.refuted).length
    return { ...claim, votes: valid, refuted: refuteCount >= 2 }
  })
)

const confirmed = verified.filter(c => c && !c.refuted)
const killed = verified.filter(c => c && c.refuted)
log(`${confirmed.length} claims substantiated, ${killed.length} claims failed independent verification`)

phase('Synthesize')
const report = await agent(
  `Write a procurement due-diligence report on vendor "${vendorLabel}". Every field in your answer must be derived from the specific claims listed below — never write placeholder, generic, or example text, and never invent a claim not listed here.

SUBSTANTIATED CLAIMS (independently corroborated by at least 2 of 3 verifiers):
${JSON.stringify(confirmed.map(c => ({ claim: c.claim, category: c.category, source: c.source, evidence: c.votes.map(v => v.evidence).join(' | ') })), null, 2)}

UNSUBSTANTIATED / CONTRADICTED CLAIMS (2 or more of 3 verifiers could not independently confirm, or found contradicting evidence):
${JSON.stringify(killed.map(c => ({ claim: c.claim, category: c.category, source: c.source, evidence: c.votes.map(v => v.evidence).join(' | ') })), null, 2)}

Group findings by these risk categories: ${CATEGORIES.map(c => c.key).join(', ')}. Mark a category "no claims found" only if it truly has zero entries above. Give one overall risk rating, list concrete red flags and confirmed strengths (each must name the actual claim), and give one procurement recommendation with rationale.`,
  { phase: 'Synthesize', schema: REPORT_SCHEMA }
)

return {
  vendor: vendorLabel,
  report,
  stats: {
    categoriesSearched: CATEGORIES.length,
    sourcesFetched: toFetch.length,
    claimsExtracted: allClaims.length,
    claimsVerified: claimsToVerify.length,
    claimsSubstantiated: confirmed.length,
    claimsFailed: killed.length,
  },
}
