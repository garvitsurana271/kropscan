# Architecture

This document explains the KropScan technical architecture. For product context, see the [README](../README.md).

---

## Design principles

1. **Offline-first.** Most farmers have intermittent connectivity. The diagnosis flow must work without a network. Network features (cloud fallback, KropBot chat) augment but never gate the core experience.
2. **Hybrid intelligence.** A small local model gets the common cases right at zero latency. A large cloud model handles edge cases. The user sees one result, not two systems.
3. **Caching by default.** Models, translations, and scan history all persist locally. Re-running the app with no network produces the same UX as the first load with network.
4. **Mobile-first.** PWA installable on a 2GB-RAM Android. Capacitor wrapper produces a Play-Store-ready APK.

---

## The three-tier inference cascade

The core architectural decision is in [`services/ClassifierService.ts`](../services/ClassifierService.ts). When a user submits a leaf photo:

```
1. Image Quality Gate (utils/ImageQualityChecker.ts)
   └─ rejects blurry / dark / non-leaf images before any AI runs
2. Local ONNX (services/TFService.ts)
   └─ EfficientNetV2-S, 40 classes, 81MB, runs in WASM
   └─ produces (label, confidence)
3. Decision: keep local result OR escalate?
   ├─ if confidence < 0.55 → escalate
   ├─ if disease == blight → escalate (local can't distinguish early/late)
   ├─ if label == "Unknown" → escalate
   └─ else → keep local result
4. Cloud Gemma 4 Vision (services/GeminiService.ts)
   └─ multimodal, 300-line plant-pathology prompt
   └─ returns structured JSON: disease, crop, status, severity, symptoms, cure, treatment_plan
5. Graceful fallback
   └─ if both local and cloud fail, return "Unable to identify, retry recommended"
   └─ never crash, never show raw error to user
```

This pattern means:
- A farmer scanning tomato in a poor-network village gets the local 95%-accurate result instantly.
- A farmer scanning areca nut (not in the local model) gets cloud-level accuracy when online.
- A farmer offline scanning an unknown crop gets a graceful "try again with better photo" UX.

---

## Local inference details

The ONNX model lives at `public/models/plant_disease_model.onnx` (81 MB). [`TFService`](../services/TFService.ts) handles:

- **Loading** with progress callbacks (the model download surfaces in the UI as `ModelDownloadIndicator`)
- **Persistence** in IndexedDB (`kropscan-models` DB, key `onnx-model-v2`) so the model survives hard refreshes, service-worker updates, and cache clears
- **WASM threading config**: forces `numThreads = 1` (single-threaded) to avoid `SharedArrayBuffer`, which would require COOP/COEP headers that break Firebase Auth's popup flow
- **Class indices** loaded from `public/models/model_info.json`

First scan: ~3s cold (model download + inference).
Subsequent scans: <1s warm (model in IDB cache).

---

## Cloud inference details

[`GeminiService.analyzeDiseaseWithVision`](../services/GeminiService.ts) wraps `gemma-4-31b-it`. Notable choices:

- **Custom plant-pathology prompt** (~300 lines) including a knowledge base of fungal/bacterial/viral diseases organized by visual signature, plus an NER specialty crop section (areca nut, large cardamom, king chilli, etc.) with morphology hints
- **Crop identification guide** that compares leaf shapes to disambiguate crops the model has never seen
- **Strict JSON output schema** — `disease_name`, `crop_name`, `status`, `confidence`, `symptoms`, `cure`, `soil_insights`, `treatment_plan`
- **Thought-token filtering** — Gemma 4 returns chain-of-thought as `parts[0]` with `thought: true` and the actual answer in `parts[1]`. Our parser explicitly filters thought parts.

---

## Multilingual UI

KropScan supports 15 languages: 11 major Indian + 4 NE tribal (Bodo, Mizo, Khasi, Manipuri/Meitei). Two layers:

