import express from 'express';
import prisma from '../config/database.js';

const router = express.Router();

// GET /api/dashboard/trucks
router.get('/trucks', async (req, res) => {
    try {
        const trucks = await prisma.truck.findMany({
            include: {
                telemetry: {
                    orderBy: { timestamp: 'desc' },
                    take: 1
                }
            }
        });

        // Flatten structure for frontend
        const result = trucks.map(t => {
            const latest = t.telemetry[0] || {};
            return {
                id: t.id,
                truckId: t.truckId,
                status: t.status,
                lastUpdate: latest.timestamp,
                speed: latest.speed,
                lat: latest.latitude,
                lon: latest.longitude,
                isLoaded: latest.isLoaded,
                address: latest.roadSegmentId ? `Segment ${latest.roadSegmentId}` : 'Unknown'
            };
        });

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/dashboard/segments
router.get('/segments', async (req, res) => {
    try {
        // Get latest stats per segment
        // Ideal: Use distinct on roadSegmentId, or join with Stats table
        const segments = await prisma.roadSegment.findMany({
            include: {
                stats: {
                    orderBy: { date: 'desc' },
                    take: 1
                },
                road: true
            }
        });

        const result = segments.map(s => {
            const stats = s.stats[0] || {};
            return {
                id: s.id,
                roadName: s.road.roadName,
                segmentNumber: s.segmentNumber,
                iri: stats.estimatedIri || 0,
                category: stats.iriCategory || 'unknown',
                events: stats.roughnessEventCount || 0,
                lastUpdated: stats.updatedAt
            };
        });

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/dashboard/events/recent
router.get('/events/recent', async (req, res) => {
    try {
        const events = await prisma.roughnessEvent.findMany({
            orderBy: { timestamp: 'desc' },
            take: 50,
            include: {
                truck: { select: { truckId: true } },
                roadSegment: {
                    include: { road: { select: { roadName: true } } }
                }
            }
        });
        res.json(events);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
