import prisma from '../config/database.js';
import { calculateRoughness } from './rms-calculator.js';
import { estimateIRI } from './iri-estimator.js';

export async function aggregateDailyStats() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const startOfDay = new Date(yesterday.setHours(0, 0, 0, 0));
    const endOfDay = new Date(yesterday.setHours(23, 59, 59, 999));

    console.log(`Aggregating stats for ${startOfDay.toISOString()}...`);

    // Get all active road segments
    const segments = await prisma.roadSegment.findMany({ select: { id: true } });

    for (const seg of segments) {
        // 1. Fetch raw data for segment/day
        const telemetry = await prisma.truckTelemetry.findMany({
            where: {
                roadSegmentId: seg.id,
                timestamp: {
                    gte: startOfDay,
                    lte: endOfDay
                }
            },
            select: {
                axisZ: true,
                speed: true,
                isLoaded: true
            }
        });

        if (telemetry.length === 0) continue;

        // 2. Count passes
        // Simple heuristic: 1 pass = ?
        // Actually, "passes" usually means unique truck trips.
        // Telemetry is points (1/sec).
        // Let's just count total POINTS for now (easiest MVP).
        // Correct way: Group by truckId and sequences. Too complex for MVP.
        // Let's just track "Activity Volume" = total points.

        const totalPoints = telemetry.length;
        const loadedPoints = telemetry.filter(t => t.isLoaded).length;

        // 3. Calculate Aggregates
        const zValues = telemetry.map(t => t.axisZ || 0);
        const avgSpeed = telemetry.reduce((sum, t) => sum + (t.speed || 0), 0) / totalPoints;

        // Calculate global daily stdDev for this segment
        const stdDevZ = calculateRoughness(zValues);

        // Estimate IRI
        const { iri, category } = estimateIRI(zValues, avgSpeed);

        // 4. Count Events
        const events = await prisma.roughnessEvent.aggregate({
            where: {
                roadSegmentId: seg.id,
                timestamp: { gte: startOfDay, lte: endOfDay }
            },
            _count: { id: true }
        });

        const criticalEvents = await prisma.roughnessEvent.aggregate({
            where: {
                roadSegmentId: seg.id,
                timestamp: { gte: startOfDay, lte: endOfDay },
                severity: 'CRITICAL'
            },
            _count: { id: true }
        });

        // 5. Upsert Stats
        await prisma.roadSegmentStats.upsert({
            where: {
                roadSegmentId_date: {
                    roadSegmentId: seg.id,
                    date: startOfDay
                }
            },
            update: {
                totalPasses: totalPoints, // Using points as proxy for volume
                loadedPasses: loadedPoints,
                stdDevZAxis: stdDevZ,
                estimatedIri: iri,
                iriCategory: category,
                roughnessEventCount: events._count.id,
                criticalEventCount: criticalEvents._count.id
            },
            create: {
                roadSegmentId: seg.id,
                date: startOfDay,
                totalPasses: totalPoints,
                loadedPasses: loadedPoints,
                stdDevZAxis: stdDevZ,
                estimatedIri: iri,
                iriCategory: category,
                roughnessEventCount: events._count.id,
                criticalEventCount: criticalEvents._count.id
            }
        });
    }

    console.log('Daily aggregation complete.');
}
