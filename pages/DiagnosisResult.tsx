import React, { useState, useEffect } from 'react';
import { PredictionResult } from '../services/ClassifierService';
import { dbService } from '../services/DatabaseService';
import { UserProfile, NavItem } from '../types';
import { getChatCompletion, translateBatch } from '../services/GeminiService';
import { subscriptionService } from '../services/SubscriptionService';
import { toast } from 'sonner';
import { getTranslation } from '../utils/translations';

interface EnrichedData {
    chemical: string[];
    organic: string[];
    prevention: string[];
    spreadRisk: string;
    affectedArea: string;
    cost: number;
    severity: string;
    soilInsights?: string;
}

const DiagnosisResult: React.FC<{ result: PredictionResult | null, onBack: () => void, user?: UserProfile | null, onNavigate: (tab: NavItem) => void, isExisting?: boolean, language?: string }> = ({ result, onBack, user, onNavigate, isExisting, language = 'English' }) => {
    const t = (key: string) => getTranslation(language, key);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loadingAI, setLoadingAI] = useState(false);
    const [enrichedData, setEnrichedData] = useState<EnrichedData | null>(null);
    const [translated, setTranslated] = useState<Record<string, string>>({});

    // Auto-translate ALL dynamic content when language changes
    useEffect(() => {
        if (language === 'English' || !enrichedData || !result) { setTranslated({}); return; }
        const texts: Record<string, string> = {
            diseaseName: result.disease.name,
            cropName: result.disease.crop || '',
            status: result.disease.status || '',
            spreadRisk: enrichedData.spreadRisk || '',
            severity: enrichedData.severity || '',
            affectedArea: enrichedData.affectedArea || '',
            soilInsights: enrichedData.soilInsights || '',
        };
        // Symptoms
        if (result.disease.symptoms) {
            result.disease.symptoms.forEach((s: string, i: number) => { texts[`symptom_${i}`] = s; });
        }
        // Cure
        if (result.disease.cure) {
            result.disease.cure.forEach((c: string, i: number) => { texts[`cure_${i}`] = c; });
        }
        // Chemicals
        enrichedData.chemical?.forEach((c, i) => { texts[`chem_${i}`] = c; });
        // Organic
        enrichedData.organic?.forEach((o, i) => { texts[`org_${i}`] = o; });
        // Prevention
        enrichedData.prevention?.forEach((p, i) => { texts[`prev_${i}`] = p; });

        translateBatch(texts, language).then(setTranslated);
    }, [language, enrichedData, result]);

    const tr = (key: string, fallback: string) => {
        // 1. Check Gemma-translated dynamic content
        if (translated[key]) return translated[key];
        // 2. Check static translations (for pre-translated treatment text)
        const staticTr = t(fallback);
        if (staticTr !== fallback) return staticTr;
        // 3. Fallback to English
        return fallback;
    };

    // Auto-save logic
    useEffect(() => {
        if (result && user?.id && !saved && !saving && enrichedData && !isExisting) {
            handleSaveReport();
        }
    }, [result, user, enrichedData, saved, saving, isExisting]);

    useEffect(() => {
        const fetchAIAnalysis = async () => {
            if (!result) return;

            // OPTIMIZATION: Check if ClassifierService already enriched the data
            if (result.disease.treatment.chemical.length > 0 && result.disease.treatment.organic.length > 0) {
                if (import.meta.env.DEV) console.log("Using Pre-Calculated Adaptive Treatment");
                setEnrichedData({
                    chemical: result.disease.treatment.chemical,
                    organic: result.disease.treatment.organic,
                    prevention: result.disease.prevention,
                    spreadRisk: (result.disease.severity > 80) ? 'High' : 'Medium',
                    affectedArea: '15%', // Estimate
                    cost: result.disease.cost_per_acre_inr || 1200,
                    severity: (result.disease.severity > 80) ? 'High' : 'Medium'
                });
                return;
            }

            setLoadingAI(true);

            // ... fallback logic if needed, but ClassifierService should handle it ...
            // For now, we keep the old logic as a safety net, but it shouldn't trigger if the above condition is met.

            const crop = result.disease.crop || 'Crop';
            const disease = result.disease.name;

            const prompt = `
            Act as an agricultural expert. Analyze the disease "${disease}" on "${crop}".
            Provide a JSON response (and ONLY JSON) with the following keys:
            - "chemical_treatment": array of strings (specific chemical names and dosages).
            - "organic_treatment": array of strings (organic remedies).
            - "prevention": array of strings (long term prevention).
            - "spread_risk": "Low", "Medium", or "High" (based on disease nature).
            - "affected_area_estimate": number (estimated percentage of leaf area typically affected in this stage, return just the number e.g. 15).
            - "severity": "Low", "Medium", or "High".
            
            Do not include markdown formatting like \`\`\`json. Just the raw JSON string.
            `;

            try {
                const response = await getChatCompletion([{ role: 'user', parts: [{ text: prompt }] }]);
                // clean the response
                const cleanedResponse = response.replace(/```json/g, '').replace(/```/g, '').trim();
                const data = JSON.parse(cleanedResponse);

                setEnrichedData({
                    chemical: data.chemical_treatment || [],
                    organic: data.organic_treatment || [],
                    prevention: data.prevention || [],
                    spreadRisk: data.spread_risk || 'Medium',
                    affectedArea: (data.affected_area_estimate || 15).toString() + '%',
                    cost: data.cost_estimate_inr || 0,
                    severity: data.severity || 'Medium',
                    soilInsights: data.soil_insights || 'Soil testing recommended.'
                });

            } catch (e) {
                console.error("AI Enrichment failed", e);
                // Fallback to basic data if Groq fails
                setEnrichedData({
                    chemical: result.disease.treatment.chemical.length > 0 ? result.disease.treatment.chemical : ['Consult local expert'],
                    organic: result.disease.treatment.organic.length > 0 ? result.disease.treatment.organic : ['Neem oil'],
                    prevention: result.disease.prevention,
                    spreadRisk: 'Unknown',
                    affectedArea: '~10%',
                    cost: result.disease.cost_per_acre_inr,
                    severity: 'Medium'
                });
            } finally {
                setLoadingAI(false);
            }
        };

        fetchAIAnalysis();
    }, [result]);

    if (!result) return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 animate-fade-in">
            <span className="material-icons-round text-6xl text-gray-300">search_off</span>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('No Diagnosis Available')}</h2>
            <p className="text-gray-500 text-sm">{t('Scan a crop to see results')}</p>
            <button onClick={() => onNavigate('scan')} className="mt-4 px-6 py-3 bg-primary text-white rounded-full font-bold shadow-xl shadow-primary/20 hover:-translate-y-0.5 transition-all">
                {t('Start Scanning')}
            </button>
        </div>
    );

    const { disease, confidence } = result;
    const cropName = disease.crop || 'Unknown Crop';

    const handleSaveReport = async () => {
        if (!user?.id) {
            toast.error('Please log in to save reports.');
            return;
        }

        setSaving(true);
        try {
            await dbService.saveReport({
                userId: user.id,
                cropName: cropName,
                location: 'Current Location', // We'll fix this later with real location
                date: new Date().toLocaleDateString(),
                status: (enrichedData?.severity === 'High' || confidence > 0.8) ? 'Critical' : 'Moderate',
                diagnosis: disease.name,
                confidence: confidence,
                imageUrl: disease.image || 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22400%22%20height%3D%22400%22%3E%3Crect%20width%3D%22400%22%20height%3D%22400%22%20fill%3D%22%23f0f5f0%22%2F%3E%3Ctext%20x%3D%22200%22%20y%3D%22215%22%20text-anchor%3D%22middle%22%20font-size%3D%2248%22%20fill%3D%22%233D6F3960%22%3ELeaf%3C%2Ftext%3E%3C%2Fsvg%3E',
                severity: enrichedData ? (enrichedData.severity === 'High' ? 85 : 45) : Math.round(confidence * 100),
                timestamp: Date.now(),
                cost: enrichedData?.cost || 0
            });
            setSaved(true);
            toast.success("Report saved successfully!");
        } catch (e) {
            console.error("Failed to save", e);
            toast.error("Failed to save report");
        } finally {
            setSaving(false);
        }
    };

    const handleTalkToAI = () => {
        // Navigate to AI Bot with context
        onNavigate('chatbot', result);
    };

    const handleBuyKit = () => {
        const rawChemical = enrichedData?.chemical?.[0] || '';
        // Strip dosage info (e.g. "Propiconazole 125ml/200L water" → "Propiconazole fungicide")
        const chemical = rawChemical.split(/\s+\d/)[0].trim();
        const diseaseName = result?.disease.name || '';
        const cropName = result?.disease.crop || '';
        const searchQuery = chemical
            ? `${chemical} fungicide ${cropName}`
            : `${diseaseName} treatment kit ${cropName}`;
        const amazonUrl = `https://www.amazon.in/s?k=${encodeURIComponent(searchQuery)}`;
        window.open(amazonUrl, '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="p-3 md:p-6 lg:p-8 max-w-7xl mx-auto relative">
            {/* Ambient glow */}
            <div className="absolute top-0 left-1/4 w-[600px] h-[400px] bg-[radial-gradient(circle,rgba(61,111,57,0.06)_0%,transparent_70%)] pointer-events-none -z-10"></div>

            <div className="absolute top-0 left-0 right-0 p-6 z-20">
                <button
                    onClick={onBack}
                    className="w-10 h-10 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/30 transition-colors"
                >
                    <span className="material-icons-round">arrow_back</span>
                </button>
            </div>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-10 gap-3 md:gap-4 opacity-0 animate-fade-in">
                <div>
                    <div className="flex flex-wrap gap-1.5 md:gap-2 mb-2 md:mb-3">
                        {disease.scientificName?.startsWith('Local AI:') ? (
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                                <span className="material-icons-round text-sm">memory</span>
                                {t('Edge AI Diagnosis')}
                            </div>
                        ) : (
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 text-xs font-bold text-green-700 dark:text-green-400">
                                <span className="material-icons-round text-sm">verified</span>
                                {t('AI-Verified Diagnosis')}
                            </div>
                        )}
                        {disease.scientificName?.startsWith('Local AI:') ? (
                            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                                <span className="material-icons-round text-sm">smartphone</span>
                                {t('Ran locally')}
                            </div>
                        ) : disease.scientificName?.startsWith('AI-Verified:') ? (
                            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-xs font-bold text-blue-700 dark:text-blue-400">
                                <span className="material-icons-round text-sm">cloud_done</span>
                                {t('Cloud-verified by Gemma AI')}
                            </div>
                        ) : null}
                    </div>
                    <h1 className="text-2xl md:text-3xl lg:text-4xl font-black text-gray-900 dark:text-white">{t('Diagnosis Results')}</h1>
                    <p className="text-gray-500 mt-1">{tr('cropName', cropName)} &bull; {new Date().toLocaleDateString()}</p>
                </div>
                <div className="flex gap-3">
                    <button className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-white hover:bg-[#345f30] transition-all shadow-xl shadow-primary/20 hover:-translate-y-0.5 font-bold"
                        onClick={async () => {
                            const text = `KropScan Diagnosis: ${disease.name} on ${disease.crop}\nSeverity: ${disease.status}\nConfidence: ${(result.confidence * 100).toFixed(0)}%`;
                            if (navigator.share) {
                                await navigator.share({ title: 'KropScan Diagnosis', text });
                            } else {
                                await navigator.clipboard.writeText(text);
                                toast.success('Copied to clipboard!');
                            }
                        }}>
                        <span className="material-icons-round text-sm">share</span> {t('Share')}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6 lg:gap-8">
                {/* Left Column: Image & Basic Stats */}
                <div className="lg:col-span-4 space-y-4 md:space-y-6 opacity-0 animate-slide-up" style={{ animationDelay: '0.1s', animationFillMode: 'forwards' }}>
                    <div className="bg-surface-light dark:bg-surface-dark rounded-2xl md:rounded-3xl p-3 md:p-4 shadow-sm border border-gray-100 dark:border-gray-800">
                        <div className="relative aspect-[4/3] rounded-xl md:rounded-2xl overflow-hidden mb-3 md:mb-4 group">
                            <img src={disease.image || 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22400%22%20height%3D%22400%22%3E%3Crect%20width%3D%22400%22%20height%3D%22400%22%20fill%3D%22%23f0f5f0%22%2F%3E%3Ctext%20x%3D%22200%22%20y%3D%22215%22%20text-anchor%3D%22middle%22%20font-size%3D%2248%22%20fill%3D%22%233D6F3960%22%3ELeaf%3C%2Ftext%3E%3C%2Fsvg%3E'} alt={disease.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                            
                            {/* Simulated Heatmap Overlay */}
                            {confidence > 0.5 && disease.name !== 'Healthy' && (
                                <div className="absolute inset-0 pointer-events-none opacity-60 z-10 mix-blend-color">
                                    <div className="w-full h-full" style={{
                                        background: result?.disease?.status === 'Healthy' 
                                            ? 'none' 
                                            : 'radial-gradient(circle at 40% 50%, rgba(255, 0, 0, 0.8) 0%, transparent 50%), radial-gradient(circle at 60% 60%, rgba(255, 100, 0, 0.6) 0%, transparent 40%)'
                                    }}></div>
                                </div>
                            )}

                            <div className="absolute bottom-4 left-4 text-white">
                                <span className="text-xs font-medium opacity-90">{t('Captured')}: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                        </div>
                        <div className="px-2">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">{tr('diseaseName', disease.name)}</h3>
                                    <p className="text-gray-500 text-sm mt-1">{tr('cropName', cropName)} • {t('Severity')} {enrichedData?.severity ? tr('severity', enrichedData.severity) : t('Calculating...')}</p>
                                </div>
                                <div className="flex flex-col items-center">
                                    <div className="relative w-16 h-16">
                                        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                                            <path className="text-gray-100 dark:text-gray-800" stroke="currentColor" strokeWidth="3" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                            <path className="text-primary" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeDasharray={`${Math.round(confidence * 100)}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                        </svg>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="text-sm font-black text-primary">{Math.round(confidence * 100)}%</span>
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">{t('Confidence')}</span>
                                </div>
                            </div>
                            <div className="mt-6 flex gap-3">
                                <button onClick={onBack} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center gap-2">
                                    <span className="material-icons-round">replay</span> {t('Retake')}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 md:gap-4">
                        <div className="bg-surface-light dark:bg-surface-dark p-3 md:p-4 rounded-xl md:rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                            <div className="text-gray-500 text-[10px] md:text-xs font-semibold uppercase tracking-wider mb-1">{t('Affected Area')}</div>
                            {loadingAI ? (
                                <div className="animate-pulse h-8 bg-gray-200 dark:bg-gray-800 rounded-lg w-16 relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-white/5 to-transparent animate-shimmer w-[200%] -ml-[100%]"></div>
                                </div>
                            ) : (
                                <>
                                    <div className="text-xl font-bold text-gray-900 dark:text-white">{enrichedData?.affectedArea}</div>
                                    <div className="w-full bg-gray-200 dark:bg-gray-700 h-1.5 rounded-full mt-2">
                                        <div className="bg-accent h-1.5 rounded-full" style={{ width: enrichedData?.affectedArea }}></div>
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="bg-surface-light dark:bg-surface-dark p-3 md:p-4 rounded-xl md:rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                            <div className="text-gray-500 text-[10px] md:text-xs font-semibold uppercase tracking-wider mb-1">{t('Spread Risk')}</div>
                            {loadingAI ? (
                                <div className="animate-pulse h-8 bg-gray-200 dark:bg-gray-800 rounded-lg w-16 relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-white/5 to-transparent animate-shimmer w-[200%] -ml-[100%]"></div>
                                </div>
                            ) : (
                                <>
                                    <div className={`text-xl font-bold ${enrichedData?.spreadRisk === 'High' ? 'text-red-500' : 'text-orange-500'}`}>{tr('spreadRisk', enrichedData?.spreadRisk || '')}</div>
                                    <div className="w-full bg-gray-200 dark:bg-gray-700 h-1.5 rounded-full mt-2">
                                        <div className={`h-1.5 rounded-full ${enrichedData?.spreadRisk === 'High' ? 'bg-red-500' : 'bg-orange-500'}`} style={{ width: enrichedData?.spreadRisk === 'High' ? '90%' : '50%' }}></div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Symptoms */}
                    {disease.symptoms && disease.symptoms.length > 0 && disease.symptoms[0] !== 'Identified by KropScan Edge AI' && (
                        <div className="bg-red-50 dark:bg-red-900/10 p-4 md:p-5 rounded-2xl md:rounded-3xl border border-red-100 dark:border-red-800/30 shadow-sm">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg text-red-600 dark:text-red-400">
                                    <span className="material-icons-round">warning</span>
                                </div>
                                <h4 className="font-bold text-gray-900 dark:text-white">{t('Symptoms')}</h4>
                            </div>
                            <ul className="space-y-1.5">
                                {disease.symptoms.map((s: string, i: number) => (
                                    <li key={i} className="flex items-start gap-2 text-sm text-red-800/80 dark:text-red-400/80">
                                        <span className="text-red-400 mt-0.5">•</span>
                                        {tr(`symptom_${i}`, s)}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Prevention */}
                    {enrichedData?.prevention && enrichedData.prevention.length > 0 && (
                        <div className="bg-blue-50 dark:bg-blue-900/10 p-4 md:p-5 rounded-2xl md:rounded-3xl border border-blue-100 dark:border-blue-800/30 shadow-sm">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                                    <span className="material-icons-round">shield</span>
                                </div>
                                <h4 className="font-bold text-gray-900 dark:text-white">{t('Prevention')}</h4>
                            </div>
                            <ul className="space-y-1.5">
                                {enrichedData.prevention.map((p: string, i: number) => (
                                    <li key={i} className="flex items-start gap-2 text-sm text-blue-800/80 dark:text-blue-400/80">
                                        <span className="text-blue-400 mt-0.5">•</span>
                                        {tr(`prev_${i}`, p)}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {enrichedData?.soilInsights && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 p-4 md:p-5 rounded-2xl md:rounded-3xl border border-amber-100 dark:border-amber-800 shadow-sm">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-amber-700 dark:text-amber-400">
                                    <span className="material-icons-round">science</span>
                                </div>
                                <h4 className="font-bold text-gray-900 dark:text-white">{t('Soil Insight')}</h4>
                            </div>
                            <p className="text-sm text-amber-800/80 dark:text-amber-400/80 italic font-medium">
                                "{tr('soilInsights', enrichedData.soilInsights)}"
                            </p>
                        </div>
                    )}
                </div>

                {/* Middle Column: Treatment */}
                <div className="lg:col-span-5 space-y-4 md:space-y-6 opacity-0 animate-slide-up" style={{ animationDelay: '0.2s', animationFillMode: 'forwards' }}>
                    <div className="bg-surface-light dark:bg-surface-dark rounded-2xl md:rounded-3xl p-4 md:p-6 shadow-sm border border-gray-100 dark:border-gray-800 h-full relative overflow-hidden">

                        {!subscriptionService.checkFeatureAccess(user || { role: 'USER', plan: 'FREE', name: '', avatar: '' }, 'advanced_treatment') && (
                            <div className="absolute inset-0 bg-white/60 dark:bg-black/60 backdrop-blur-md z-20 flex flex-col items-center justify-center text-center p-8">
                                <span className="material-icons-round text-5xl text-gray-400 mb-4">lock</span>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('Advanced Treatments Locked')}</h3>
                                <p className="text-gray-500 mb-6 max-w-xs">{t('Upgrade to Pro Farmer')}</p>
                                <button
                                    onClick={() => onNavigate('upgrade')}
                                    className="bg-primary hover:bg-[#345f30] text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-primary/30 transition-all flex items-center gap-2"
                                >
                                    <span className="material-icons-round">star</span> {t('Upgrade Now')}
                                </button>
                            </div>
                        )}

                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg text-primary dark:text-green-400">
                                <span className="material-icons-round">medical_services</span>
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('Recommended Treatment')}</h3>
                        </div>

                        {loadingAI ? (
                            <div className="space-y-4">
                                <div className="animate-pulse h-28 bg-gray-100 dark:bg-gray-800/50 rounded-2xl relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-white/5 to-transparent animate-shimmer w-[200%] -ml-[100%]"></div>
                                </div>
                                <div className="animate-pulse h-24 bg-gray-100 dark:bg-gray-800/50 rounded-2xl relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-white/5 to-transparent animate-shimmer w-[200%] -ml-[100%]"></div>
                                </div>
                            </div>
                        ) : disease.status === 'Healthy' || disease.name?.toLowerCase().includes('healthy') ? (
                            /* Healthy plant — show positive message instead of empty treatment */
                            <div className="flex flex-col items-center justify-center text-center py-12 px-6">
                                <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
                                    <span className="material-icons-round text-4xl text-green-600 dark:text-green-400">check_circle</span>
                                </div>
                                <h3 className="text-2xl font-black text-green-700 dark:text-green-400 mb-2">{t('Your crop looks healthy!')}</h3>
                                <p className="text-gray-500 dark:text-gray-400 max-w-sm text-sm mb-6">
                                    {t('No disease detected. Continue monitoring regularly and maintain good farming practices.')}
                                </p>
                                <div className="flex flex-wrap gap-3 justify-center">
                                    {(enrichedData?.organic || []).filter(o => o).map((item, i) => (
                                        <div key={i} className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-3 py-2">
                                            <span className="material-icons-round text-green-500 text-sm">eco</span>
                                            <span className="text-xs font-medium text-green-700 dark:text-green-400">{tr(`org_${i}`, item)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Chemical Control — only show if chemicals exist */}
                                {enrichedData?.chemical && enrichedData.chemical.filter(c => c).length > 0 && (
                                    <div className="bg-[#F0F5F0] dark:bg-[#1E2A23] rounded-xl md:rounded-2xl p-4 md:p-5 border border-green-100 dark:border-green-900 border-l-4 border-l-primary mb-3 md:mb-4 shadow-sm">
                                        <div className="flex justify-between items-start mb-4">
                                            <h4 className="font-bold text-lg text-primary dark:text-green-400">{t('Chemical Control')}</h4>
                                            <span className="text-xs font-semibold bg-white dark:bg-black/20 px-2 py-1 rounded text-primary dark:text-green-400 border border-green-100 dark:border-green-900">{t('Fast Action')}</span>
                                        </div>
                                        <div className="space-y-3">
                                            {enrichedData.chemical.filter(c => c).slice(0, 3).map((item, i) => (
                                                <div key={i} className="flex items-start gap-3">
                                                    <span className="material-icons-round text-primary dark:text-green-400 mt-0.5 text-sm">science</span>
                                                    <span className="block text-sm text-gray-700 dark:text-gray-300">{tr(`chem_${i}`, item)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Organic Options — only show if options exist */}
                                {enrichedData?.organic && enrichedData.organic.filter(o => o).length > 0 && (
                                    <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-4 md:p-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="p-2 bg-green-50 dark:bg-green-900/10 rounded-lg text-green-600 dark:text-green-500">
                                                <span className="material-icons-round">grass</span>
                                            </div>
                                            <h4 className="font-bold text-gray-900 dark:text-white">{t('Organic Options')}</h4>
                                        </div>
                                        <ul className="space-y-2 pl-2">
                                            {enrichedData.organic.filter(o => o).slice(0, 3).map((item, i) => (
                                                <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1.5"></span>
                                                    {tr(`org_${i}`, item)}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Affiliate 1-Click Auto-Cart */}
                                {disease.name !== 'Healthy' && (
                                    <div className="mt-4 md:mt-6 bg-gradient-to-br from-orange-50 via-amber-50 to-orange-50 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-orange-900/20 border border-orange-200/80 dark:border-orange-800/50 rounded-xl md:rounded-2xl p-4 md:p-5 relative overflow-hidden group hover:shadow-xl hover:shadow-orange-500/10 transition-all duration-500">
                                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-400 via-amber-300 to-orange-400"></div>
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl"></div>
                                        <div className="flex items-start justify-between relative z-10 gap-4">
                                            <div>
                                                <div className="flex items-center gap-2 mb-2">
                                                   <span className="material-icons-round text-orange-600 dark:text-orange-400">shopping_cart</span>
                                                   <h4 className="font-bold text-gray-900 dark:text-white">{t('1-Click Treatment Kit')}</h4>
                                                </div>
                                                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                                                   {t('Get treatment kit delivered')}
                                                </p>
                                                <div className="flex -space-x-2 mb-4">
                                                   <div className="w-8 h-8 rounded-full bg-white dark:bg-gray-800 border-2 border-orange-100 flex items-center justify-center text-xs shadow-sm">💊</div>
                                                   <div className="w-8 h-8 rounded-full bg-white dark:bg-gray-800 border-2 border-orange-100 flex items-center justify-center text-xs shadow-sm">🌿</div>
                                                   <div className="w-8 h-8 rounded-full bg-white dark:bg-gray-800 border-2 border-orange-100 flex items-center justify-center text-xs shadow-sm">🛡️</div>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1">{t('Est. Cost/Acre')}</p>
                                                <p className="text-xl font-black text-orange-600 dark:text-orange-400 mb-2">₹{enrichedData?.cost || 1200}</p>
                                                <button onClick={handleBuyKit} className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 px-5 rounded-full shadow-xl shadow-orange-500/30 hover:-translate-y-0.5 transition-all text-sm flex items-center gap-2 whitespace-nowrap">
                                                    {t('Buy on Amazon')} <span className="material-icons-round text-sm">arrow_forward</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Right Column: Expert & Community */}
                <div className="lg:col-span-3 space-y-4 md:space-y-6 opacity-0 animate-slide-up" style={{ animationDelay: '0.3s', animationFillMode: 'forwards' }}>
                    <div className="bg-primary dark:bg-green-900 rounded-2xl md:rounded-3xl p-4 md:p-6 shadow-lg text-white relative overflow-hidden">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                                    <span className="material-icons-round text-white">smart_toy</span>
                                </div>
                                <h3 className="font-bold text-lg">{t('Talk to AI Assistant')}</h3>
                            </div>
                            <p className="text-green-100 text-sm mb-6 leading-relaxed">{t('Ask KropBot advice')}</p>

                            <button onClick={handleTalkToAI} className="w-full bg-white text-primary font-bold py-3 rounded-xl hover:bg-gray-50 transition-colors shadow-sm flex items-center justify-center gap-2">
                                <span className="material-icons-round">chat</span> {t('Chat Now')}
                            </button>
                        </div>
                    </div>

                    <div className="bg-card-light dark:bg-card-dark rounded-2xl md:rounded-3xl p-4 md:p-5 shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-md transition-shadow cursor-pointer" onClick={() => onNavigate('community')}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-900 dark:text-white">{t('Community')}</h3>
                            <span className="material-icons-round text-primary">arrow_forward</span>
                        </div>
                        <div className="space-y-4">
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                {t('See what farmers say about')} <strong>{disease.name}</strong>.
                            </p>
                            <div className="flex items-center gap-2">
                                <span className="material-icons-round text-primary text-lg">forum</span>
                                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('Share experiences & get advice')}</span>
                            </div>
                            <button className="w-full py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-primary dark:text-green-400 font-bold text-sm"
                                onClick={(e) => { e.stopPropagation(); onNavigate('community'); }}>
                                {t('Join Discussion')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DiagnosisResult;