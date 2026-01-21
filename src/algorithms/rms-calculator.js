/**
 * Calculates the Standard Deviation of a set of values.
 * We use StdDev instead of simple RMS to account for the gravity offset (1G ≈ 1000mG).
 * A perfectly smooth road with 1g constant force has StdDev = 0, which is what we want.
 * 
 * @param {number[]} values Array of accelerometer readings (e.g., Z-axis)
 * @returns {number} Standard Deviation (or 0 if empty)
 */
export function calculateRoughness(values) {
    if (!values || values.length === 0) return 0;

    const n = values.length;
    if (n === 1) return 0;

    // 1. Calculate Mean
    const mean = values.reduce((sum, val) => sum + val, 0) / n;

    // 2. Calculate Sum of Squared Differences
    const sumSquaredDiff = values.reduce((sum, val) => {
        const diff = val - mean;
        return sum + (diff * diff);
    }, 0);

    // 3. Variance & StdDev
    // Using sample standard deviation formula (n-1) is technically more correct for samples,
    // but for roughness index 'n' is usually sufficient. Let's use 'n'.
    const variance = sumSquaredDiff / n;
    const stdDev = Math.sqrt(variance);

    // Return formatted to 2 decimal places
    return Number(stdDev.toFixed(2));
}
