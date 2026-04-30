import os, urllib.request, json, urllib.error

# Set GROQ_API_KEYS as a comma-separated env var before running this script.
groq_keys = [k.strip() for k in os.environ.get('GROQ_API_KEYS', '').split(',') if k.strip()]
if not groq_keys:
    raise SystemExit('Set GROQ_API_KEYS env var (comma-separated) before running this script')

print("Testing Groq Keys...")
for i, key in enumerate(groq_keys):
    req = urllib.request.Request(
        'https://api.groq.com/openai/v1/chat/completions',
        data=json.dumps({'model':'llama-3.1-8b-instant', 'messages':[{'role':'user', 'content':'test'}]}).encode(),
        headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
    )
    try:
        res = urllib.request.urlopen(req)
        print(f"Groq Key {i} OK!")
    except urllib.error.HTTPError as e:
        print(f"Groq Key {i} Error: {e.code}")
        print(e.read().decode()[:200])

print("\nTesting Market API Key...")
market_key = '579b464db66ec23bdd000001b7f066c1ee97481b679c826cdd70a7ab'
market_url = f"https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070?api-key={market_key}&format=json&limit=1"
try:
    res = urllib.request.urlopen(market_url)
    data = json.loads(res.read().decode())
    print("Market API OK! Status:", data.get('status'))
except Exception as e:
    print("Market API Error:", e)
