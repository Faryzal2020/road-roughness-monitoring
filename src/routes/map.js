import express from 'express';
import prisma from '../config/database.js';

const router = express.Router();

/**
 * GET /api/map/telemetry
 * Returns telemetry data for map visualization
 * Query params:
 *   - truckId: Filter by truck ID (optional)
 *   - from: Start timestamp ISO string (optional)
 *   - to: End timestamp ISO string (optional)
 *   - movingOnly: If 'true', only return records with speed > 0 (default: true)
 *   - limit: Max records to return (default: 5000)
 */
router.get('/telemetry', async (req, res) => {
    try {
        const { truckId, from, to, movingOnly = 'true', limit = '5000' } = req.query;

        const where = {};

        // Filter by truck
        if (truckId) {
            where.truckId = parseInt(truckId);
        }

        // Filter by time range
        if (from || to) {
            where.timestamp = {};
            if (from) where.timestamp.gte = new Date(from);
            if (to) where.timestamp.lte = new Date(to);
        }

        // Filter moving records only
        if (movingOnly === 'true') {
            where.speed = { gt: 0 };
        }

        const telemetry = await prisma.truckTelemetry.findMany({
            where,
            orderBy: { timestamp: 'asc' },
            take: parseInt(limit),
            select: {
                id: true,
                timestamp: true,
                latitude: true,
                longitude: true,
                speed: true,
                axisX: true,
                axisY: true,
                axisZ: true,
                movement: true,
                heading: true,
                truck: {
                    select: {
                        truckId: true,
                        imei: true
                    }
                }
            }
        });

        // Calculate roughness for each point
        const result = telemetry.map(t => {
            // Vector magnitude
            const x = t.axisX || 0;
            const y = t.axisY || 0;
            const z = t.axisZ || 0;
            const magnitude = Math.sqrt(x * x + y * y + z * z);

            // Deviation from 1g (1000 mG)
            const roughness = Math.abs(magnitude - 1000);

            return {
                id: t.id.toString(),
                timestamp: t.timestamp,
                lat: parseFloat(t.latitude),
                lon: parseFloat(t.longitude),
                speed: t.speed,
                heading: t.heading,
                axisX: x,
                axisY: y,
                axisZ: z,
                roughness: Math.round(roughness),
                truckId: t.truck?.truckId || 'Unknown'
            };
        });

        res.json({
            count: result.length,
            bounds: result.length > 0 ? {
                minLat: Math.min(...result.map(r => r.lat)),
                maxLat: Math.max(...result.map(r => r.lat)),
                minLon: Math.min(...result.map(r => r.lon)),
                maxLon: Math.max(...result.map(r => r.lon))
            } : null,
            data: result
        });

    } catch (err) {
        console.error('Map telemetry error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/map/trucks
 * Returns list of trucks for dropdown filter
 */
router.get('/trucks', async (req, res) => {
    try {
        const trucks = await prisma.truck.findMany({
            select: {
                id: true,
                truckId: true,
                imei: true,
                status: true
            }
        });
        res.json(trucks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