1. **Static dictionary** ([`utils/translations.ts`](../utils/translations.ts)) — pre-translated for major Indian languages
2. **Runtime auto-translate** — for tribal languages and any language not in the static dict, [`prefetchLanguageDict`](../utils/translations.ts) batches the entire English dict to Gemini 2.5 Flash with `thinkingBudget: 0` for low-latency translation. Result is cached in `localStorage` so subsequent app loads are instant.

The cache fills in ~30-60s on first language switch with 5-way concurrent chunks. A retry pass re-translates any keys Gemini echoed back unchanged.

---

## Jhum rotation advisory

[`pages/JhumAdvisory.tsx`](../pages/JhumAdvisory.tsx) is a slope-and-soil-aware shifting cultivation planner. The rule-based engine:

- Takes inputs: primary crop, years since last cleared, slope (gentle/moderate/steep), soil type (loam/sandy/clay/red)
- Computes recommended fallow years (calibrated to ICAR-NEH research; minimum 7 years on steep slopes)
- Computes erosion risk score 0-100 weighted by slope × soil × recency
- Recommends a 4-year rotation crop sequence with specific NE-region-appropriate crops

After the instant rule-based output, a non-blocking call to Gemma 4 returns 3 short bullets of NER-specific agronomist advice, displayed in a separate "AI agronomist insights" card.

---

## ASHA district surveillance

[`pages/AshaReport.tsx`](../pages/AshaReport.tsx) is a district-level disease aggregation dashboard for ASHA workers and KVK officers. Key design:

- **Severity-weighted aggregation:** `state_score = Σ severity_rank × log10(affected_farmers + 1)` so 1 critical report (5 farmers) outranks 20 low-severity reports — matching how real public-health surveillance ranks signals
- **8-state heatmap** covering all NE states with intensity colored by aggregated state score
- **Top-disease bar chart** sorted by total farmers affected
- **Local seeding** of demo reports on first load so the dashboard is meaningful out of the box

Production would aggregate from a Firestore collection per district instead of localStorage.

---

## Storage

| Layer | Library | Purpose |
|---|---|---|
| `IndexedDB` | `idb` | Scan history, ONNX model bytes, ASHA report cache |
| `localStorage` | native | User language pref, runtime translation cache, crop portfolio |
| `Firestore` | `firebase` | User profiles, real-time sync of community / ASHA reports |
| `Service Worker` cache | Workbox | Pre-cache of WASM runtime, JS bundles, model files |

---

## Bundle and performance

```
Main JS bundle:        1.5 MB (gzipped 312 KB)
ONNX WASM runtime:    24 MB (cached by Workbox)
ONNX model weights:   81 MB (cached in IndexedDB)
First scan:           <3s cold
Subsequent scans:     <1s warm
Build time:           ~12s (Vite + esbuild)
PWA precache:         100 MB across 36 entries
```

---

## Security

- **Phone OTP only** — no email/password attack surface, no LinkedIn/Google account leak vector
- **Firestore security rules** — server-side enforcement of read/write permissions
- **Firebase web API key inline** — documented as public-safe by Google (identifies the project, not authenticates)
- **Other API keys via env vars** — `VITE_GEMINI_API_KEY`, `VITE_OPENROUTER_API_KEY`, `KROPSCAN_API_KEY` all read from `.env.local` (gitignored)
- **ASHA reports anonymized** — only aggregate counts visible publicly, never individual identities

---

## What's next architecturally

- **Build-time translation baking:** run a Python script at build time to translate the static dict into all 15 languages, eliminating runtime translation latency entirely
- **NER-specific model retraining:** the long-term answer to NER specialty crop coverage is to retrain on a NER dataset rather than relying on cloud fallback. Pipeline scripts in `scripts/` are ready for this.
- **Mesh sync between offline devices:** Bluetooth/WiFi-Direct (Capacitor community plugins) so ASHA workers in poor-network villages can aggregate reports peer-to-peer
- **Server-side inference tier:** `server.py` (Flask + ONNX) is wired but not deployed; would let us run the model on-edge in remote KVK kiosks
