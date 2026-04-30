export interface ChatMessage {
    role: 'user' | 'model'; // Note: Gemini uses 'model' instead of 'assistant'
    parts: { text: string }[];
}

// ==========================================
// CONFIGURATION
// ==========================================
// Set VITE_GEMINI_API_KEY in your .env.local file (Google AI Studio key)
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// gemma-4-31b-it: Latest Gemma 4, multimodal (text + images)
const VISION_MODEL = "gemma-4-31b-it";
const CHAT_MODEL = "gemma-4-31b-it";
// gemini-2.5-flash: ~5x faster than Gemma 4 31B for translation. No chain-of-thought
// overhead. Used for batch UI translation where latency matters more than reasoning.
const TRANSLATE_MODEL = "gemini-2.5-flash";

export const SYSTEM_PROMPT = `You are KropBot (Kisan Mitra), an expert Agricultural Scientist.

Your Mission: Provide CONCISE, actionable, and punchy advice to farmers.

CORE PROTOCOLS:
1.  **Language**: ALWAYS reply in the same language the user uses (Hindi, Marathi, etc.).
2.  **Conciseness**: Avoid long essays. Use short bullet points. Be direct.
3.  **Strict Domain**: Only Agriculture/Farming. Refuse other topics politely.
4.  **Indian Context**: Use Indian brands, Rupees (₹), and local units (Acres/Bigha).
5.  **Safety**: Always mention masks/gloves for chemicals.

Tone: Friendly, helpful, and brief (concise). No technical jargon unless explained simply.`;

// Helper for standard text chatting using Google AI Studio
export const getChatCompletion = async (messages: ChatMessage[]) => {
    try {
        // Gemma 3 27B: 14.4K RPD free, multimodal
        const url = `${BASE_URL}/${CHAT_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

        // Gemma 3 on Gemini API does not support systemInstruction.
        // We will inline the system prompt into the first user message.
        const modifiedMessages = [...messages];
        if (modifiedMessages.length > 0 && modifiedMessages[0].role === 'user') {
            modifiedMessages[0] = {
                role: 'user',
                parts: [{ text: `[SYSTEM INSTRUCTION: ${SYSTEM_PROMPT}]\n\n--- User Query ---\n${modifiedMessages[0].parts[0].text}` }]
            };
        } else {
            modifiedMessages.unshift({ role: 'model', parts: [{ text: 'Understood. I am an agricultural AI assistant and will follow your system instructions.' }] });
            modifiedMessages.unshift({ role: 'user', parts: [{ text: `[SYSTEM INSTRUCTION: ${SYSTEM_PROMPT}]` }] });
        }

        const payload = {
            contents: modifiedMessages,
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1024,
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Gemini API Error: ${response.status} - ${err}`);
        }

        const data = await response.json();
        // Gemma 4: filter out thought parts, use only the actual response
        const parts = data.candidates[0]?.content?.parts || [];
        const textParts = parts.filter((p: any) => !p.thought && p.text).map((p: any) => p.text);
        return textParts.join('\n') || parts[0]?.text || "I apologize, but I couldn't generate a response.";

    } catch (error) {
        console.error("Failed to fetch from Gemini:", error);
        return "I'm having trouble connecting to my AI brain right now. Please check your internet connection and API Key.";
    }
};

