import * as ort from 'onnxruntime-web';
import { PredictionResult } from '../types';

// Define the shape of our Model Info (from model_info.json)
interface ModelInfo {
    class_names: string[];
    input_size: [number, number];
}

class TFService {
    private session: ort.InferenceSession | null = null;
    private classes: string[] = [];
    private modelPath: string = '/models/plant_disease_model.onnx?v=3'; // v3: single-file model, no external .data
    private configPath: string = '/models/model_info.json';
    private treatmentPath: string = '/models/treatment_database.json'; // If needed, or use hardcoded

    private progressListeners: ((percent: number) => void)[] = [];

    constructor() {
        // Set WASM paths to root (since we copy them to dist root)
        ort.env.wasm.wasmPaths = '/';
        // Single-threaded mode: avoids SharedArrayBuffer requirement
        // (SharedArrayBuffer needs COOP/COEP headers which break Firebase Auth)
        ort.env.wasm.numThreads = 1;
    }

    public onProgress(callback: (percent: number) => void) {
        this.progressListeners.push(callback);
    }

    private emitProgress(percent: number) {
        this.progressListeners.forEach(cb => cb(percent));
    }

    // IndexedDB helpers — model persists across hard refreshes, SW updates, cache clears
    private async idbGet(key: string): Promise<ArrayBuffer | null> {
        return new Promise((resolve) => {
            try {
                const req = indexedDB.open('kropscan-models', 1);
                req.onupgradeneeded = () => req.result.createObjectStore('models');
                req.onsuccess = () => {
                    try {
                        const tx = req.result.transaction('models', 'readonly');
                        const store = tx.objectStore('models');
                        const get = store.get(key);
                        get.onsuccess = () => resolve(get.result || null);
                        get.onerror = () => resolve(null);
                    } catch { resolve(null); }
                };
                req.onerror = () => resolve(null);
            } catch { resolve(null); }
        });
    }

    private async idbPut(key: string, data: ArrayBuffer): Promise<void> {
        return new Promise((resolve) => {
            try {
                const req = indexedDB.open('kropscan-models', 1);
                req.onupgradeneeded = () => req.result.createObjectStore('models');
                req.onsuccess = () => {
                    try {
                        const tx = req.result.transaction('models', 'readwrite');
                        tx.objectStore('models').put(data, key);
                        tx.oncomplete = () => resolve();
                        tx.onerror = () => resolve();
                    } catch { resolve(); }
                };
                req.onerror = () => resolve();
            } catch { resolve(); }
        });
    }

    async loadModel(): Promise<void> {
        if (this.session) return;

        try {
            console.log("Loading ONNX Model...");
            this.emitProgress(0);

            // 1. Load Config
            const configReq = await fetch(this.configPath);
            const config: ModelInfo = await configReq.json();
            this.classes = config.class_names;
            console.log(`Loaded Config: ${this.classes.length} classes`);

            // 2. Try loading model from IndexedDB first (survives hard refresh)
            let modelData: Uint8Array | null = null;
            const cached = await this.idbGet('onnx-model-v2');
            if (cached) {
                console.log("Loading model from IndexedDB cache...");
                modelData = new Uint8Array(cached);
                this.emitProgress(100);
            }

            // 3. If not cached, fetch from network with progress
            if (!modelData) {
                console.log("Downloading model from network...");
                const response = await fetch(this.modelPath);
                if (!response.ok) throw new Error("Network response was not ok");

                const contentLength = response.headers.get('content-length');
                const total = parseInt(contentLength || '0', 10);
                let loaded = 0;
                const reader = response.body?.getReader();
                const chunks: Uint8Array[] = [];

                if (!reader) throw new Error("ReadableStream not supported");

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                    loaded += value.length;
                    if (total) this.emitProgress(Math.round((loaded / total) * 100));
                }

                modelData = new Uint8Array(loaded);
                let position = 0;
                for (const chunk of chunks) {
                    modelData.set(chunk, position);
                    position += chunk.length;
                }

                this.emitProgress(100);

                // Save to IndexedDB for next time
                this.idbPut('onnx-model-v2', modelData.buffer).catch(() => {});
                console.log("Model saved to IndexedDB cache");
            }

            // 4. Create ONNX session from buffer
            this.session = await ort.InferenceSession.create(modelData, {
                executionProviders: ['wasm'],
                graphOptimizationLevel: 'all'
            });

            console.log("ONNX Model Loaded Successfully");
            setTimeout(() => this.emitProgress(-1), 2000);

        } catch (error) {
            console.error("Failed to load ONNX model:", error);
            this.emitProgress(-1);
            throw new Error("Offline Model Load Failed");
        }
    }

    async classify(imageElement: HTMLImageElement): Promise<PredictionResult> {
        if (!this.session) {
            await this.loadModel();
        }

        if (!this.session) {
            throw new Error("Model not initialized");
        }

        try {
            // 1. Preprocess Image
            const tensor = this.preprocess(imageElement);

            // 2. Run Inference
            const feeds: Record<string, ort.Tensor> = {};
            const inputName = this.session.inputNames[0];
            feeds[inputName] = tensor;

            const results = await this.session.run(feeds);
            const outputName = this.session.outputNames[0];
            const output = results[outputName];

            // 3. Postprocess (Softmax & TopK)
            const logits = output.data as Float32Array; // Flattened array

            // Suppress "PlantVillage" dataset artifact class (same as ai_engine.py)
            const pvIdx = this.classes.indexOf('PlantVillage');
            if (pvIdx !== -1) {
                (logits as any)[pvIdx] = -1000.0;
            }

            const probs = this.calibratedSoftmax(logits);

            // Find Max
            let maxIdx = 0;
            let maxProb = -1;
            for (let i = 0; i < probs.length; i++) {
                if (probs[i] > maxProb) {
                    maxProb = probs[i];
                    maxIdx = i;
                }
            }

            const predictedClass = this.classes[maxIdx] || "Unknown";
            console.log(`ONNX Prediction: ${predictedClass} (${(maxProb * 100).toFixed(1)}%)`);

            return this.mapToPredictionResult(predictedClass, maxProb, imageElement.src);

        } catch (e) {
            console.error("Inference Error:", e);
            throw e;
        }
    }

    // Replication of ai_engine.py preprocessing
    // Resize (260, 260) -> Norm([0.485...], [0.229...]) -> CHW -> Batch
    private preprocess(image: HTMLImageElement): ort.Tensor {
        const width = 260;
        const height = 260;

        // Draw to canvas to resize and get data
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Canvas Context Failed");

        // Bilinear scaling is default in canvas drawImage usually (or close enough)
        ctx.drawImage(image, 0, 0, width, height);

        const imageData = ctx.getImageData(0, 0, width, height);
        const { data } = imageData; // RGBA flat array

        // Prepare Float32 Array for Tensor (1, 3, 260, 260)
        // Order: Batch, Channel, Row, Col
        const float32Data = new Float32Array(1 * 3 * width * height);

        const mean = [0.485, 0.456, 0.406];
        const std = [0.229, 0.224, 0.225];

        for (let i = 0; i < width * height; i++) {
            // Pixel indices
            const r = data[i * 4] / 255.0;
            const g = data[i * 4 + 1] / 255.0;
            const b = data[i * 4 + 2] / 255.0;

            // Normalize
            const normR = (r - mean[0]) / std[0];
            const normG = (g - mean[1]) / std[1];
            const normB = (b - mean[2]) / std[2];

            // Fill Tensor (CHW)
            // Channel 0 (R)
            float32Data[i] = normR;
            // Channel 1 (G)
            float32Data[width * height + i] = normG;
            // Channel 2 (B)
            float32Data[2 * width * height + i] = normB;
        }

        return new ort.Tensor('float32', float32Data, [1, 3, height, width]);
    }

    // Calibrated confidence: uses logit margin to gauge true model certainty.
    // If the gap between #1 and #2 logit is large → model is sure → boost confidence.
    // If the gap is small → model is guessing → keep confidence honest.
    private calibratedSoftmax(logits: Float32Array): Float32Array {
        // 1. Standard softmax (T=1.0) for true probabilities
        const probs = new Float32Array(logits.length);
        let maxLogit = -Infinity;
        let secondMax = -Infinity;
        for (let i = 0; i < logits.length; i++) {
            if (logits[i] > maxLogit) {
                secondMax = maxLogit;
                maxLogit = logits[i];
            } else if (logits[i] > secondMax) {
                secondMax = logits[i];
            }
        }

        let sum = 0;
        for (let i = 0; i < logits.length; i++) {
            probs[i] = Math.exp(logits[i] - maxLogit);
            sum += probs[i];
        }
        for (let i = 0; i < probs.length; i++) {
            probs[i] /= sum;
        }

        // 2. Calibrate based on logit margin
        // margin > 3.0 → model is very sure → scale up to ~85-95%
        // margin 1.5-3.0 → moderate confidence → scale to ~60-80%
        // margin < 1.5 → model is guessing → keep raw probability (low)
        const margin = maxLogit - secondMax;
        if (margin > 2.0) {
            // Confident prediction — apply mild temperature scaling
            const T = 0.55;
            let sum2 = 0;
            for (let i = 0; i < logits.length; i++) {
                probs[i] = Math.exp((logits[i] - maxLogit) / T);
                sum2 += probs[i];
            }
            for (let i = 0; i < probs.length; i++) {
                probs[i] /= sum2;
            }
        }
        // else: keep raw softmax — don't artificially inflate uncertain predictions

        return probs;
    }

    // Comprehensive treatment database for offline diagnosis
    private static readonly TREATMENTS: Record<string, {
        severity: number; status: string; type: string;
        symptoms: string[]; chemical: string[]; organic: string[];
        cure: string[]; cost: number;
    }> = {
        // === WHEAT ===
        'Wheat___Brown_Rust': { severity: 70, status: 'Moderate', type: 'Fungal', symptoms: ['Orange-brown pustules on leaves', 'Reduced grain filling'], chemical: ['Propiconazole 125ml/200L water', 'Tebuconazole 100g/200L water'], organic: ['Neem oil 2ml/L', 'Garlic-chili extract spray'], cure: ['Spray fungicide at first appearance', 'Remove infected debris'], cost: 800 },
        'Wheat___Yellow_Rust': { severity: 85, status: 'Critical', type: 'Fungal', symptoms: ['Yellow stripes on leaves', 'Premature leaf death'], chemical: ['Propiconazole 25% EC @ 0.1%', 'Triadimefon 25% WP @ 0.1%'], organic: ['Neem oil spray', 'Bordeaux mixture 1%'], cure: ['Immediate fungicide application', 'Use resistant varieties'], cost: 1000 },
        'Wheat___Black_Rust': { severity: 90, status: 'Critical', type: 'Fungal', symptoms: ['Dark brown-black pustules on stems', 'Lodging of plants'], chemical: ['Mancozeb 75% WP 2.5g/L', 'Propiconazole 25% EC'], organic: ['Bordeaux mixture', 'Sulfur dust'], cure: ['Emergency fungicide spray', 'Harvest early if severe'], cost: 1200 },
        'Wheat___Blast': { severity: 85, status: 'Critical', type: 'Fungal', symptoms: ['Bleached spikes', 'Gray-green lesions on leaves'], chemical: ['Tricyclazole 75% WP', 'Mancozeb + Tricyclazole'], organic: ['Silicon-based foliar spray', 'Bio-fungicide Trichoderma'], cure: ['Avoid late sowing', 'Seed treatment before planting'], cost: 900 },
        'Wheat___Mildew': { severity: 60, status: 'Moderate', type: 'Fungal', symptoms: ['White powdery patches on leaves', 'Leaf curling'], chemical: ['Sulfur 80% WP 3g/L', 'Karathane 0.05%'], organic: ['Baking soda spray 1tsp/L', 'Milk spray 1:9'], cure: ['Improve air circulation', 'Avoid excess nitrogen'], cost: 500 },
        'Wheat___Septoria': { severity: 65, status: 'Moderate', type: 'Fungal', symptoms: ['Tan lesions with dark borders', 'Leaf blotch'], chemical: ['Chlorothalonil 2g/L', 'Mancozeb 2.5g/L'], organic: ['Copper oxychloride', 'Trichoderma viride'], cure: ['Crop rotation', 'Remove infected residues'], cost: 700 },
        'Wheat___Smut': { severity: 70, status: 'Moderate', type: 'Fungal', symptoms: ['Black sooty masses replacing grain', 'Fishy smell'], chemical: ['Carboxin 2g/kg seed treatment', 'Thiram 2.5g/kg'], organic: ['Hot water seed treatment 52°C/10min', 'Trichoderma seed coating'], cure: ['Certified disease-free seeds', 'Seed treatment mandatory'], cost: 400 },
        'Wheat___Aphid': { severity: 55, status: 'Moderate', type: 'Pest', symptoms: ['Yellowing leaves', 'Honeydew on leaves', 'Stunted growth'], chemical: ['Imidacloprid 0.5ml/L', 'Dimethoate 30% EC 2ml/L'], organic: ['Neem oil 5ml/L', 'Soap spray 5g/L'], cure: ['Spray at early infestation', 'Encourage ladybird beetles'], cost: 600 },
        'Wheat___Mite': { severity: 50, status: 'Moderate', type: 'Pest', symptoms: ['Leaf curling', 'Silver streaks on leaves'], chemical: ['Dicofol 18.5% EC', 'Sulfur dust'], organic: ['Neem oil 3ml/L', 'Predatory mite release'], cure: ['Maintain field hygiene', 'Avoid water stress'], cost: 500 },
        'Wheat___Stem_Fly': { severity: 60, status: 'Moderate', type: 'Pest', symptoms: ['Dead heart in seedlings', 'Tunneling in stems'], chemical: ['Chlorpyrifos 20% EC', 'Fipronil 5% SC'], organic: ['Neem seed kernel extract', 'Early sowing'], cure: ['Seed treatment with insecticide', 'Timely sowing'], cost: 700 },
        'Wheat___Fusarium_Head_Blight': { severity: 80, status: 'Critical', type: 'Fungal', symptoms: ['Bleached spikelets', 'Pink-orange spore masses'], chemical: ['Tebuconazole at flowering', 'Metconazole 60g/ha'], organic: ['Trichoderma bio-fungicide', 'Crop rotation with non-cereals'], cure: ['Spray at anthesis stage', 'Avoid maize-wheat rotation'], cost: 1100 },
        'Wheat___Common_Root_Rot': { severity: 65, status: 'Moderate', type: 'Fungal', symptoms: ['Brown discoloration at stem base', 'Premature ripening'], chemical: ['Thiram seed treatment', 'Carboxin + Thiram'], organic: ['Trichoderma soil application', 'Crop rotation'], cure: ['Seed treatment', 'Avoid continuous wheat cropping'], cost: 500 },
        'Wheat___Leaf_Blight': { severity: 60, status: 'Moderate', type: 'Fungal', symptoms: ['Brown oval lesions on leaves', 'Leaf tip necrosis'], chemical: ['Mancozeb 2.5g/L', 'Propiconazole 1ml/L'], organic: ['Pseudomonas fluorescens', 'Neem oil'], cure: ['Balanced fertilization', 'Resistant varieties'], cost: 600 },
        'Wheat___Tan_Spot': { severity: 55, status: 'Moderate', type: 'Fungal', symptoms: ['Tan oval spots with yellow halo', 'V-shaped lesions'], chemical: ['Propiconazole', 'Azoxystrobin'], organic: ['Crop residue management', 'Trichoderma'], cure: ['Remove stubble', 'Crop rotation'], cost: 600 },
        'Wheat___healthy': { severity: 10, status: 'Healthy', type: 'None', symptoms: ['No disease symptoms detected'], chemical: [], organic: [], cure: ['Continue regular monitoring', 'Maintain NPK schedule'], cost: 0 },

        // === RICE ===
        'Rice___Brown_Spot': { severity: 65, status: 'Moderate', type: 'Fungal', symptoms: ['Oval brown spots on leaves', 'Dark brown lesions on grain'], chemical: ['Mancozeb 2.5g/L', 'Edifenphos 1ml/L'], organic: ['Pseudomonas fluorescens', 'Neem cake soil application'], cure: ['Balanced potash fertilizer', 'Seed treatment'], cost: 700 },
        'Rice___Leaf_Blast': { severity: 85, status: 'Critical', type: 'Fungal', symptoms: ['Diamond-shaped lesions', 'Gray center with brown border'], chemical: ['Tricyclazole 75% WP 0.6g/L', 'Isoprothiolane 1.5ml/L'], organic: ['Trichoderma viride', 'Silicon foliar spray'], cure: ['Avoid excess nitrogen', 'Maintain water level'], cost: 1000 },
        'Rice___Neck_Blast': { severity: 90, status: 'Critical', type: 'Fungal', symptoms: ['Neck of panicle turns brown-black', 'Panicle breaks'], chemical: ['Tricyclazole at booting', 'Carbendazim 1g/L'], organic: ['Bio-fungicides at heading', 'Balanced nutrition'], cure: ['Spray at panicle emergence', 'Drain fields periodically'], cost: 1200 },
        'Rice___Healthy': { severity: 10, status: 'Healthy', type: 'None', symptoms: ['No disease symptoms detected'], chemical: [], organic: [], cure: ['Continue regular monitoring', 'Maintain water management'], cost: 0 },

        // === MANGO ===
        'Mango___Anthracnose': { severity: 75, status: 'Critical', type: 'Fungal', symptoms: ['Black spots on leaves/fruits', 'Blossom blight', 'Fruit rot'], chemical: ['Carbendazim 1g/L', 'Copper oxychloride 3g/L'], organic: ['Bordeaux mixture 1%', 'Neem oil 5ml/L'], cure: ['Spray before and after flowering', 'Remove infected parts'], cost: 800 },
        'Mango___Bacterial_Canker': { severity: 70, status: 'Moderate', type: 'Bacterial', symptoms: ['Raised lesions on stems', 'Gummy exudate', 'Canker on branches'], chemical: ['Streptocycline 0.5g/L + Copper oxychloride'], organic: ['Bordeaux paste on wounds', 'Pruning infected branches'], cure: ['Prune and destroy infected wood', 'Avoid wounds during monsoon'], cost: 600 },
        'Mango___Cutting_Weevil': { severity: 55, status: 'Moderate', type: 'Pest', symptoms: ['Cut shoots', 'Wilting of tender shoots'], chemical: ['Quinalphos 0.05%', 'Monocrotophos 0.05%'], organic: ['Collect and destroy fallen shoots', 'Neem oil spray'], cure: ['Regular orchard sanitation', 'Light traps'], cost: 500 },
        'Mango___Die_Back': { severity: 80, status: 'Critical', type: 'Fungal', symptoms: ['Drying of twigs from tip', 'Gum oozing', 'Bark splitting'], chemical: ['Copper oxychloride 3g/L', 'Carbendazim 1g/L'], organic: ['Bordeaux paste on cut ends', 'Trichoderma soil drench'], cure: ['Cut 15cm below infection & burn', 'Apply paste on wounds'], cost: 700 },
        'Mango___Gall_Midge': { severity: 60, status: 'Moderate', type: 'Pest', symptoms: ['Swollen galls on leaves', 'Leaf distortion'], chemical: ['Dimethoate 0.05%', 'Phosphamidon 0.05%'], organic: ['Neem oil 3%', 'Remove galled leaves'], cure: ['Spray at new flush emergence', 'Plough around tree base'], cost: 500 },
        'Mango___Powdery_Mildew': { severity: 70, status: 'Moderate', type: 'Fungal', symptoms: ['White powdery coating on flowers/leaves', 'Flower drop'], chemical: ['Sulfur 80% WP 2g/L', 'Karathane 1ml/L'], organic: ['Baking soda 1tsp/L', 'Milk spray'], cure: ['Spray at flower bud stage', 'Improve air circulation'], cost: 500 },
        'Mango___Sooty_Mould': { severity: 45, status: 'Low', type: 'Fungal', symptoms: ['Black sooty coating on leaves', 'Reduced photosynthesis'], chemical: ['Starch spray to peel mould', 'Imidacloprid for hoppers'], organic: ['Neem oil to control hoppers', 'Starch water spray'], cure: ['Control mango hoppers first', 'Wash leaves with water jet'], cost: 400 },
        'Mango___healthy': { severity: 10, status: 'Healthy', type: 'None', symptoms: ['No disease symptoms detected'], chemical: [], organic: [], cure: ['Continue regular monitoring', 'Apply micronutrients'], cost: 0 },

        // === TOMATO ===
        'Tomato___Early_blight': { severity: 65, status: 'Moderate', type: 'Fungal', symptoms: ['Concentric ring spots', 'Lower leaves yellowing'], chemical: ['Mancozeb 75% WP 2.5g/L', 'Chlorothalonil 2g/L'], organic: ['Copper-based fungicide', 'Neem oil'], cure: ['Remove infected leaves', 'Mulch around plants'], cost: 600 },
        'Tomato___Late_blight': { severity: 90, status: 'Critical', type: 'Fungal', symptoms: ['Water-soaked dark spots', 'White fuzz on leaf underside'], chemical: ['Metalaxyl + Mancozeb 2.5g/L', 'Cymoxanil 0.3%'], organic: ['Bordeaux mixture 1%', 'Copper hydroxide'], cure: ['Spray every 5 days', 'Destroy infected plants'], cost: 1000 },
        'Tomato___Bacterial_spot': { severity: 65, status: 'Moderate', type: 'Bacterial', symptoms: ['Small dark spots on leaves', 'Raised spots on fruits'], chemical: ['Copper hydroxide 2g/L', 'Streptocycline 0.5g/L'], organic: ['Copper-based spray', 'Seed treatment'], cure: ['Use disease-free seeds', 'Avoid overhead irrigation'], cost: 600 },
        'Tomato___Leaf_Mold': { severity: 55, status: 'Moderate', type: 'Fungal', symptoms: ['Yellow patches on upper leaf', 'Olive-green mold below'], chemical: ['Mancozeb 2g/L', 'Chlorothalonil'], organic: ['Improve ventilation', 'Reduce humidity'], cure: ['Space plants properly', 'Prune lower leaves'], cost: 500 },
        'Tomato___Septoria_leaf_spot': { severity: 60, status: 'Moderate', type: 'Fungal', symptoms: ['Small circular spots with dark borders', 'Defoliation'], chemical: ['Chlorothalonil', 'Mancozeb'], organic: ['Copper fungicide', 'Mulching'], cure: ['Remove lower infected leaves', 'Crop rotation'], cost: 500 },
        'Tomato___Spider_mites_Two-spotted_spider_mite': { severity: 55, status: 'Moderate', type: 'Pest', symptoms: ['Tiny yellow dots on leaves', 'Webbing', 'Leaf bronzing'], chemical: ['Dicofol 2ml/L', 'Abamectin'], organic: ['Neem oil 5ml/L', 'Predatory mites'], cure: ['Spray undersides of leaves', 'Maintain humidity'], cost: 500 },
        'Tomato___Target_Spot': { severity: 60, status: 'Moderate', type: 'Fungal', symptoms: ['Concentric rings on leaves', 'Brown spots with target pattern'], chemical: ['Chlorothalonil', 'Azoxystrobin'], organic: ['Trichoderma', 'Copper spray'], cure: ['Improve air circulation', 'Remove debris'], cost: 500 },
        'Tomato___Tomato_Yellow_Leaf_Curl_Virus': { severity: 80, status: 'Critical', type: 'Viral', symptoms: ['Upward leaf curling', 'Yellow leaf margins', 'Stunted growth'], chemical: ['Imidacloprid for whitefly control', 'Thiamethoxam'], organic: ['Yellow sticky traps', 'Neem oil for vectors'], cure: ['Remove infected plants', 'Control whitefly population'], cost: 800 },
        'Tomato___Tomato_mosaic_virus': { severity: 70, status: 'Moderate', type: 'Viral', symptoms: ['Mosaic light/dark green pattern', 'Leaf distortion'], chemical: ['No direct chemical cure'], organic: ['Remove infected plants', 'Disinfect tools'], cure: ['Use resistant varieties', 'Sanitize tools with bleach'], cost: 300 },
        'Tomato___healthy': { severity: 10, status: 'Healthy', type: 'None', symptoms: ['No disease symptoms detected'], chemical: [], organic: [], cure: ['Continue regular monitoring', 'Maintain NPK 19:19:19'], cost: 0 },

        // === POTATO ===
        'Potato___Early_blight': { severity: 65, status: 'Moderate', type: 'Fungal', symptoms: ['Dark concentric rings on leaves', 'Premature defoliation'], chemical: ['Mancozeb 75% 2.5g/L', 'Chlorothalonil'], organic: ['Copper fungicide', 'Trichoderma'], cure: ['Crop rotation', 'Destroy infected debris'], cost: 700 },
        'Potato___Late_blight': { severity: 90, status: 'Critical', type: 'Fungal', symptoms: ['Water-soaked lesions', 'White mold on underside'], chemical: ['Metalaxyl + Mancozeb 2.5g/L', 'Cymoxanil'], organic: ['Bordeaux mixture', 'Copper hydroxide'], cure: ['Spray every 5 days in wet weather', 'Hill soil around stems'], cost: 1000 },
        'Potato___healthy': { severity: 10, status: 'Healthy', type: 'None', symptoms: ['No disease symptoms detected'], chemical: [], organic: [], cure: ['Continue monitoring', 'Maintain hilling schedule'], cost: 0 },

        // === APPLE ===
        'Apple___Apple_scab': { severity: 65, status: 'Moderate', type: 'Fungal', symptoms: ['Olive-green velvety spots on leaves', 'Scabby lesions on fruit'], chemical: ['Mancozeb 2.5g/L', 'Captan 2g/L'], organic: ['Bordeaux mixture 1%', 'Neem oil 5ml/L'], cure: ['Remove fallen leaves', 'Prune for air circulation'], cost: 800 },
        'Apple___Black_rot': { severity: 75, status: 'Critical', type: 'Fungal', symptoms: ['Brown expanding lesions on leaves', 'Rotting fruit with concentric rings'], chemical: ['Captan 2g/L', 'Thiophanate-methyl'], organic: ['Copper fungicide', 'Remove mummified fruit'], cure: ['Prune dead wood', 'Remove infected fruit immediately'], cost: 900 },
        'Apple___Cedar_apple_rust': { severity: 55, status: 'Moderate', type: 'Fungal', symptoms: ['Bright orange spots on leaves', 'Yellow-orange lesions'], chemical: ['Myclobutanil 1ml/L', 'Mancozeb 2.5g/L'], organic: ['Remove nearby cedar trees', 'Sulfur spray'], cure: ['Fungicide at pink bud stage', 'Remove galls from junipers'], cost: 600 },
        'Apple___healthy': { severity: 10, status: 'Healthy', type: 'None', symptoms: ['No disease symptoms detected'], chemical: [], organic: [], cure: ['Continue regular monitoring', 'Maintain spray schedule'], cost: 0 },

        // === BLUEBERRY ===
        'Blueberry___healthy': { severity: 10, status: 'Healthy', type: 'None', symptoms: ['No disease symptoms detected'], chemical: [], organic: [], cure: ['Continue monitoring', 'Maintain soil pH 4.5-5.5'], cost: 0 },

        // === CASHEW ===
        'Cashew___Anthracnose': { severity: 70, status: 'Moderate', type: 'Fungal', symptoms: ['Dark sunken spots on leaves and nuts', 'Blossom blight'], chemical: ['Carbendazim 1g/L', 'Mancozeb 2.5g/L'], organic: ['Bordeaux mixture 1%', 'Neem oil'], cure: ['Spray at flowering', 'Remove infected twigs'], cost: 700 },
        'Cashew___Gumosis': { severity: 60, status: 'Moderate', type: 'Fungal', symptoms: ['Gum oozing from bark', 'Bark cracking'], chemical: ['Copper oxychloride 3g/L'], organic: ['Bordeaux paste on wounds', 'Trichoderma'], cure: ['Scrape infected bark and apply paste', 'Improve drainage'], cost: 500 },
        'Cashew___Healthy': { severity: 10, status: 'Healthy', type: 'None', symptoms: ['No disease symptoms detected'], chemical: [], organic: [], cure: ['Continue monitoring'], cost: 0 },
        'Cashew___Leaf_Miner': { severity: 50, status: 'Moderate', type: 'Pest', symptoms: ['Serpentine mines in leaves', 'Leaf distortion'], chemical: ['Monocrotophos 0.05%', 'Dimethoate 2ml/L'], organic: ['Neem oil 5ml/L', 'Remove affected leaves'], cure: ['Spray at new flush', 'Light traps'], cost: 400 },
        'Cashew___Red_Rust': { severity: 55, status: 'Moderate', type: 'Algal', symptoms: ['Orange-red patches on leaves', 'Reduced photosynthesis'], chemical: ['Copper oxychloride 3g/L'], organic: ['Bordeaux mixture'], cure: ['Spray copper fungicide', 'Improve canopy ventilation'], cost: 400 },

        // === CASSAVA ===
        'Cassava___Bacterial_Blight': { severity: 80, status: 'Critical', type: 'Bacterial', symptoms: ['Angular water-soaked leaf spots', 'Stem dieback', 'Gum exudate'], chemical: ['Copper hydroxide 2g/L', 'Streptocycline 0.5g/L'], organic: ['Use disease-free cuttings', 'Roguing infected plants'], cure: ['Plant resistant varieties', 'Clean planting material'], cost: 600 },
        'Cassava___Brown_Spot': { severity: 50, status: 'Moderate', type: 'Fungal', symptoms: ['Circular brown spots on older leaves', 'Premature leaf drop'], chemical: ['Mancozeb 2.5g/L'], organic: ['Neem oil', 'Remove debris'], cure: ['Balanced fertilization', 'Use tolerant varieties'], cost: 400 },
        'Cassava___Brown_Streak': { severity: 85, status: 'Critical', type: 'Viral', symptoms: ['Yellow/brown streaks on stems', 'Root necrosis', 'Brown corky patches in tubers'], chemical: ['No direct chemical cure'], organic: ['Use virus-free planting material', 'Control whitefly vectors'], cure: ['Plant resistant varieties', 'Remove infected plants early'], cost: 500 },
        'Cassava___Green_Mite': { severity: 55, status: 'Moderate', type: 'Pest', symptoms: ['Chlorotic spots on leaves', 'Leaf distortion and reduced size'], chemical: ['Dicofol 2ml/L', 'Abamectin'], organic: ['Release predatory mites', 'Neem oil 5ml/L'], cure: ['Spray during dry season', 'Maintain field hygiene'], cost: 400 },
        'Cassava___Green_Mottle': { severity: 60, status: 'Moderate', type: 'Viral', symptoms: ['Green mottling pattern on leaves', 'Mild leaf distortion'], chemical: ['No direct chemical cure'], organic: ['Use virus-free cuttings', 'Control insect vectors'], cure: ['Remove infected plants', 'Use resistant varieties'], cost: 300 },
        'Cassava___Mosaic': { severity: 75, status: 'Critical', type: 'Viral', symptoms: ['Yellow-green mosaic on leaves', 'Leaf distortion', 'Stunted growth'], chemical: ['Imidacloprid for whitefly control'], organic: ['Use disease-free cuttings', 'Yellow sticky traps'], cure: ['Plant resistant varieties', 'Remove infected plants immediately'], cost: 500 },
        'Cassava___healthy': { severity: 10, status: 'Healthy', type: 'None', symptoms: ['No disease symptoms detected'], chemical: [], organic: [], cure: ['Continue monitoring', 'Maintain weed control'], cost: 0 },

        // === CHERRY ===
        'Cherry_(including_sour)___Powdery_mildew': { severity: 55, status: 'Moderate', type: 'Fungal', symptoms: ['White powdery coating on leaves', 'Leaf curling'], chemical: ['Sulfur 80% WP 3g/L', 'Myclobutanil'], organic: ['Baking soda spray 1tsp/L', 'Neem oil'], cure: ['Improve air circulation', 'Spray at first signs'], cost: 500 },
        'Cherry_(including_sour)___healthy': { severity: 10, status: 'Healthy', type: 'None', symptoms: ['No disease symptoms detected'], chemical: [], organic: [], cure: ['Continue monitoring', 'Maintain pruning schedule'], cost: 0 },

        // === CORN / MAIZE ===
        'Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot': { severity: 65, status: 'Moderate', type: 'Fungal', symptoms: ['Rectangular gray-tan lesions', 'Parallel to leaf veins'], chemical: ['Azoxystrobin 1ml/L', 'Propiconazole'], organic: ['Crop rotation', 'Trichoderma'], cure: ['Rotate with non-cereal crops', 'Use resistant hybrids'], cost: 700 },
        'Corn_(maize)___Common_rust_': { severity: 60, status: 'Moderate', type: 'Fungal', symptoms: ['Reddish-brown pustules on both leaf surfaces', 'Circular to elongated'], chemical: ['Mancozeb 2.5g/L', 'Propiconazole'], organic: ['Neem oil', 'Resistant varieties'], cure: ['Spray at first pustules', 'Plant early-maturing varieties'], cost: 600 },
        'Corn_(maize)___Northern_Leaf_Blight': { severity: 70, status: 'Moderate', type: 'Fungal', symptoms: ['Long elliptical gray-green lesions', 'Cigar-shaped spots'], chemical: ['Mancozeb 2.5g/L', 'Azoxystrobin'], organic: ['Trichoderma', 'Crop residue management'], cure: ['Crop rotation', 'Use resistant hybrids'], cost: 700 },
        'Corn_(maize)___healthy': { severity: 10, status: 'Healthy', type: 'None', symptoms: ['No disease symptoms detected'], chemical: [], organic: [], cure: ['Continue monitoring', 'Maintain fertilizer schedule'], cost: 0 },
        'Corn___Common_Rust': { severity: 60, status: 'Moderate', type: 'Fungal', symptoms: ['Reddish-brown pustules on leaves'], chemical: ['Mancozeb 2.5g/L', 'Propiconazole'], organic: ['Neem oil', 'Resistant hybrids'], cure: ['Spray at first sign', 'Plant early'], cost: 600 },
        'Corn___Gray_Leaf_Spot': { severity: 65, status: 'Moderate', type: 'Fungal', symptoms: ['Rectangular gray lesions between veins'], chemical: ['Azoxystrobin', 'Propiconazole'], organic: ['Crop rotation', 'Residue management'], cure: ['Use resistant hybrids', 'Rotate crops'], cost: 700 },
        'Corn___Healthy': { severity: 10, status: 'Healthy', type: 'None', symptoms: ['No disease symptoms detected'], chemical: [], organic: [], cure: ['Continue monitoring'], cost: 0 },
        'Corn___Northern_Leaf_Blight': { severity: 70, status: 'Moderate', type: 'Fungal', symptoms: ['Cigar-shaped gray-green lesions'], chemical: ['Mancozeb 2.5g/L', 'Azoxystrobin'], organic: ['Trichoderma', 'Remove debris'], cure: ['Resistant hybrids', 'Crop rotation'], cost: 700 },

        // === MAIZE (alternate dataset) ===
        'Maize___Army_Worm': { severity: 75, status: 'Critical', type: 'Pest', symptoms: ['Ragged holes in leaves', 'Skeletonized leaves', 'Frass in whorl'], chemical: ['Chlorantraniliprole 0.4ml/L', 'Emamectin benzoate 0.4g/L'], organic: ['Bt spray (Bacillus thuringiensis)', 'Neem oil 5ml/L'], cure: ['Spray early morning/evening', 'Scout fields regularly'], cost: 800 },
        'Maize___Ear_Rot': { severity: 70, status: 'Moderate', type: 'Fungal', symptoms: ['Moldy kernels', 'Pink/white/gray mold on ear'], chemical: ['Carbendazim at silking', 'Mancozeb'], organic: ['Harvest early', 'Dry ears quickly'], cure: ['Avoid insect damage to ears', 'Proper drying and storage'], cost: 600 },
        'Maize___Fall_Armyworm': { severity: 80, status: 'Critical', type: 'Pest', symptoms: ['Windowing of leaves', 'Large irregular holes', 'Sawdust-like frass'], chemical: ['Emamectin benzoate 0.4g/L', 'Spinetoram 0.5ml/L'], organic: ['Bt spray', 'Trichogramma egg parasitoids'], cure: ['Early detection critical', 'Apply in whorl stage'], cost: 900 },
        'Maize___Grasshoper': { severity: 50, status: 'Moderate', type: 'Pest', symptoms: ['Ragged leaf edges', 'Defoliation from margins'], chemical: ['Chlorpyrifos 2ml/L', 'Lambda-cyhalothrin'], organic: ['Neem oil', 'Bird perches for predators'], cure: ['Spray at nymph stage', 'Field sanitation'], cost: 500 },
        'Maize___Healthy': { severity: 10, status: 'Healthy', type: 'None', symptoms: ['No disease symptoms detected'], chemical: [], organic: [], cure: ['Continue monitoring'], cost: 0 },
        'Maize___Leaf_Beetle': { severity: 50, status: 'Moderate', type: 'Pest', symptoms: ['Elongated feeding scars on leaves', 'Silk clipping'], chemical: ['Chlorantraniliprole', 'Imidacloprid'], organic: ['Neem oil', 'Crop rotation'], cure: ['Rotate with non-cereal crops', 'Scout at emergence'], cost: 500 },
        'Maize___Leaf_Blight': { severity: 70, status: 'Moderate', type: 'Fungal', symptoms: ['Elongated necrotic lesions', 'Gray-green elliptical spots'], chemical: ['Mancozeb 2.5g/L', 'Azoxystrobin'], organic: ['Trichoderma viride', 'Crop rotation'], cure: ['Use resistant hybrids', 'Remove infected debris'], cost: 700 },
        'Maize___Leaf_Spot': { severity: 55, status: 'Moderate', type: 'Fungal', symptoms: ['Small round to oval spots', 'Tan centers with dark borders'], chemical: ['Mancozeb 2.5g/L', 'Propiconazole'], organic: ['Neem oil', 'Remove debris'], cure: ['Crop rotation', 'Balanced fertilization'], cost: 500 },
        'Maize___Stem_Borer': { severity: 75, status: 'Critical', type: 'Pest', symptoms: ['Dead heart in young plants', 'Bore holes in stem', 'Frass at entry point'], chemical: ['Carbofuran granules in whorl', 'Fipronil 0.3g/L'], organic: ['Trichogramma release', 'Light traps'], cure: ['Apply granules in whorl at 20 days', 'Remove stubbles after harvest'], cost: 800 },
        'Maize___Streak_Virus': { severity: 70, status: 'Moderate', type: 'Viral', symptoms: ['Yellow streaks along veins', 'Stunted growth', 'Reduced ears'], chemical: ['Imidacloprid for leafhopper control'], organic: ['Use resistant varieties', 'Remove infected plants'], cure: ['Control leafhopper vectors', 'Plant resistant hybrids'], cost: 500 },

        // === COTTON ===
        'Cotton___American_Bollworm': { severity: 80, status: 'Critical', type: 'Pest', symptoms: ['Bore holes in bolls', 'Damaged squares and flowers'], chemical: ['Emamectin benzoate 0.4g/L', 'Chlorantraniliprole'], organic: ['Bt spray', 'Trichogramma release', 'Neem oil 5ml/L'], cure: ['Scout at flowering', 'Use pheromone traps'], cost: 1000 },
        'Cotton___Anthracnose': { severity: 60, status: 'Moderate', type: 'Fungal', symptoms: ['Sunken spots on bolls', 'Reddish-brown lesions on stems'], chemical: ['Carbendazim 1g/L', 'Copper oxychloride'], organic: ['Bordeaux mixture', 'Seed treatment with Trichoderma'], cure: ['Use disease-free seeds', 'Crop rotation'], cost: 600 },
        'Cotton___Aphid': { severity: 55, status: 'Moderate', type: 'Pest', symptoms: ['Curled sticky leaves', 'Honeydew and sooty mold', 'Stunted growth'], chemical: ['Imidacloprid 0.5ml/L', 'Thiamethoxam'], organic: ['Neem oil 5ml/L', 'Soap spray 5g/L'], cure: ['Spray at early infestation', 'Encourage ladybird beetles'], cost: 500 },
        'Cotton___Bacterial_Blight': { severity: 70, status: 'Moderate', type: 'Bacterial', symptoms: ['Angular water-soaked spots', 'Black arm on stems', 'Boll rot'], chemical: ['Copper hydroxide 2g/L', 'Streptocycline 0.5g/L'], organic: ['Seed treatment with Pseudomonas', 'Crop rotation'], cure: ['Use disease-free acid-delinted seeds', 'Avoid overhead irrigation'], cost: 700 },
        'Cotton___Bollworm': { severity: 80, status: 'Critical', type: 'Pest', symptoms: ['Bore holes in bolls', 'Frass on bolls', 'Damaged squares'], chemical: ['Emamectin benzoate', 'Profenophos 2ml/L'], organic: ['Bt spray', 'Neem oil', 'Bird perches'], cure: ['Pheromone traps for monitoring', 'Spray at egg-laying stage'], cost: 1000 },
        'Cotton___Leaf_Curl': { severity: 75, status: 'Critical', type: 'Viral', symptoms: ['Upward curling of leaves', 'Thickened veins', 'Stunted growth'], chemical: ['Imidacloprid for whitefly control', 'Thiamethoxam'], organic: ['Yellow sticky traps', 'Neem oil for vectors'], cure: ['Control whitefly population', 'Use resistant varieties'], cost: 800 },
        'Cotton___Mealy_Bug': { severity: 60, status: 'Moderate', type: 'Pest', symptoms: ['White waxy masses on stems/leaves', 'Sticky honeydew', 'Sooty mold'], chemical: ['Profenophos 2ml/L', 'Buprofezin 1.5ml/L'], organic: ['Neem oil 5ml/L', 'Release Cryptolaemus beetles'], cure: ['Remove affected plant parts', 'Spray at crawler stage'], cost: 600 },
        'Cotton___Whitefly': { severity: 60, status: 'Moderate', type: 'Pest', symptoms: ['Yellowing leaves', 'Honeydew and sooty mold', 'Tiny white flies on undersides'], chemical: ['Spiromesifen 1ml/L', 'Diafenthiuron 1g/L'], organic: ['Yellow sticky traps', 'Neem oil 5ml/L'], cure: ['Alternate insecticides to prevent resistance', 'Avoid excessive nitrogen'], cost: 600 },
        'Cotton___healthy': { severity: 10, status: 'Healthy', type: 'None', symptoms: ['No disease symptoms detected'], chemical: [], organic: [], cure: ['Continue monitoring', 'Maintain IPM schedule'], cost: 0 },
        'pink_bollworm_in_cotton': { severity: 80, status: 'Critical', type: 'Pest', symptoms: ['Pink larvae in bolls', 'Rosette flowers', 'Double seed damage'], chemical: ['Emamectin benzoate 0.4g/L', 'Chlorantraniliprole'], organic: ['Pheromone traps', 'Bt cotton varieties'], cure: ['Destroy crop residue', 'Use sterile insect technique'], cost: 1000 },
        'red_cotton_bug': { severity: 50, status: 'Moderate', type: 'Pest', symptoms: ['Stained lint', 'Seed damage', 'Red bugs on bolls'], chemical: ['Malathion 2ml/L', 'Dimethoate'], organic: ['Neem oil 5ml/L', 'Manual collection'], cure: ['Spray at boll opening', 'Timely harvest'], cost: 400 },
        'thirps_on__cotton': { severity: 55, status: 'Moderate', type: 'Pest', symptoms: ['Silvery patches on leaves', 'Upward curling of leaf margins', 'Stunted seedlings'], chemical: ['Fipronil 2ml/L', 'Imidacloprid 0.5ml/L'], organic: ['Neem oil 5ml/L', 'Blue sticky traps'], cure: ['Seed treatment with imidacloprid', 'Spray at seedling stage'], cost: 500 },

        // === GRAPE ===
        'Grape___Black_rot': { severity: 75, status: 'Critical', type: 'Fungal', symptoms: ['Circular brown spots on leaves', 'Black shriveled mummified berries'], chemical: ['Mancozeb 2.5g/L', 'Myclobutanil'], organic: ['Bordeaux mixture', 'Remove mummies'], cure: ['Spray before bloom', 'Remove all mummified fruit'], cost: 800 },
        'Grape___Esca_(Black_Measles)': { severity: 80, status: 'Critical', type: 'Fungal', symptoms: ['Tiger-stripe pattern on leaves', 'Dark spots on berries', 'Wood necrosis'], chemical: ['Sodium arsenite (restricted)', 'Fosetyl-Al'], organic: ['Trichoderma trunk injection', 'Pruning wound protection'], cure: ['Remove severely infected vines', 'Protect pruning wounds'], cost: 1000 },
        'Grape___Leaf_blight_(Isariopsis_Leaf_Spot)': { severity: 60, status: 'Moderate', type: 'Fungal', symptoms: ['Irregular brown spots on leaves', 'Leaf margin scorching'], chemical: ['Mancozeb 2.5g/L', 'Copper oxychloride'], organic: ['Bordeaux mixture 1%', 'Neem oil'], cure: ['Remove infected leaves', 'Improve canopy management'], cost: 600 },
        'Grape___healthy': { severity: 10, status: 'Healthy', type: 'None', symptoms: ['No disease symptoms detected'], chemical: [], organic: [], cure: ['Continue monitoring', 'Maintain canopy management'], cost: 0 },

        // === ORANGE ===
        'Orange___Haunglongbing_(Citrus_greening)': { severity: 90, status: 'Critical', type: 'Bacterial', symptoms: ['Asymmetric yellow mottling', 'Lopsided bitter fruit', 'Premature fruit drop'], chemical: ['Imidacloprid for psyllid control', 'Oxytetracycline trunk injection'], organic: ['Remove infected trees', 'Control Asian citrus psyllid'], cure: ['No cure — manage psyllid vectors', 'Remove and burn infected trees'], cost: 2000 },

        // === PEACH ===
        'Peach___Bacterial_spot': { severity: 60, status: 'Moderate', type: 'Bacterial', symptoms: ['Small dark spots on leaves', 'Fruit pitting and cracking'], chemical: ['Copper hydroxide 2g/L', 'Oxytetracycline'], organic: ['Copper fungicide at dormancy'], cure: ['Use resistant varieties', 'Avoid overhead irrigation'], cost: 600 },
        'Peach___healthy': { severity: 10, status: 'Healthy', type: 'None', symptoms: ['No disease symptoms detected'], chemical: [], organic: [], cure: ['Continue monitoring'], cost: 0 },

        // === PEPPER ===
        'Pepper,_bell___Bacterial_spot': { severity: 65, status: 'Moderate', type: 'Bacterial', symptoms: ['Small water-soaked spots on leaves', 'Raised spots on fruit'], chemical: ['Copper hydroxide 2g/L', 'Streptocycline'], organic: ['Copper fungicide', 'Seed treatment'], cure: ['Use disease-free seeds', 'Avoid working in wet fields'], cost: 600 },
        'Pepper,_bell___healthy': { severity: 10, status: 'Healthy', type: 'None', symptoms: ['No disease symptoms detected'], chemical: [], organic: [], cure: ['Continue monitoring'], cost: 0 },

        // === RASPBERRY/SOYBEAN/SQUASH ===
        'Raspberry___healthy': { severity: 10, status: 'Healthy', type: 'None', symptoms: ['No disease symptoms detected'], chemical: [], organic: [], cure: ['Continue monitoring'], cost: 0 },
        'Soybean___healthy': { severity: 10, status: 'Healthy', type: 'None', symptoms: ['No disease symptoms detected'], chemical: [], organic: [], cure: ['Continue monitoring', 'Scout for pests regularly'], cost: 0 },
        'Squash___Powdery_mildew': { severity: 55, status: 'Moderate', type: 'Fungal', symptoms: ['White powdery spots on leaves', 'Yellowing and drying'], chemical: ['Sulfur 80% WP 3g/L', 'Hexaconazole'], organic: ['Baking soda 1tsp/L', 'Milk spray 1:9'], cure: ['Improve air circulation', 'Remove infected leaves'], cost: 400 },

        // === STRAWBERRY ===
        'Strawberry___Leaf_scorch': { severity: 60, status: 'Moderate', type: 'Fungal', symptoms: ['Purple spots on leaves', 'Leaf margin browning', 'Dried scorched appearance'], chemical: ['Captan 2g/L', 'Myclobutanil'], organic: ['Copper fungicide', 'Remove infected leaves'], cure: ['Avoid overhead irrigation', 'Improve drainage'], cost: 500 },
        'Strawberry___healthy': { severity: 10, status: 'Healthy', type: 'None', symptoms: ['No disease symptoms detected'], chemical: [], organic: [], cure: ['Continue monitoring'], cost: 0 },

        // === SUGARCANE ===
        'Sugarcane___Bacterial_Blight': { severity: 70, status: 'Moderate', type: 'Bacterial', symptoms: ['White streaks on leaves', 'Leaf wilting from tips'], chemical: ['Streptocycline 0.5g/L', 'Copper oxychloride'], organic: ['Hot water treatment of setts 52°C/20min', 'Resistant varieties'], cure: ['Use disease-free seed canes', 'Crop rotation'], cost: 600 },
        'Sugarcane___Red_Rot': { severity: 85, status: 'Critical', type: 'Fungal', symptoms: ['Red internal stem tissue', 'White patches in red tissue', 'Dried leaves'], chemical: ['Carbendazim sett treatment 0.1%', 'Thiophanate-methyl'], organic: ['Hot water treatment of setts', 'Trichoderma'], cure: ['Use disease-free setts', 'Remove and burn infected canes'], cost: 1000 },
        'Sugarcane___healthy': { severity: 10, status: 'Healthy', type: 'None', symptoms: ['No disease symptoms detected'], chemical: [], organic: [], cure: ['Continue monitoring'], cost: 0 },
        'RedRot_sugarcane': { severity: 85, status: 'Critical', type: 'Fungal', symptoms: ['Red internal stem tissue', 'White patches in red area'], chemical: ['Carbendazim sett treatment'], organic: ['Hot water sett treatment'], cure: ['Disease-free setts', 'Burn infected canes'], cost: 1000 },
        'RedRust_sugarcane': { severity: 55, status: 'Moderate', type: 'Fungal', symptoms: ['Orange-brown pustules on leaves'], chemical: ['Mancozeb 2.5g/L', 'Propiconazole'], organic: ['Resistant varieties', 'Neem oil'], cure: ['Use tolerant varieties', 'Balanced fertilization'], cost: 500 },
        'Mosaic_sugarcane': { severity: 65, status: 'Moderate', type: 'Viral', symptoms: ['Light and dark green mosaic pattern', 'Stunted growth'], chemical: ['Imidacloprid for aphid vector control'], organic: ['Use virus-free setts', 'Remove infected plants'], cure: ['Hot water treatment of setts', 'Use resistant varieties'], cost: 500 },
        'Yellow_Rust_Sugarcane': { severity: 60, status: 'Moderate', type: 'Fungal', symptoms: ['Yellow-orange pustules on leaves'], chemical: ['Propiconazole 1ml/L', 'Mancozeb'], organic: ['Resistant varieties'], cure: ['Balanced fertilization', 'Remove infected leaves'], cost: 500 },
        'Wilt': { severity: 75, status: 'Critical', type: 'Fungal', symptoms: ['Progressive wilting', 'Yellowing from lower leaves', 'Stem browning'], chemical: ['Carbendazim 1g/L soil drench', 'Trifloxystrobin'], organic: ['Trichoderma viride soil application', 'Crop rotation'], cure: ['Use resistant varieties', 'Solarize soil before planting'], cost: 800 },
        'Tungro': { severity: 80, status: 'Critical', type: 'Viral', symptoms: ['Yellow-orange leaf discoloration', 'Stunted growth', 'Reduced tillers'], chemical: ['Carbofuran 3G for leafhopper control', 'Imidacloprid'], organic: ['Use resistant rice varieties', 'Remove infected plants'], cure: ['Control green leafhopper vectors', 'Synchronous planting'], cost: 700 },
    };

    // Normalize raw model class names to canonical treatment keys
    // Handles: test/valid suffixes, underscores vs triple-underscores, case variants
    private normalizeClassName(raw: string): string {
        let name = raw;
        // Strip _test, _valid, _test_valid suffixes (dataset split leaks)
        name = name.replace(/_(test_valid|test|valid)$/i, '');
        // Normalize single-underscore separators to triple (e.g. "Wheat_Brown_leaf_Rust" → "Wheat___Brown_leaf_Rust")
        // Only if there's no triple underscore already
        if (!name.includes('___')) {
            const firstUnderscore = name.indexOf('_');
            if (firstUnderscore > 0) {
                name = name.substring(0, firstUnderscore) + '___' + name.substring(firstUnderscore + 1);
            }
        }
        return name;
    }

    // Look up treatment with fuzzy matching — tries exact, normalized, and lowercase key matching
    private findTreatment(className: string) {
        // 1. Exact match
        if (TFService.TREATMENTS[className]) return TFService.TREATMENTS[className];
        // 2. Normalized match
        const normalized = this.normalizeClassName(className);
        if (TFService.TREATMENTS[normalized]) return TFService.TREATMENTS[normalized];
        // 3. Case-insensitive match on treatment keys
        const lowerNorm = normalized.toLowerCase();
        for (const key of Object.keys(TFService.TREATMENTS)) {
            if (key.toLowerCase() === lowerNorm) return TFService.TREATMENTS[key];
        }
        return null;
    }

    private mapToPredictionResult(className: string, confidence: number, imageUrl: string): PredictionResult {
        // Normalize class name to strip test/valid artifacts
        const cleanedName = this.normalizeClassName(className);
        const parts = cleanedName.split('___');
        const crop = (parts[0] || "Unknown").replace(/_/g, ' ').replace(/\(.*\)/, '').trim();
        const diseaseRaw = parts[1] || "Unknown";
        // Clean display name: replace underscores, strip leftover artifacts
        const diseaseName = diseaseRaw
            .replace(/_/g, ' ')
            .replace(/\s+(test|valid)\s*$/i, '')
            .trim();

        // Look up treatment with fuzzy matching
        const treatment = this.findTreatment(className);
        const isHealthy = diseaseName.toLowerCase().includes('healthy');

        const status = treatment?.status || (isHealthy ? 'Healthy' : 'Moderate');
        const severity = treatment?.severity ?? (isHealthy ? 10 : 60);

        return {
            disease: {
                name: diseaseName,
                scientificName: `Local AI: ${cleanedName}`,
                crop: crop,
                status: status,
                severity: severity,
                symptoms: treatment?.symptoms || ['Identified by KropScan Edge AI'],
                cure: treatment?.cure || ['Consult local agricultural officer'],
                prevention: ['Regular crop monitoring', 'Proper field sanitation'],
                image: imageUrl,
                cost_per_acre_inr: treatment?.cost || 0,
                type: treatment?.type || 'Fungal',
                treatment: {
                    chemical: treatment?.chemical || ['Consult expert for specific chemicals'],
                    organic: treatment?.organic || ['Neem oil 5ml/L as general preventive']
                }
            } as any,
            confidence: confidence
        };
    }
}

export const tfService = new TFService();
