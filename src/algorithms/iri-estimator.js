import { THRESHOLDS } from '../config/constants.js';
import { calculateRoughness } from './rms-calculator.js';

/**
 * Estimates IRI (International Roughness Index) based on accelerometer Z-axis data.
 * 
 * Note: Real IRI is calculated from a laser profiler. 
 * This is an approximation/correlation based on vehicle response.
 * 
 * Formula (Simplified):
 * IRI_approx = (Roughness_StdDev / 1000) * Speed_Factor * Calibration_Constant
 * 
 * @param {number[]} zAxisValues Array of Z-axis acceleration (mG)
 * @param {number} speedKmh Vehicle speed in km/h
 * @returns {object} { iri: number, category: string }
 */
export function estimateIRI(zAxisValues, speedKmh) {
    // If truck is stopped, IRI is irrelevant (or zero if we want to be technical)
    if (speedKmh < 5) {
        return { iri: 0, category: 'good' };
    }

    const roughnessStdDev = calculateRoughness(zAxisValues);

    // Calibration constant: This needs to be tuned with real field data.
    // Start with 1.0. If values represent mG, typical roughness on bad roads might be 50-100mG StdDev?
    const K = 15.0;

    // Speed factor: Higher speed amplifies roughness readings. 
    // We need to normalize this. Ideally, we want the "road profile", not the "suspension response".
    // A simple normalization is: Val / Speed.
    // Let's assume the correlation is linear for MVP.
    // Avoid division by zero (guaranteed by speed check above).
    const speedFactor = 30 / speedKmh; // Normalize to 30km/h baseline?

    let estimatedIri = (roughnessStdDev / 1000) * K * speedFactor;

    // Cap at reasonable max (e.g. 20)
    estimatedIri = Math.min(Math.max(estimatedIri, 0), 20);

    // Categorize
    let category = 'good';
    if (estimatedIri > THRESHOLDS.IRI_CATEGORIES.POOR) category = 'very_poor';
    else if (estimatedIri > THRESHOLDS.IRI_CATEGORIES.FAIR) category = 'poor';
    else if (estimatedIri > THRESHOLDS.IRI_CATEGORIES.GOOD) category = 'fair';

    return {
        iri: Number(estimatedIri.toFixed(2)),
        category,
        rawRoughness: roughnessStdDev // Return for debugging
    };
}
