import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CropScan, UserProfile } from '../types';
import { dbService } from '../services/DatabaseService';
import { getTranslation } from '../utils/translations';

interface HistoryProps {
    user: UserProfile | null;
    language?: string;
}

const History: React.FC<HistoryProps> = ({ user, language = 'English' }) => {
    const t = (key: string) => getTranslation(language, key);
    const [reports, setReports] = useState<CropScan[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCrop, setFilterCrop] = useState('All Crop Types');
    const [filterSeverity, setFilterSeverity] = useState('Any Severity');
    const [selectedReport, setSelectedReport] = useState<CropScan | null>(null);

    useEffect(() => {
        const fetchReports = async () => {
            if (user?.id) {
                try {
                    const data = await dbService.getUserReports(user.id);
                    setReports(data);
                } catch (e) {
                    console.error("Failed to load reports", e);
                } finally {
                    setLoading(false);
                }
            } else {
                setLoading(false);
            }
        };
        fetchReports();
    }, [user]);

    const filteredReports = reports.filter(report => {
        const matchesSearch = (report.diagnosis?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            report.cropName?.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesCrop = filterCrop === 'All Crop Types' || report.cropName === filterCrop;
        // Simplified filter matching to be more robust
        const matchesSeverity = filterSeverity === 'Any Severity' ||
            report.status === filterSeverity ||
            (filterSeverity === 'Low Risk' && report.status === 'Healthy');

        return matchesSearch && matchesCrop && matchesSeverity;
    });

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this report?')) {
            const success = await dbService.deleteReport(parseInt(id));
            if (success) {
                setReports(reports.filter(r => r.id !== id));
            } else {
                toast.error("Failed to delete report from database.");
            }
        }
    };

    const handleShare = async () => {
        if (!selectedReport) return;
        const text = `Crop Analysis: ${selectedReport.cropName} diagnosed with ${selectedReport.diagnosis} (${selectedReport.status}). Severity: ${selectedReport.severity}%. Check KropScan for detailed treatment.`;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'KropScan Report',
                    text: text,
                    url: window.location.href // Ideally link to specific report if routing existed
                });
            } catch (err) {
                console.error('Share failed', err);
            }
        } else {
            // Fallback
            navigator.clipboard.writeText(text);
            toast.success("Report details copied to clipboard!");
        }
    };

    const handleDownload = () => {
        window.print();
    };

    const uniqueCrops = Array.from(new Set(reports.map(r => r.cropName).filter(Boolean)));

    // --- Crop Health Timeline data ---
    const timelineData = React.useMemo(() => {
        if (reports.length === 0) return [];
        return reports
            .map(r => {
                const ts = (r as any).timestamp || r.date;
                const dateObj = ts ? new Date(ts) : null;
                if (!dateObj || isNaN(dateObj.getTime())) return null;
                // Health score: 100 = perfectly healthy, 0 = critically diseased
                // Weight severity by confidence — low-confidence predictions shouldn't tank the score
                const confidence = r.confidence ?? 0.5;
                const rawSeverity = r.severity ?? 0;
                const healthScore = Math.round(100 - (rawSeverity * Math.min(confidence * 1.2, 1)));
                const color =
                    r.status === 'Critical' ? '#ef4444' :
                    r.status === 'Moderate' ? '#f97316' :
                    '#22c55e'; // Healthy / Low Risk
                return { date: dateObj, healthScore, color, label: r.cropName || '', severity: r.severity ?? 0 };
            })
            .filter(Boolean)
            .sort((a, b) => a!.date.getTime() - b!.date.getTime()) as {
                date: Date; healthScore: number; color: string; label: string; severity: number;
            }[];
    }, [reports]);

    if (!user) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-gray-500">{t('Please log in to view history')}</p>
            </div>
        );
    }

    return (
        <div className="p-3 md:p-6 lg:p-8 max-w-[1400px] mx-auto h-[calc(100vh-80px)] flex flex-col relative printable-container">
            {/* Print Styles */}
            <style>{`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    .modal-content, .modal-content * {
                        visibility: visible;
                    }
                    .modal-content {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        border: none;
                        box-shadow: none;
                    }
                    .no-print {
                        display: none !important;
                    }
                }
            `}</style>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 md:mb-6 gap-3 md:gap-4 no-print">
                <div>
                    <h1 className="text-lg md:text-2xl font-bold text-gray-900 dark:text-white">{t('Scan History & Reports')}</h1>
                    <p className="text-xs md:text-sm text-gray-500 mt-0.5 md:mt-1">{t('View and manage')} <span className="font-semibold text-primary">{reports.length}</span> {t('crop scans')}</p>
                </div>
            </div>

            {/* Crop Health Timeline */}
            <div className="bg-surface-light dark:bg-surface-dark rounded-2xl md:rounded-3xl border border-gray-200 dark:border-gray-800 p-3 md:p-4 mb-3 md:mb-4 no-print">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                    <span className="material-icons-round text-primary text-base">show_chart</span>
                    {t('Crop Health Timeline')}
                </h2>
                {timelineData.length === 0 ? (
                    <div className="flex items-center justify-center h-[120px] text-gray-400 dark:text-gray-500 text-sm">
                        <span className="material-icons-round mr-2 text-lg">eco</span>
                        {t('Scan crops regularly to track health trends')}
                    </div>
                ) : (() => {
                    const svgW = 800;
                    const svgH = 160;
                    const padL = 40;
                    const padR = 20;
                    const padT = 20;
                    const padB = 30;
                    const chartW = svgW - padL - padR;
                    const chartH = svgH - padT - padB;

                    const minDate = timelineData[0].date.getTime();
                    const maxDate = timelineData[timelineData.length - 1].date.getTime();
                    const dateRange = maxDate - minDate || 1;

                    const points = timelineData.map(d => ({
                        x: padL + ((d.date.getTime() - minDate) / dateRange) * chartW,
                        y: padT + ((100 - d.healthScore) / 100) * chartH,
                        color: d.color,
                        label: d.label,
                        healthScore: d.healthScore,
                        dateStr: d.date.toLocaleDateString(),
                    }));

                    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

                    // Y-axis labels (health %)
                    const yLabels = [100, 75, 50, 25, 0];
                    // X-axis: show first, last, and middle date
                    const xLabelIndices = points.length <= 3
                        ? points.map((_, i) => i)
                        : [0, Math.floor(points.length / 2), points.length - 1];

                    return (
                        <svg
                            viewBox={`0 0 ${svgW} ${svgH}`}
                            className="w-full"
                            style={{ maxHeight: '200px' }}
                            preserveAspectRatio="xMidYMid meet"
                        >
                            {/* Grid lines */}
                            {yLabels.map(v => {
                                const y = padT + ((100 - v) / 100) * chartH;
                                return (
                                    <g key={v}>
                                        <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="currentColor" strokeOpacity={0.08} strokeWidth={1} />
                                        <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.4}>{v}%</text>
                                    </g>
                                );
                            })}
                            {/* Trend line */}
                            <path d={linePath} fill="none" stroke="#3b9c33" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.6} />
                            {/* Area under line */}
                            <path
                                d={`${linePath} L${points[points.length - 1].x},${padT + chartH} L${points[0].x},${padT + chartH} Z`}
                                fill="url(#healthGradient)"
                                fillOpacity={0.15}
                            />
                            <defs>
                                <linearGradient id="healthGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#22c55e" />
                                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            {/* Data dots */}
                            {points.map((p, i) => (
                                <g key={i}>
                                    <circle cx={p.x} cy={p.y} r={5} fill={p.color} stroke="white" strokeWidth={2} />
                                    <title>{`${p.label} - ${p.dateStr}\n${t('Health')}: ${p.healthScore}%`}</title>
                                </g>
                            ))}
                            {/* X-axis date labels */}
                            {xLabelIndices.map(idx => (
                                <text key={idx} x={points[idx].x} y={svgH - 4} textAnchor="middle" fontSize={9} fill="currentColor" fillOpacity={0.4}>
                                    {points[idx].dateStr}
                                </text>
                            ))}
                        </svg>
                    );
                })()}
            </div>

            {/* Filters */}
            <div className="bg-surface-light dark:bg-surface-dark rounded-t-2xl md:rounded-t-3xl border-b border-gray-200 dark:border-gray-800 p-3 md:p-4 flex flex-wrap gap-2 md:gap-4 items-center no-print">
                <div className="relative flex-1 min-w-0 w-full md:min-w-[200px]">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 material-icons-round text-lg">search</span>
                    <input
                        type="text"
                        placeholder={t('Search by disease or crop')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs md:text-sm focus:ring-primary focus:border-primary transition-shadow"
                    />
                </div>
                <select
                    value={filterCrop}
                    onChange={(e) => setFilterCrop(e.target.value)}
                    className="px-3 md:px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs md:text-sm focus:ring-primary dark:text-white flex-1 md:flex-none"
                >
                    <option>{t('All Crop Types')}</option>
                    {uniqueCrops.map(c => <option key={c}>{c}</option>)}
                </select>
                <select
                    value={filterSeverity}
                    onChange={(e) => setFilterSeverity(e.target.value)}
                    className="px-3 md:px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs md:text-sm focus:ring-primary dark:text-white flex-1 md:flex-none"
                >
                    <option>{t('Any Severity')}</option>
                    <option>{t('Critical')}</option>
                    <option>{t('Moderate')}</option>
                    <option>{t('Low Risk')}</option>
                </select>
            </div>

            {/* Table (Desktop) + Cards (Mobile) */}
            <div className="bg-surface-light dark:bg-surface-dark flex-1 overflow-auto shadow-sm rounded-b-2xl md:rounded-b-3xl border border-t-0 border-gray-200 dark:border-gray-800 no-print">
                {loading ? (
                    <div className="p-10 text-center text-gray-500">{t('Loading reports')}</div>
                ) : filteredReports.length === 0 ? (
                    <div className="p-10 text-center text-gray-500">{t('No matching reports')}</div>
                ) : (
                    <>
                        {/* Mobile Card Layout */}
                        <div className="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
                            {filteredReports.map((scan) => (
                                <div key={scan.id} className="p-3 active:bg-gray-50 dark:active:bg-gray-800/50 transition-colors cursor-pointer" onClick={() => setSelectedReport(scan)}>
                                    <div className="flex items-start gap-3">
                                        <div className="w-14 h-14 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 flex-shrink-0">
                                            <img src={scan.imageUrl || 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%22%20height%3D%22100%22%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20fill%3D%22%23f0f5f0%22%2F%3E%3C%2Fsvg%3E'} alt={scan.cropName} className="w-full h-full object-cover" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-0.5">
                                                <p className="font-bold text-sm text-gray-900 dark:text-white truncate">{scan.cropName}</p>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${(scan.status === 'Healthy' || scan.diagnosis?.toLowerCase().includes('healthy')) ? 'bg-green-50 text-primary dark:bg-green-900/30 dark:text-green-400' : scan.status === 'Critical' ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'}`}>
                                                    {(scan.status === 'Healthy' || scan.diagnosis?.toLowerCase().includes('healthy')) ? t('Low Risk') : scan.status === 'Critical' ? t('High Risk') : t('Moderate')}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 mb-1.5">
                                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${(scan.status === 'Healthy' || scan.diagnosis?.toLowerCase().includes('healthy')) ? 'bg-primary' : scan.status === 'Critical' ? 'bg-red-500' : 'bg-orange-400'}`}></span>
                                                <p className="text-xs text-gray-700 dark:text-gray-300 truncate">{scan.diagnosis}</p>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <p className="text-[10px] text-gray-400">{new Date(scan.timestamp).toLocaleDateString()} {new Date(scan.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                                <button
                                                    onClick={(e) => handleDelete(e, scan.id)}
                                                    className="text-gray-300 dark:text-gray-600 active:text-red-500 p-1 rounded-lg"
                                                >
                                                    <span className="material-icons-round text-base">delete</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Desktop Table Layout */}
                        <table className="w-full text-left border-collapse hidden md:table">
                            <thead className="bg-gray-50/50 dark:bg-black/20 sticky top-0 z-10">
                                <tr className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
                                    <th className="px-6 py-4 font-semibold w-16">
                                        <input type="checkbox" className="rounded border-gray-300 text-primary focus:ring-primary" />
                                    </th>
                                    <th className="px-6 py-4 font-semibold">{t('Crop Detail')}</th>
                                    <th className="px-6 py-4 font-semibold">{t('Date Scanned')}</th>
                                    <th className="px-6 py-4 font-semibold">{t('Diagnosis')}</th>
                                    <th className="px-6 py-4 font-semibold">{t('Severity')}</th>
                                    <th className="px-6 py-4 font-semibold">{t('Status')}</th>
                                    <th className="px-6 py-4 font-semibold text-right">{t('Action')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
                                {filteredReports.map((scan) => (
                                    <tr key={scan.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group cursor-pointer" onClick={() => setSelectedReport(scan)}>
                                        <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                            <input type="checkbox" className="rounded border-gray-300 text-primary focus:ring-primary" />
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 flex-shrink-0">
                                                    <img src={scan.imageUrl || 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%22%20height%3D%22100%22%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20fill%3D%22%23f0f5f0%22%2F%3E%3C%2Fsvg%3E'} alt={scan.cropName} className="w-full h-full object-cover" />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-gray-900 dark:text-white">{scan.cropName}</p>
                                                    <p className="text-xs text-gray-500">{scan.location}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600 dark:text-gray-300">
                                            <div className="flex flex-col">
                                                <span>{new Date(scan.timestamp).toLocaleDateString()}</span>
                                                <span className="text-xs text-gray-400">{new Date(scan.timestamp).toLocaleTimeString()}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${(scan.status === 'Healthy' || scan.diagnosis?.toLowerCase().includes('healthy')) ? 'bg-primary' : scan.status === 'Critical' ? 'bg-red-500' : 'bg-orange-400'}`}></span>
                                                <span className="font-medium text-gray-900 dark:text-white">{scan.diagnosis}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-1 mb-1">
                                                <div className={`h-1.5 rounded-full ${(scan.status === 'Healthy' || scan.diagnosis?.toLowerCase().includes('healthy')) ? 'bg-primary' : scan.status === 'Critical' ? 'bg-red-500' : 'bg-orange-400'}`} style={{ width: `${(scan.status === 'Healthy' || scan.diagnosis?.toLowerCase().includes('healthy')) ? 20 : scan.severity}%` }}></div>
                                            </div>
                                            <span className={`text-xs font-semibold ${(scan.status === 'Healthy' || scan.diagnosis?.toLowerCase().includes('healthy')) ? 'text-primary dark:text-green-400' : scan.status === 'Critical' ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'}`}>
                                                {(scan.status === 'Healthy' || scan.diagnosis?.toLowerCase().includes('healthy')) ? t('Low Risk') : scan.status === 'Critical' ? t('High Risk') : t('Moderate')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> {t('Saved')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={(e) => handleDelete(e, scan.id)}
                                                className="text-gray-400 hover:text-red-500 transition-colors p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                            >
                                                <span className="material-icons-round">delete</span>
                                            </button>
                                            <button className="text-gray-400 hover:text-primary transition-colors p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg ml-2">
                                                <span className="material-icons-round">visibility</span>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </>
                )}
            </div>

            {/* Modal for Report Details */}
            {selectedReport && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setSelectedReport(null)}>
                    <div className="bg-white dark:bg-surface-dark rounded-2xl md:rounded-3xl p-4 md:p-8 w-full max-w-2xl shadow-2xl relative modal-content" onClick={e => e.stopPropagation()}>
                        <button
                            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-white no-print"
                            onClick={() => setSelectedReport(null)}
                        >
                            <span className="material-icons-round">close</span>
                        </button>

                        {/* Header for PDF only */}
                        <div className="hidden print:block mb-4 text-center border-b border-gray-200 pb-4">
                            <h1 className="text-2xl font-bold">{t('KropScan Analysis Report')}</h1>
                            <p className="text-sm text-gray-500">Generated on {new Date().toLocaleDateString()}</p>
                        </div>

                        <div className="flex gap-4 md:gap-6 flex-col md:flex-row">
                            <div className="w-full md:w-1/3">
                                <img
                                    src={selectedReport.imageUrl}
                                    className="w-full aspect-[4/3] md:aspect-square object-cover rounded-xl md:rounded-2xl shadow-md"
                                    alt="Report"
                                />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-lg md:text-2xl font-bold text-gray-900 dark:text-white mb-0.5 md:mb-1">{selectedReport.cropName}</h2>
                                <p className="text-primary font-semibold text-sm md:text-base mb-3 md:mb-4">{selectedReport.diagnosis}</p>

                                <div className="space-y-3">
                                    <div className="flex justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
                                        <span className="text-gray-500">{t('Date')}</span>
                                        <span className="font-medium text-gray-900 dark:text-white">{new Date(selectedReport.timestamp).toLocaleDateString()}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
                                        <span className="text-gray-500">{t('Status')}</span>
                                        <span className={`font-bold ${selectedReport.status === 'Critical' ? 'text-red-500' : 'text-primary'}`}>{t(selectedReport.status)}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
                                        <span className="text-gray-500">{t('Severity')}</span>
                                        <span className="font-medium text-gray-900 dark:text-white">{selectedReport.severity}%</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer for PDF only - Detailed Analysis Text */}
                        <div className="mt-6 p-4 bg-gray-50 rounded-xl hidden print:block">
                            <h3 className="font-bold mb-2">Analysis Summary</h3>
                            <p className="text-sm text-gray-700">
                                This report indicates a {selectedReport.status} severity infection of {selectedReport.diagnosis} on the {selectedReport.cropName} crop.
                                Immediate attention is recommended. Please consult the 'Treatment' section in the KropScan app for specific chemical and organic remedies.
                            </p>
                            <p className="mt-4 text-xs text-gray-500 text-center">
                                Download KropScan for real-time AI diagnosis and market insights.
                            </p>
                        </div>

                        <div className="mt-5 md:mt-8 flex gap-2 md:gap-3 justify-end no-print">
                            <button onClick={handleShare} className="px-4 md:px-5 py-2 md:py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 text-sm md:text-base">{t('Share')}</button>
                            <button onClick={handleDownload} className="px-4 md:px-5 py-2 md:py-2.5 rounded-xl bg-primary text-white hover:bg-[#345f30] text-sm md:text-base">{t('Download PDF')}</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="px-4 md:px-8 py-3 md:py-4 bg-surface-light dark:bg-surface-dark border-t border-gray-100 dark:border-gray-800 flex items-center justify-between rounded-b-2xl md:rounded-b-3xl mt-px">
                <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Showing <span className="font-bold text-gray-900 dark:text-white">{filteredReports.length > 0 ? 1 : 0}-{filteredReports.length}</span> of <span className="font-bold text-gray-900 dark:text-white">{reports.length}</span> results</p>
            </div>
        </div>
    );
};

export default History;