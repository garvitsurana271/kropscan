import { PredictionResult } from '../types';
import { tfService } from './TFService';
export type { PredictionResult };

// Fallback Mock Data
const MOCK_DISEASES: Record<string, PredictionResult['disease']> = {
    'Generic_Disease': {
        name: 'Potential Disease Detected',
        scientificName: 'Pathogen sp.',
        crop: 'Plant',
        prevention: ['Isolate affected plants', 'Check humidity levels'],
        treatment: {
            chemical: ['Broad spectrum fungicide'],
            organic: ['Copper based fungicide']
        },
        cost_per_acre_inr: 1000,
        symptoms: ['Discoloration', 'Spots'],
        cure: ['Consult expert'],
        image: ''
    }
};

class ClassifierService {
    async classifyImage(imageElement: HTMLImageElement, language: string = 'English'): Promise<PredictionResult> {

        // 0. Quality Gate
        const { checkImageQuality } = await import('../utils/ImageQualityChecker');
        const qualityCheck = checkImageQuality(imageElement);
        if (!qualityCheck.isValid) {
            if (import.meta.env.DEV) console.warn("Image rejected by Quality Guard:", qualityCheck.reason);
            throw new Error(qualityCheck.reason || "Image quality too low");
        }

        // HYBRID AI ENGINE: Default to Local ONNX (WebAssembly) -> Fallback to Cloud Vision (High Accuracy)
        try {
            if (import.meta.env.DEV) console.log("Starting Local ONNX Analysis...");
            const tfServiceMod = await import('./TFService');
            let localResult: PredictionResult | null = null;
            let localError: Error | null = null;
            
            try {
                localResult = await tfServiceMod.tfService.classify(imageElement);
                if (import.meta.env.DEV) console.log(`Local ONNX Diagnosis (${(localResult.confidence * 100).toFixed(1)}%):`, localResult.disease.name);
            } catch (err: any) {
                if (import.meta.env.DEV) console.warn("Local ONNX inference failed:", err);
                localError = err;
            }

            // Determine if we need to escalate to Cloud AI
            // Blight only: local model cannot reliably distinguish early vs late
            const isBlight = localResult?.disease?.name &&
                /blight/i.test(localResult.disease.name);

            const needsCloudCheck =
                !localResult ||
                localResult.confidence < 0.55 ||
                isBlight ||
                localResult.disease.name === "Unknown" ||
                localResult.disease.name.includes("Generic");

            const isOffline = !navigator.onLine || localStorage.getItem('offlineMode') === 'true';

            if (needsCloudCheck && !isOffline) {
                if (import.meta.env.DEV) console.log(`Confidence is low (<75%) or local model unsure. Escalating to Cloud Vision (Language: ${language})...`);
                try {
                    const geminiService = await import('./GeminiService');
                    const visionResult = await geminiService.analyzeDiseaseWithVision(imageElement.src, language);

                    if (visionResult) {
                        if (visionResult.disease_name === 'Not a Plant' || visionResult.disease_name?.toLowerCase().includes("not a plant")) {
                            if (import.meta.env.DEV) console.warn("Gemini Vision rejected image: Not a Plant.");
                            throw new Error("Not a Plant");
                        }

                        if (import.meta.env.DEV) console.log("Cloud Vision Diagnosis:", visionResult);

                        // If cloud confidence is higher than local (or local failed), use cloud result
                        // Do NOT default to 0.90 — if Gemini didn't return confidence, treat as moderate (0.70)
                        const cloudConfidence = typeof visionResult.confidence === 'number'
                            ? visionResult.confidence
                            : 0.70;

                        // For blight: ALWAYS use cloud (local can't distinguish early/late)
                        // For others: use cloud if it has higher confidence
                        if (!localResult || isBlight || cloudConfidence > localResult.confidence) {
                            let severity = 50;
                            if (visionResult.status === 'Critical') severity = 90;
                            if (visionResult.status === 'Healthy') severity = 10;
                            if (visionResult.severity && typeof visionResult.severity === 'number') severity = visionResult.severity;

                            return {
                                disease: {
                                    name: visionResult.disease_name,
                                    scientificName: `AI-Verified: ${visionResult.disease_name}`,
                                    crop: visionResult.crop_name || "Unknown Crop",
                                    status: visionResult.status || 'Moderate',
                                    severity: severity,
                                    symptoms: Array.isArray(visionResult.symptoms) && visionResult.symptoms.length > 0
                                        ? visionResult.symptoms
                                        : ["Identified by KropScan Cloud AI"],
                                    cure: visionResult.cure || ["Consult local expert"],
                                    prevention: ["Regular monitoring", "Ensure proper nutrition"],
                                    image: imageElement.src,
                                    cost_per_acre_inr: visionResult.cost || 0,
                                    type: 'Fungal',
                                    treatment: {
                                        chemical: visionResult.treatment_plan ? [visionResult.treatment_plan] : (visionResult.cure || []),
                                        organic: []
                                    }
                                } as any,
                                confidence: cloudConfidence
                            };
                        } else {
                            if (import.meta.env.DEV) console.log("Local model had higher confidence. Retaining local result.");
                            return localResult;
                        }
                    }
                } catch (cloudErr: any) {
                    if (cloudErr.message === "Not a Plant" || cloudErr.message?.includes("Not a Plant")) {
                        throw cloudErr;
                    }
                    if (import.meta.env.DEV) console.warn("Cloud fallback failed:", cloudErr);
                    // If cloud fails, gracefully fall down to local result if it exists
                }
            } else if (needsCloudCheck && isOffline) {
               if (import.meta.env.DEV) console.warn("Cloud fallback needed but user is offline. Returning best effort local result.");
            }

            // Return local result if cloud wasn't triggered, cloud failed, or local had higher confidence
            if (localResult) return localResult;

            // If everything failed, return a graceful "unknown" result instead of crashing
            if (import.meta.env.DEV) console.warn("All AI engines failed. Returning graceful fallback.");
            return {
                disease: {
                    name: "Unable to Identify",
                    scientificName: "Retry recommended",
                    crop: "Unknown",
                    status: "Unknown",
                    severity: 0,
                    symptoms: ["Could not analyze this image. Please try again with a clearer photo."],
                    cure: ["Retake photo in good lighting", "Ensure the leaf fills the frame", "Try connecting to the internet for cloud AI analysis"],
                    prevention: ["Regular crop monitoring"],
                    image: imageElement.src,
                    cost_per_acre_inr: 0,
                    type: 'Unknown',
                    treatment: { chemical: [], organic: [] }
                } as any,
                confidence: 0
            };

        } catch (e: any) {
            // Rethrow explicit rejections (Not a Plant) — ScanWorkspace handles this with a clean modal
            if (e.message === "Not a Plant" || e.message?.includes("Not a Plant")) {
                throw e;
            }

            // For ALL other errors, return a graceful fallback — never show raw errors to user
            console.error("All AI Services Failed:", e);
            return {
                disease: {
                    name: "Analysis Unavailable",
                    scientificName: "Service temporarily unavailable",
                    crop: "Unknown",
                    status: "Unknown",
                    severity: 0,
                    symptoms: ["Our AI service encountered an issue. This is usually temporary."],
                    cure: ["Please try again in a moment", "Check your internet connection", "Try with a different photo"],
                    prevention: ["Regular crop monitoring"],
                    image: imageElement.src,
                    cost_per_acre_inr: 0,
                    type: 'Unknown',
                    treatment: { chemical: [], organic: [] }
                } as any,
                confidence: 0
            };
        }
    }
}

export const classifierService = new ClassifierService();

export const classifyCrop = async (imageFile: File | string, language: string = 'English') => {
    // If it's a File, convert to Image element
    let img: HTMLImageElement;

    if (typeof imageFile === 'string') {
        img = new Image();
        img.src = imageFile;
    } else {
        img = new Image();
        img.src = URL.createObjectURL(imageFile);
    }

    // Wait for load
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
    });

    return classifierService.classifyImage(img, language);
};
