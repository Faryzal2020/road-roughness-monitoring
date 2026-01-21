import prisma from '../config/database.js';
import { THRESHOLDS, BATCH_SIZES } from '../config/constants.js';

/**
 * Scans new telemetry data for critical roughness events.
 * 
 * Logic:
 * 1. Fetch unprocessed telemetry
 * 2. Scan Z-axis for values exceeding thresholds
 * 3. Group consecutive high values into a single "Event"
 * 4. Save to RoughnessEvent table
 */
export async function detectRoughnessEvents() {
    const BATCH_LIMIT = BATCH_SIZES.EVENT_PROCESSING;

    // 1. Fetch
    const unprocessed = await prisma.truckTelemetry.findMany({
        where: { processed: false },
        take: BATCH_LIMIT,
        orderBy: { timestamp: 'asc' },
        select: {
            id: true,
            truckId: true,
            timestamp: true,
            latitude: true,
            longitude: true,
            axisZ: true, // Only need Z for basic roughness
            axisX: true,
            axisY: true,
            speed: true,
            isLoaded: true,
            roadSegmentId: true
        }
    });

    if (unprocessed.length === 0) return;

    const events = [];
    const processedIds = [];

    let currentEvent = null;

    // 2. Scan
    for (const record of unprocessed) {
        processedIds.push(record.id);

        // Filter out gravity (approx 1000mG or -1000mG depends on mounting)
        // We care about the *dynamic* force, i.e., deviation from 1G.
        // Or simpler for MVP: Absolute Max Value vs Threshold. 
        // If truck hits a pothole, it spikes to 3G (3000mG).
        // Let's take absolute value.
        const absZ = Math.abs(record.axisZ || 0);

        let severity = null;
        if (absZ > THRESHOLDS.ROUGHNESS.CRITICAL) severity = 'CRITICAL';
        else if (absZ > THRESHOLDS.ROUGHNESS.HIGH) severity = 'HIGH';
        else if (absZ > THRESHOLDS.ROUGHNESS.MEDIUM) severity = 'MEDIUM';

        if (severity) {
            if (currentEvent) {
                // Continue event
                currentEvent.durationMs += (record.timestamp - currentEvent.lastTimestamp);
                currentEvent.peakZAxis = Math.max(currentEvent.peakZAxis, absZ);
                if (severity === 'CRITICAL') currentEvent.severity = 'CRITICAL'; // Upgrade severity
                else if (severity === 'HIGH' && currentEvent.severity !== 'CRITICAL') currentEvent.severity = 'HIGH';

                currentEvent.lastTimestamp = record.timestamp;
            } else {
                // Start new event
                currentEvent = {
                    timestamp: record.timestamp,
                    truckId: record.truckId,
                    latitude: record.latitude,
                    longitude: record.longitude,
                    roadSegmentId: record.roadSegmentId,
                    eventType: 'bump', // Generic for now
                    severity: severity,
                    peakZAxis: absZ,
                    peakXAxis: record.axisX,
                    peakYAxis: record.axisY,
                    durationMs: 0,
                    speedKmh: record.speed,
                    isLoaded: record.isLoaded,
                    lastTimestamp: record.timestamp
                };
            }
        } else {
            // Below threshold
            if (currentEvent) {
                // End event
                // Only save if it had some duration or valid peak?
                // Actually, for "spikes" duration might be 0 (single sample). That's fine.
                delete currentEvent.lastTimestamp; // Remove temp field
                events.push(currentEvent);
                currentEvent = null;
            }
        }
    }

    // Push pending event if batch ended
    if (currentEvent) {
        delete currentEvent.lastTimestamp;
        events.push(currentEvent);
    }

    // 3. Save Events
    if (events.length > 0) {
        await prisma.roughnessEvent.createMany({
            data: events
        });
        console.log(`Detected ${events.length} roughness events.`);
    }

    // 4. Mark processed
    // Since 'id' is BigInt, we can't use 'in' clause easily with JSON serialization issues sometimes,
    // but Prisma handles BigInt in where clause fine usually.
    // Warning: updateMany on BigInt IDs might hit limits? 
    // Let's do it safely.

    await prisma.truckTelemetry.updateMany({
        where: {
            id: { in: processedIds }
        },
        data: {
            processed: true
        }
    });
}
