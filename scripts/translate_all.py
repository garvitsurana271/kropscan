"""
Generate translations for all 9 missing languages using Gemma 4 API.
Batches keys in groups of ~30 to stay within token limits.
"""
import os, re, json, time, requests, sys

API_KEY = os.environ.get('GEMINI_API_KEY', '')
if not API_KEY:
    sys.exit("Set GEMINI_API_KEY env var before running this script")
URL = f'https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:generateContent?key={API_KEY}'

# Read English keys
with open('utils/translations.ts', 'r', encoding='utf-8') as f:
    content = f.read()

eng_block = re.search(r"'English':\s*\{([\s\S]*?)\n    \}", content)
pairs = re.findall(r"'([^']+)'\s*:\s*'([^']*?)'", eng_block.group(1))
print(f"English keys: {len(pairs)}")

LANGUAGES = {
    'Marathi (मराठी)': 'Marathi',
    'Punjabi (ਪੰਜਾਬੀ)': 'Punjabi',
    'Telugu (తెలుగు)': 'Telugu',
    'Tamil (தமிழ்)': 'Tamil',
    'Bengali (বাংলা)': 'Bengali',
    'Gujarati (ગુજરાતી)': 'Gujarati',
    'Kannada (ಕನ್ನಡ)': 'Kannada',
    'Malayalam (മലയാളം)': 'Malayalam',
    'Assamese (অসমীয়া)': 'Assamese',
}

KEEP_ENGLISH = [
    'KropScan', 'KropBot', 'EfficientNetV2', 'WebAssembly', 'ONNX', 'Gemma',
    'Firebase', 'React', 'AI', 'Pro', 'PREMIUM', 'Amazon', 'Google',
    'Propiconazole', 'Tebuconazole', 'Mancozeb', 'Carbendazim',
    'Metalaxyl', 'Tricyclazole', 'Imidacloprid', 'WhatsApp',
]

def translate_batch(keys_values, lang_name):
    """Translate a batch of key-value pairs to a target language."""
    # Build numbered list
    numbered = []
    for i, (k, v) in enumerate(keys_values):
        numbered.append(f"[{i}] {v}")

    prompt = f"""Translate these UI texts to {lang_name}. Rules:
1. Return ONLY a JSON object mapping numbers to translations
2. Keep technical terms in English: {', '.join(KEEP_ENGLISH[:15])}
3. Keep chemical names, brand names, and numbers in English
4. Keep JSON keys as numbers
5. Be natural and concise - these are UI labels

Input:
{chr(10).join(numbered)}

Output format: {{"0": "translation", "1": "translation", ...}}"""

    try:
        r = requests.post(URL, json={
            'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
            'generationConfig': {'temperature': 0.1, 'maxOutputTokens': 4000}
        }, timeout=60)

        data = r.json()
        if 'candidates' not in data:
            print(f"    API error: {json.dumps(data)[:100]}")
            return None

        parts = data['candidates'][0]['content']['parts']
        text = ''
        for p in parts:
            if not p.get('thought') and p.get('text'):
                text += p['text']

        # Extract JSON
        text = text.replace('```json', '').replace('```', '').strip()
        jm = re.search(r'\{[\s\S]*\}', text)
        if not jm:
            print(f"    No JSON found in response")
            return None

        return json.loads(jm.group())
    except Exception as e:
        print(f"    Error: {e}")
        return None

# Process each language
all_translations = {}
BATCH_SIZE = 25

for lang_key, lang_name in LANGUAGES.items():
    print(f"\n{'='*50}")
    print(f"Translating to {lang_name}...")
    print(f"{'='*50}")

    translations = {}

    for batch_start in range(0, len(pairs), BATCH_SIZE):
        batch = pairs[batch_start:batch_start + BATCH_SIZE]
        batch_num = batch_start // BATCH_SIZE + 1
        total_batches = (len(pairs) + BATCH_SIZE - 1) // BATCH_SIZE

        print(f"  Batch {batch_num}/{total_batches} ({len(batch)} keys)...", end=" ", flush=True)

        result = translate_batch(batch, lang_name)

        if result:
            for i, (k, v) in enumerate(batch):
                idx = str(i)
                if idx in result:
                    translations[k] = result[idx]
                else:
                    translations[k] = v  # Fallback to English
            print(f"OK ({len(result)} translated)")
        else:
            # Fallback: keep English
            for k, v in batch:
                translations[k] = v
            print("FAILED - using English fallback")

        time.sleep(1)  # Rate limiting

    all_translations[lang_key] = translations
    print(f"  Total: {len(translations)} keys for {lang_name}")

# Generate TypeScript output
print(f"\n{'='*50}")
print("Generating TypeScript...")

output_lines = []
for lang_key, translations in all_translations.items():
    output_lines.append(f"    '{lang_key}': {{")
    for k, v in translations.items():
        # Escape single quotes in values
        v_escaped = v.replace("'", "\\'")
        output_lines.append(f"        '{k}': '{v_escaped}',")
    output_lines.append("    },")

output = '\n'.join(output_lines)

with open('scripts/translations_generated.ts', 'w', encoding='utf-8') as f:
    f.write(output)

print(f"Saved to scripts/translations_generated.ts")
print(f"Languages: {len(all_translations)}")
print(f"Keys per language: ~{len(pairs)}")
print("\nDONE. Now merge into utils/translations.ts")