// Helper for precise Vision Analysis returning JSON
export const analyzeDiseaseWithVision = async (base64Image: string, language: string = 'English') => {
    try {
        console.log(`Consulting Gemma 4 Vision in ${language}...`);

        const base64Data = base64Image.split(',')[1] || base64Image;
        const mimeType = base64Image.substring(base64Image.indexOf(":") + 1, base64Image.indexOf(";")) || 'image/jpeg';

        // Gemma 3 27B: multimodal, supports inlineData image inputs
        const url = `${BASE_URL}/${VISION_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    role: "user",
                    parts: [
                        {
                            text: `Role: World-Class Plant Pathologist & Agronomist.
Task: Analyze this plant image with extreme precision. 
Language: Output the JSON fields (symptoms, cure, treatment_plan) strictly in ${language}. Keep JSON keys in English.

EXPERT KNOWLEDGE BASE (Primary Diagnostic Anchors):
[FUNGAL DISEASES]
- Early Blight: Concentric bullseye rings (brown/black) + yellow halo on older leaves (Tomato/Potato).
- Late Blight: Water-soaked dark irregular lesions; fuzzy white growth underneath in high humidity (Potato/Tomato).
- Powdery Mildew: White/gray flour-like patches on upper leaf surfaces (Grapes/Cucurbits/Peas).
- Downy Mildew: Angular yellow/pale spots on top, purple/gray fuzz underneath (Grapes/Cucurbits).
- Fusarium Wilt: Progressive wilting/yellowing starting from lower leaves; internal stem browning.
- Rusts (Wheat/Coffee/Legumes): Small orange, brown, or black powdery pustules underneath.
- Rice Blast: Diamond-shaped (spindle) lesions with gray centers and reddish-brown borders.
- Anthracnose: Sunken dark lesions with orange/pink spore masses (Mango/Chillies/Fruit).
[BACTERIAL DISEASES]
- Bacterial Spot/Speck: Small, water-soaked necrotic spots with prominent yellow halos.
- Bacterial Wilt: Rapid sudden wilting without yellowing; milky ooze from cut stem in water.
- Fire Blight: Scorched/blackened branches; blackened leaves hanging on tree (Pome fruits).
- Citrus Canker: Raised corky blisters with water-soaked margins and yellow halos.
[VIRAL DISEASES]
- Leaf Curl: Upward curling, severe crinkling, thickening, and stunted growth (Chillies/Tomato/Cotton).
- Mosaic: Mottled light/dark green patterns; ring-spots; distorted leaf shapes (Papaya/Cucurbits).
- Yellow Vein Mosaic: Vivid yellowing of veins while leaf tissue stays green (Okra/Bhindi).
[PESTS & DAMAGE]
- Sucking Pests (Aphids/Whiteflies): Leaf curling, sticky honeydew, black sooty mold.
- Leaf Miner: Serpentine clear/white winding tracks inside the leaf.
- Spider Mites: Fine silvery stippling/specks; fine webbing on leaf undersides.
- Thrips: Silvery/bronzed patches with black specks (fecal matter); distorted new growth.
- Borers/Caterpillars: Large ragged holes or entry holes in stems/fruit with Frass (excrement).
[SECONDARY NUTRIENTS & DEFICIENCIES]
- Nitrogen: Uniform pale green/yellowing of OLDER lower leaves.
- Phosphorus: Purplish/reddish tints on dark green leaves; stunted development.
- Potassium: Burning/scorching and yellowing along the LEAF MARGINS (edges).
- Magnesium: Interveinal chlorosis (yellowing between green veins) on OLDER leaves.
- Iron: Sharp interveinal chlorosis (yellow tissue, GREEN veins) strictly on NEWEST growth.
- Zinc: Tiny, narrow leaves (Little Leaf); resetled growth; interveinal mottling.
- Calcium: Blossom End Rot (black leathery spot on bottom of fruit); hooked/burning leaf tips.
- Boron: Hollow stems; corky bark; distorted fruit; dying growing tips.
[ENVIRONMENTAL STRESSORS]
- Sunscald: Bleached, white papery patches on fruit or leaves exposed to harsh sun.
- Heat Stress: Rolling of leaves; blossom drop; temporary wilting during peak sun.
- Drought: Uniform wilting; dry/crispy leaf edges; grayish-green leaf tint.
- Salinity: Severe marginal burning; stunted growth; white salt crusts on soil surface.
- Cold/Frost: Water-soaked appearance followed by blackening/death of tender tissue.
[NER REGIONAL CROPS & DISEASES — North-East India specific]
- Areca Nut Yellow Leaf Disease (Phytoplasma): Progressive yellowing from leaflet tips, stunted crown, premature nut drop (Karnataka/Assam/Meghalaya).
- Areca Nut Mahali / Koleroga (Phytophthora arecae): Water-soaked dark patches on nuts, monsoon-onset fruit rot.
- Large Cardamom Chirke (CdMV virus): Pale-green longitudinal stripes on young leaves, yield collapse — Sikkim/Darjeeling/Bhutan slopes.
- Large Cardamom Foorkey (virus): Dwarfed bushy clumps, no inflorescence, total yield loss — vector is banana aphid.
- Ginger Soft Rot (Pythium): Water-soaked rhizomes turning soft and foul-smelling; yellowing from lower leaves up.
- Ginger Bacterial Wilt (Ralstonia): Sudden green wilting; milky bacterial ooze when cut rhizome is dipped in water.
- Turmeric Leaf Blotch (Taphrina maculans): Small dirty yellow spots coalescing to brown patches on leaves.
- Turmeric Rhizome Rot (Pythium): Soft, water-soaked rhizomes; yellowing leaves; usually waterlogged plots.
- Black Rice / Chakhao Blast (Magnaporthe oryzae): Diamond/spindle lesions on leaves; common in Manipur paddies with excess N.
- King Chilli / Bhut Jolokia Anthracnose (Colletotrichum): Sunken dark fruit lesions with concentric rings of orange spore masses.
- King Chilli Leaf Curl Virus: Severe upward curling, crinkling, thickening — whitefly-vectored, Nagaland/Mizoram.
- Kiwi Bacterial Canker / Psa (Pseudomonas syringae pv. actinidiae): Reddish exudate from cankers on canes; leaf spots with yellow halo (Arunachal/Sikkim hills).
- Khasi Mandarin Greening / HLB (Candidatus Liberibacter): Asymmetric blotchy mottle on leaves, lopsided green-bottomed fruit, dieback (Meghalaya/Mizoram orchards).
- Khasi Mandarin Citrus Canker (Xanthomonas citri): Raised corky tan-brown blisters with yellow halo on leaves and twigs.
- Tea Blister Blight (Exobasidium vexans): Translucent oily spots on young leaves becoming silvery-white blisters underneath — Assam/Darjeeling monsoon disease.
- Tea Red Rust (Cephaleuros parasiticus): Reddish-brown velvety algal patches on stems and old leaves.
- Bamboo Blight: Brown necrotic streaks on culms, dieback of young shoots, often after gregarious flowering events.

CROP IDENTIFICATION GUIDE (use leaf morphology to distinguish):
- Tomato leaf: Compound leaf with 5-9 deeply serrated leaflets, strong smell, leaflets are irregularly toothed
- Potato leaf: Compound leaf with 7-9 oval leaflets (including tiny leaflets between main ones called "interjected leaflets"), smoother edges
- Rice: Long narrow blade-like leaves, parallel veins, grows in water/mud
- Wheat: Narrow flat blade with parallel veins, auricles at base
- Cotton: Large 3-5 lobed palmate leaf, broad
- Maize/Corn: Long broad strap-like leaves with prominent midrib
- Mango: Single elongated leathery leaf with smooth edges
- Chilli/Pepper: Single oval/lance-shaped leaf, smooth margins
- Areca Nut: Tall slender unbranched palm with feather-like (pinnate) fronds 1-2m long; leaflets stiff and lance-shaped
- Large Cardamom: Tall reed-like clumps 2-3m, broad lance-shaped dark green leaves with prominent midrib (similar to ginger but much taller and woody at base)
- Ginger: Narrow grass-like leaves on slender pseudostem 60-100cm; rhizome below ground
- Turmeric: Broad oblong leaves up to 1m long arising from underground rhizome — looks like a cleaner, larger ginger
- Black Rice (Chakhao): Same morphology as rice — sometimes purplish tinge on stem and grain; check for SE-Asian/Manipur context
- King Chilli (Bhut Jolokia): Larger leaves than common chilli, broader, with corrugated/wrinkled surface and pungent aroma
- Kiwi: Heart-shaped leaves 7-12cm with reddish hairs underneath, woody vine on pergola
- Khasi Mandarin: Small ovate citrus leaf 5-8cm with winged petiole, glossy dark green
- Tea: Small evergreen shiny dark green leaf 5-10cm, serrated edge, leathery — plucked young leaf has silver tip
- Bamboo: Long narrow strap leaves on hollow jointed culms (NOT a leaf to diagnose, but check culm symptoms)

Process:
1. VISUAL OBSERVATION: Look very closely at the pixels. First identify the crop using the CROP IDENTIFICATION GUIDE above. Then match disease symptoms to the EXPERT KNOWLEDGE BASE.
2. DEDUCTION: If you see a disease not in the list, use your training to identify it, but be GROUNDED. Do not guess exact soil pH or nutrient % from a photo. Provide general trends (e.g., 'Soil might be nitrogen deficient' instead of specific pH numbers).
3. CONCLUSION: Single most likely diagnosis or 'Healthy'. Be specific about crop — never say "Tomato/Potato", always commit to the most likely one.

Output: STRICT JSON FORMAT ONLY. No markdown backticks.
{
  "visual_evidence": "Description of what you see comparing it to the knowledge base",
  "disease_name": "Precise name or 'Healthy'",
  "crop_name": "Name of crop",
  "status": "Healthy" | "Moderate" | "Critical",
  "confidence": 0.0 to 1.0 (Be conservative),
  "symptoms": ["Specific symptom 1", "Specific symptom 2"],
  "cure": ["Chemical remedy", "Organic remedy"],
  "soil_insights": "Actionable soil health/nutrient advice (e.g. 'Probable Nitrogen deficiency; apply Urea' or 'Soil acidity too high; add lime') based on visual symptoms",
  "treatment_plan": "Step-by-step professional advice for an Indian farmer."
}
If NOT a plant, return {"disease_name": "Not a Plant", "confidence": 0}.`
                        },
                        {
                            inlineData: {
                                mimeType: mimeType,
                                data: base64Data
                            }
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.1
                }
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Gemini Vision Error: ${response.status} - ${err}`);
        }

        const data = await response.json();
        // Gemma 4 returns thinking in parts[0] (thought:true) and answer in parts[1]
        // Gemma 3 returns everything in parts[0]
        // Try all non-thought parts, then fall back to all parts
        const parts = data.candidates[0]?.content?.parts || [];
        const textParts = parts.filter((p: any) => !p.thought && p.text).map((p: any) => p.text);
        const allParts = parts.filter((p: any) => p.text).map((p: any) => p.text);
        let content = textParts.join('\n') || allParts.join('\n');

        if (!content) {
            console.error("Gemini Vision: empty response", data);
            return null;
        }

        // Strip markdown code fences if present
        content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

        // Extract first JSON object from response (handles extra prose around JSON)
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error("Gemini Vision: no JSON found in response:", content.substring(0, 200));
            return null;
        }

        try {
            return JSON.parse(jsonMatch[0]);
        } catch (parseErr) {
            // Try to extract field values manually if JSON is malformed
            try {
                const extract = (key: string) => {
                    const m = content.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`) );
                    return m ? m[1] : null;
                };
                const confMatch = content.match(/"confidence"\s*:\s*([\d.]+)/);
                const manual = {
                    disease_name: extract('disease_name') || 'Analysis Pending',
                    crop_name: extract('crop_name') || 'Unknown',
                    status: extract('status') || 'Moderate',
                    confidence: confMatch ? parseFloat(confMatch[1]) : 0.6,
                    symptoms: [extract('visual_evidence') || 'Cloud AI analysis'],
                    cure: [extract('treatment_plan') || 'Consult local expert'],
                };
                if (manual.disease_name !== 'Analysis Pending') {
                    console.log("Gemini Vision: recovered from malformed JSON:", manual.disease_name);
                    return manual;
                }
            } catch { /* fall through */ }
            console.error("Gemini Vision: JSON parse failed:", parseErr);
            return null;
        }

    } catch (error) {
        console.error("Gemini Vision Analysis Failed:", error);
        return null;
    }
};

export const generateContextAwareTreatment = async (
    diseaseName: string,
    cropName: string,
    confidence: number
): Promise<any> => {
    try {
        console.log("Generating Context-Aware Treatment (Structured)...");
        if (confidence < 0.4) return null;

        const prompt = `
        Role: Expert Indian Agricultural Scientist (Kisan Mitra).
        Task: Provide a structured treatment plan for: ${diseaseName} on ${cropName}.
        Confidence: ${(confidence * 100).toFixed(1)}%

        Output format: STRICT JSON ONLY. No markdown. No backticks.
        Structure:
        {
          "chemical": ["Item 1 (Dosage)", "Item 2"],
          "organic": ["Remedy 1", "Remedy 2"],
          "severity": "High" (or Medium/Low)
        }

        Context: Indian brands, INR currency, specific dosages.
        `;

        // gemini-2.0-flash supports systemInstruction; gemma-3-27b-it does not
        const url = `${BASE_URL}/${VISION_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                contents: [{ role: "user", parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();
        let content = data.candidates[0]?.content?.parts[0]?.text;

        if (!content) return null;

        content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;

        try {
            return JSON.parse(jsonMatch[0]);
        } catch {
            return null;
        }

    } catch (error) {
        console.warn("Gemini Treatment Generation Failed:", error);
        return null;
    }
};

// ==========================================
// DYNAMIC CONTENT TRANSLATION (with caching)
// ==========================================
const translationCache: Record<string, string> = {};

// Load cache from localStorage on init
try {
    const saved = localStorage.getItem('kropscan_translation_cache');
    if (saved) Object.assign(translationCache, JSON.parse(saved));
} catch { /* ignore */ }

const saveCache = () => {
    try {
        // Keep cache under 200 entries to avoid bloating localStorage
        const keys = Object.keys(translationCache);
        if (keys.length > 200) {
            keys.slice(0, keys.length - 150).forEach(k => delete translationCache[k]);
        }
        localStorage.setItem('kropscan_translation_cache', JSON.stringify(translationCache));
    } catch { /* ignore */ }
};

export const translateContent = async (text: string, targetLanguage: string): Promise<string> => {
    if (!text || !targetLanguage || targetLanguage === 'English' || text.length < 3) return text;

    // Strip language suffix like "Hindi (हिंदी)" → "Hindi"
    const langName = targetLanguage.split('(')[0].trim();

    const cacheKey = `${langName}::${text.substring(0, 80)}`;
    if (translationCache[cacheKey]) return translationCache[cacheKey];

    if (!GEMINI_API_KEY) return text;

    try {
        const url = `${BASE_URL}/${CHAT_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    role: 'user',
                    parts: [{ text: `Translate the following agricultural text to ${langName}. Keep chemical names, brand names, and scientific names in English. Return ONLY the translated text, nothing else.\n\n${text}` }]
                }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 500 }
            })
        });

        if (!resp.ok) return text;
        const data = await resp.json();
        const translated = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!translated) return text;

        translationCache[cacheKey] = translated;
        saveCache();
        return translated;
    } catch {
        return text;
    }
};

// Batch translate multiple strings at once (1 API call instead of N)
export const translateBatch = async (texts: Record<string, string>, targetLanguage: string): Promise<Record<string, string>> => {
    if (!targetLanguage || targetLanguage === 'English') return texts;

    const langName = targetLanguage.split('(')[0].trim();
    const entries = Object.entries(texts).filter(([, v]) => v && v.length >= 3);

    // Check cache first
    const result: Record<string, string> = { ...texts };
    const uncached: [string, string][] = [];

    for (const [key, val] of entries) {
        const cacheKey = `${langName}::${val.substring(0, 80)}`;
        if (translationCache[cacheKey]) {
            result[key] = translationCache[cacheKey];
        } else {
            uncached.push([key, val]);
        }
    }

    if (uncached.length === 0) return result;
    if (!GEMINI_API_KEY) return result;

    try {
        const numbered = uncached.map(([, v], i) => `[${i + 1}] ${v}`).join('\n');
        const url = `${BASE_URL}/${TRANSLATE_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
        const prompt = `You are a translator. Translate each numbered line to ${langName}.

STRICT OUTPUT RULES:
- Output EXACTLY one line per numbered input, in the format: [N] <translation>
- NO preamble (no "Here's the translation:")
- NO markdown formatting (no **bold**, no *italic*, no backticks)
- NO parenthetical explanations or alternatives
- NO extra notes, dashes, or commentary after the translation
- TRANSLATE EVERY LINE — do NOT leave any line in English. Translate UI labels,
  status words ("Healthy"/"Critical"/"Moderate"), disease names ("Late Blight"/
  "Leaf Rust"), feature names ("System Alerts"/"Recent Diagnosis") — all of it.
- The ONLY exception: keep proper brand names like "KropScan", "KropBot", "AI" in English.

Lines to translate:
${numbered}

Output (one line per number, fully translated, no extras):`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                // Gemini 2.5 Flash with thinkingBudget:0 disables reasoning for max speed.
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 2000,
                    thinkingConfig: { thinkingBudget: 0 }
                }
            })
        });

        if (!resp.ok) return result;
        const data = await resp.json();
        // Gemma 4 returns chain-of-thought as parts[0] (thought:true) and the
        // actual answer as parts[1]. Filter out thought parts and concat the rest.
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const answerParts = parts.filter((p: any) => !p.thought && p.text).map((p: any) => p.text);
        const fallbackParts = parts.filter((p: any) => p.text).map((p: any) => p.text);
        const output = (answerParts.join('\n') || fallbackParts.join('\n')).trim();

        // Parse numbered responses + scrub markdown / parentheticals that
        // Gemini sometimes inserts despite the strict prompt.
        const cleanTranslation = (raw: string): string => {
            let s = raw.replace(/^\[?\d+\]?\s*/, '').trim();
            // Strip leading "- " or " - " separators
            s = s.replace(/^\s*[-–—]\s*/, '');
            // Drop everything from the first " - " or " (" or " //" — these
            // are typically Gemini-added explanations like
            // "Nwngkwo Khulumbai - This is a formal greeting"
            const splitIdx = s.search(/\s+(?:[-–—]\s|\(|\/\/)/);
            if (splitIdx > 0) s = s.slice(0, splitIdx);
            // Strip ** and * markdown markers (but keep content)
            s = s.replace(/\*+/g, '').trim();
            // Strip surrounding quotes
            s = s.replace(/^["“'`]+|["”'`]+$/g, '').trim();
            return s;
        };

        // Treat a result as untranslated if it's identical to the input English
        // (Gemini sometimes echoes back) or pure ASCII for non-Latin-script langs.
        // Skipping these from cache lets a retry pass try again.
        const isLikelyUntranslated = (translation: string, original: string): boolean => {
            if (translation === original) return true;
            // For non-Latin-script langs, a fully-ASCII result is suspicious.
            // (Latin-script tribal langs like Mizo / Khasi can have ASCII translations.)
            const langNeedsNonAscii = /Hindi|Marathi|Bengali|Assamese|Punjabi|Tamil|Telugu|Kannada|Malayalam|Gujarati|Bodo|Manipuri/.test(langName);
            if (langNeedsNonAscii && /^[\x00-\x7F]+$/.test(translation)) return true;
            return false;
        };

        const lines = output.split('\n').filter((l: string) => l.match(/^\[?\d+\]?\s/));
        for (let i = 0; i < Math.min(lines.length, uncached.length); i++) {
            const translated = cleanTranslation(lines[i]);
            const [key, val] = uncached[i];
            if (translated && !isLikelyUntranslated(translated, val)) {
                result[key] = translated;
                translationCache[`${langName}::${val.substring(0, 80)}`] = translated;
            }
            // else: leave result[key] as the English fallback from {...texts} spread,
            // and don't cache — gives the retry pass a chance.
        }
        saveCache();
    } catch { /* fallback to English */ }

    return result;
};
