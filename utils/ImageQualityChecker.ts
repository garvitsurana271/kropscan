export interface ImageQualityResult {
    isValid: boolean;
    reason?: string;
}

/**
 * Checks if an image meets minimum quality standards for AI analysis.
 * - Resolution: > 224x224
 * - Brightness: Not too dark (<30), not too bright (>230)
 * - Blur: Lapacian Variance check logic (simplified via edge density)
 */
export const checkImageQuality = (image: HTMLImageElement): ImageQualityResult => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        return { isValid: true }; // Fallback if context fails
    }

    // 1. Check Resolution
    if (image.naturalWidth < 224 || image.naturalHeight < 224) {
        return { isValid: false, reason: 'Image resolution too low. Please utilize a clearer photo.' };
    }

    // Draw Image
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    ctx.drawImage(image, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    let r, g, b, avg;
    let colorSum = 0;

    // 2. Check Brightness
    for (let x = 0, len = data.length; x < len; x += 4) {
        r = data[x];
        g = data[x + 1];
        b = data[x + 2];
        avg = Math.floor((r + g + b) / 3);
        colorSum += avg;
    }

    const brightness = Math.floor(colorSum / (canvas.width * canvas.height));

    if (brightness < 30) {
        return { isValid: false, reason: 'Image is too dark. Please use flash or better lighting.' };
    }

    if (brightness > 230) {
        return { isValid: false, reason: 'Image is too bright/washed out.' };
    }

    // 3. Simple Blur Detection (Edge Density)
    // We'll use a very simplified method: Calculate pixel variance
    // A sharper image has higher variance between adjacent pixels.

    /* 
     * NOTE: A true Laplacian variance is expensive in JS. 
     * We will check a sample of pixels and see how distinct they are from neighbors.
     */

    // Sampling (Check every 10th pixel to update performance)
    let varianceSum = 0;
    let samples = 0;

    const stride = 4 * 4; // Check every 4th pixel
    const width = canvas.width;

    for (let i = 0; i < data.length - stride - 4; i += stride) {
        const current = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const neighbor = (data[i + 4] + data[i + 5] + data[i + 6]) / 3; // Right neighbor

        varianceSum += Math.abs(current - neighbor);
        samples++;
    }

    const edgeScore = varianceSum / samples;

    // Threshold found experimentally: lowered to 1.5 to reduce false positives
    if (edgeScore < 1.5) {
        return { isValid: false, reason: 'Image is too blurry. Please hold steady.' };
    }

    return { isValid: true };
};
