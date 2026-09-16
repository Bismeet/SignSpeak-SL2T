# Risk Register

Likelihood and impact are **preliminary judgements** (H/M/L) made before any development; revisit at each phase gate.

| ID | Risk | Impact | Likelihood | Mitigation | Fallback | Validation needed |
|---|---|---|---|---|---|---|
| R1 | No public ISL dataset covers hospital vocabulary | H | H | Plan to collect own data from day one; use INCLUDE only for pipeline dev | Reduce vocabulary to what can be collected | Confirm INCLUDE licence and class list |
| R2 | Key signs are dynamic; static classifier cannot handle them | H | M | Expert review of vocabulary early; aggregated temporal features as first step | Move dynamic signs to phrase board only | ISL signer confirms static/dynamic per sign |
| R3 | Signer variation causes poor held-out accuracy | H | M | >= 6 diverse signers; normalisation; rejection thresholds | Shrink vocabulary; state limitation in demo | Leave-one-signer-out results |
| R4 | Wrong or unnatural ISL clips shown to deaf users | H | M | Only expert-verified clips; metadata; hide drafts | Show text only | Expert sign-off log |
| R5 | ASL content mistaken for ISL (datasets, tutorials) | H | M | Provenance check for every asset; ISLRTC as reference | Remove asset | Reviewer checklist |
| R6 | Web Speech API fails (unsupported browser, network, noise) | M | H | Capability detection; typing always available; test on target devices | Typing; server ASR later | Browser matrix test |
| R7 | Browser performance too low on ward/phone devices | M | M | Lower resolution; frame skipping; small model | Optional FastAPI landmark backend | FPS measurement on reference devices |
| R8 | Browser compatibility gaps (WASM/WebGPU, camera on iOS Safari) | M | M | Target Chrome/Edge; test Safari early | Document supported browsers | Compatibility matrix |
| R9 | Privacy concerns from camera use in hospitals | H | M | On-device processing; no storage; pause button; clear disclosures | Phrase board without camera | Privacy audit via network inspection |
| R10 | No access to ISL experts / deaf community in time | H | M | Start outreach in Phase 1; multiple channels (ISLRTC, NAD, deaf schools, interpreters, university disability office) | Demo labels all unverified content as unverified and hides it from the deaf-facing view | Named verifier committed |
| R11 | Time constraints of a student team | H | H | Small MVP; phase gates; feature flags to cut scope | Ship phrase board + speech + one or two signs | Weekly burn-down |
| R12 | Overclaiming in demo or pitch | H | M | Ethics checklist; scripted demo with explicit limitations | | Team review of script |
| R13 | Clip licensing (ISLRTC videos) unclear | M | M | Ask for permission early; embed rather than re-host; record own clips with verified signer | Own recordings only | Written permission or own-recording decision |
| R14 | Feature parity bug between Python and TypeScript normalisation | H | M | Shared fixtures; CI parity test | | Parity test passing |
| R15 | Rejection threshold too strict (frustrating) or too loose (wrong words) | M | H | Tune on validation; Normal/Strict setting; usability test | | False-accept and false-reject measured |
| R16 | Hosting free tier cold starts or outage during demo | M | M | Static frontend; local run as backup; prerecorded fallback video | Local demo | Dry run |
| R17 | Participants withdraw consent late | M | L | Pseudonymisation makes deletion straightforward; keep manifest per signer | Retrain without them | Deletion procedure documented |
| R18 | Regulatory/medical perception issues | M | L | Clear non-medical positioning everywhere | | Legal/ethics advisor review if available |
| R19 | Hindi/regional language TTS voices missing | L | M | Detect voices; fall back to English with notice | Text only | Device voice check |
| R20 | Team lacks ISL knowledge, mis-performs signs while collecting data | H | H | Learner samples tagged and excluded from test; expert coaching before recording | Only use fluent signer data | Tag audit |
