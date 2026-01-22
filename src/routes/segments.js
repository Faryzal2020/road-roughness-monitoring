import express from 'express';
import prisma from '../config/database.js';

const router = express.Router();

/**
 * Calculate distance between two lat/lon points in meters (Haversine formula)
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) ** 2 +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/**
 * Calculate distance from a point to a line segment
 */
function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;

    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    return haversineDistance(px, py, xx, yy);
}

/**
 * Calculate roughness from accelerometer values
 */
function calculateRoughness(axisX, axisY, axisZ) {
    const magnitude = Math.sqrt(
        (axisX || 0) ** 2 +
        (axisY || 0) ** 2 +
        (axisZ || 0) ** 2
    );
    return Math.abs(magnitude - 1000);
}

/**
 * GET /api/segments
 * List all segments with computed average roughness
 */
router.get('/', async (req, res) => {
    try {
        const segments = await prisma.roadSegment.findMany({
            include: {
                road: { select: { roadName: true } }
            },
            orderBy: { id: 'asc' }
        });

        // Calculate roughness for each segment
        const result = await Promise.all(segments.map(async (segment) => {
            const geometry = segment.geometryJson;
            if (!geometry || !geometry.coordinates || geometry.coordinates.length < 2) {
                return {
                    ...segment,
                    avgRoughness: null,
                    pointCount: 0
                };
            }

            // Get telemetry points near this segment
            const coords = geometry.coordinates;
            const startCoord = coords[0];
            const endCoord = coords[coords.length - 1];

            // Bounding box with buffer
            const buffer = 0.0002; // ~20m in degrees
            const minLat = Math.min(startCoord[1], endCoord[1]) - buffer;
            const maxLat = Math.max(startCoord[1], endCoord[1]) + buffer;
            const minLon = Math.min(startCoord[0], endCoord[0]) - buffer;
            const maxLon = Math.max(startCoord[0], endCoord[0]) + buffer;

            const nearbyPoints = await prisma.truckTelemetry.findMany({
                where: {
                    latitude: { gte: minLat, lte: maxLat },
                    longitude: { gte: minLon, lte: maxLon },
                    speed: { gt: 0 }
                },
                select: {
                    latitude: true,
                    longitude: true,
                    axisX: true,
                    axisY: true,
                    axisZ: true
                }
            });

            // Filter points within 10m of segment line
            const matchedPoints = nearbyPoints.filter(point => {
                const lat = parseFloat(point.latitude);
                const lon = parseFloat(point.longitude);

                // Check distance to each segment of the polyline
                for (let i = 0; i < coords.length - 1; i++) {
                    const dist = pointToSegmentDistance(
                        lat, lon,
                        coords[i][1], coords[i][0],
                        coords[i + 1][1], coords[i + 1][0]
                    );
                    if (dist <= 10) return true;
                }
                return false;
            });

            // Calculate average roughness
            let avgRoughness = null;
            if (matchedPoints.length > 0) {
                const totalRoughness = matchedPoints.reduce((sum, p) =>
                    sum + calculateRoughness(p.axisX, p.axisY, p.axisZ), 0
                );
                avgRoughness = Math.round(totalRoughness / matchedPoints.length);
            }

            return {
                id: segment.id,
                roadId: segment.roadId,
                roadName: segment.road?.roadName,
                segmentNumber: segment.segmentNumber,
                geometryJson: segment.geometryJson,
                lengthMeters: segment.lengthMeters,
                avgRoughness,
                pointCount: matchedPoints.length,
                createdAt: segment.createdAt
            };
        }));

        res.json(result);
    } catch (err) {
        console.error('Get segments error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/segments/:id
 * Get single segment with matched telemetry points
 */
router.get('/:id', async (req, res) => {
    try {
        const segment = await prisma.roadSegment.findUnique({
            where: { id: parseInt(req.params.id) },
            include: { road: true }
        });

        if (!segment) {
            return res.status(404).json({ error: 'Segment not found' });
        }

        res.json(segment);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/segments
 * Create a new segment manually
 * Body: { roadId?, roadName?, geometry: [[lon, lat], ...] }
 */
router.post('/', async (req, res) => {
    try {
        const { roadId, roadName, geometry } = req.body;

        if (!geometry || !Array.isArray(geometry) || geometry.length < 2) {
            return res.status(400).json({ error: 'Invalid geometry. Need at least 2 coordinates.' });
        }

        // Get or create parent road
        let parentRoadId = roadId;
        if (!parentRoadId) {
            // Create or get "Manual Segments" road
            let road = await prisma.haulRoad.findFirst({
                where: { roadName: roadName || 'Manual Segments' }
            });
            if (!road) {
                road = await prisma.haulRoad.create({
                    data: { roadName: roadName || 'Manual Segments' }
                });
            }
            parentRoadId = road.id;
        }

        // Get next segment number
        const lastSegment = await prisma.roadSegment.findFirst({
            where: { roadId: parentRoadId },
            orderBy: { segmentNumber: 'desc' }
        });
        const segmentNumber = (lastSegment?.segmentNumber || 0) + 1;

        // Calculate length
        let lengthMeters = 0;
        for (let i = 0; i < geometry.length - 1; i++) {
            lengthMeters += haversineDistance(
                geometry[i][1], geometry[i][0],
                geometry[i + 1][1], geometry[i + 1][0]
            );
        }

        const segment = await prisma.roadSegment.create({
            data: {
                roadId: parentRoadId,
                segmentNumber,
                lengthMeters,
                geometryJson: {
                    type: 'LineString',
                    coordinates: geometry
                }
            },
            include: { road: true }
        });

        res.status(201).json(segment);
    } catch (err) {
        console.error('Create segment error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/segments/:id
 * Update segment geometry
 */
router.put('/:id', async (req, res) => {
    try {
        const { geometry, roadName } = req.body;
        const id = parseInt(req.params.id);

        const updateData = {};

        if (geometry && Array.isArray(geometry) && geometry.length >= 2) {
            // Recalculate length
            let lengthMeters = 0;
            for (let i = 0; i < geometry.length - 1; i++) {
                lengthMeters += haversineDistance(
                    geometry[i][1], geometry[i][0],
                    geometry[i + 1][1], geometry[i + 1][0]
                );
            }

            updateData.geometryJson = {
                type: 'LineString',
                coordinates: geometry
            };
            updateData.lengthMeters = lengthMeters;
        }

        const segment = await prisma.roadSegment.update({
            where: { id },
            data: updateData,
            include: { road: true }
        });

        res.json(segment);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/segments/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        await prisma.roadSegment.delete({
            where: { id: parseInt(req.params.id) }
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/segments/:id/split
 * Split a segment into multiple parts
 * Body: { parts: number }
 */
router.post('/:id/split', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { parts } = req.body;

        // Get the segment
        const segment = await prisma.roadSegment.findUnique({
            where: { id },
            include: { road: true }
        });

        if (!segment) {
            return res.status(404).json({ error: 'Segment not found' });
        }

        const geometry = segment.geometryJson;
        if (!geometry || !geometry.coordinates || geometry.coordinates.length < 2) {
            return res.status(400).json({ error: 'Invalid segment geometry' });
        }

        const coords = geometry.coordinates;
        const pointCount = coords.length;

        // Validate parts
        const maxParts = pointCount - 1;
        if (parts < 2 || parts > maxParts) {
            return res.status(400).json({
                error: `Parts must be between 2 and ${maxParts}`,
                pointCount,
                maxParts
            });
        }

        // Calculate how to split - divide by GAPS (edges) not points
        // With N points, there are N-1 gaps
        // To split into M parts, we distribute N-1 gaps across M segments
        const totalGaps = pointCount - 1;  // e.g., 5 points = 4 gaps
        const baseGapsPerSegment = Math.floor(totalGaps / parts);
        const remainder = totalGaps % parts;

        // Create new segments
        const newSegments = [];
        let startIdx = 0;

        for (let i = 0; i < parts; i++) {
            // Distribute extra gaps to earlier segments
            const gapsInThisSegment = baseGapsPerSegment + (i < remainder ? 1 : 0);

            if (gapsInThisSegment < 1) continue; // Skip if no gaps allocated

            const endIdx = startIdx + gapsInThisSegment;

            // Segment includes points from startIdx to endIdx (inclusive)
            const segmentCoords = coords.slice(startIdx, endIdx + 1);

            if (segmentCoords.length >= 2) {
                // Calculate length
                let lengthMeters = 0;
                for (let j = 0; j < segmentCoords.length - 1; j++) {
                    lengthMeters += haversineDistance(
                        segmentCoords[j][1], segmentCoords[j][0],
                        segmentCoords[j + 1][1], segmentCoords[j + 1][0]
                    );
                }

                newSegments.push({
                    coords: segmentCoords,
                    lengthMeters
                });
            }

            startIdx = endIdx; // Next segment starts at current endpoint
        }

        // Get next segment number for the road
        const lastSegment = await prisma.roadSegment.findFirst({
            where: { roadId: segment.roadId },
            orderBy: { segmentNumber: 'desc' }
        });
        let segmentNumber = (lastSegment?.segmentNumber || 0);

        // Create new segments in database
        const createdSegments = [];
        for (const newSeg of newSegments) {
            segmentNumber++;

            const created = await prisma.roadSegment.create({
                data: {
                    roadId: segment.roadId,
                    segmentNumber,
                    lengthMeters: newSeg.lengthMeters,
                    geometryJson: {
                        type: 'LineString',
                        coordinates: newSeg.coords
                    }
                }
            });
            createdSegments.push(created);
        }

        // Delete the original segment
        await prisma.roadSegment.delete({ where: { id } });

        res.json({
            success: true,
            message: `Split into ${createdSegments.length} segments`,
            originalId: id,
            newSegments: createdSegments
        });

    } catch (err) {
        console.error('Split segment error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/segments/generate
 * Auto-generate segments from telemetry data
 * Body: { minPoints?, maxGap?, minSpeed? }
 */
router.post('/generate', async (req, res) => {
    try {
        const {
            minPoints = 5,      // Min points to form a segment
            maxGap = 20,        // Max gap in meters between consecutive points
            minSpeed = 3        // Minimum speed to consider
        } = req.body;

        // Get all moving telemetry points
        const telemetry = await prisma.truckTelemetry.findMany({
            where: { speed: { gte: minSpeed } },
            orderBy: { timestamp: 'asc' },
            select: {
                id: true,
                latitude: true,
                longitude: true,
                timestamp: true
            }
        });

        if (telemetry.length < minPoints) {
            return res.json({
                message: 'Not enough data points',
                segmentsCreated: 0
            });
        }

        // Group points into segments based on geographic continuity
        const rawSegments = [];
        let currentSegment = [telemetry[0]];

        for (let i = 1; i < telemetry.length; i++) {
            const prev = telemetry[i - 1];
            const curr = telemetry[i];

            const distance = haversineDistance(
                parseFloat(prev.latitude), parseFloat(prev.longitude),
                parseFloat(curr.latitude), parseFloat(curr.longitude)
            );

            if (distance <= maxGap) {
                currentSegment.push(curr);
            } else {
                // Gap too large, start new segment
                if (currentSegment.length >= minPoints) {
                    rawSegments.push(currentSegment);
                }
                currentSegment = [curr];
            }
        }

        // Don't forget the last segment
        if (currentSegment.length >= minPoints) {
            rawSegments.push(currentSegment);
        }

        // Create or get "Auto-Generated" parent road
        let road = await prisma.haulRoad.findFirst({
            where: { roadName: 'Auto-Generated Segments' }
        });
        if (!road) {
            road = await prisma.haulRoad.create({
                data: { roadName: 'Auto-Generated Segments' }
            });
        }

        // Get current max segment number
        const lastSegment = await prisma.roadSegment.findFirst({
            where: { roadId: road.id },
            orderBy: { segmentNumber: 'desc' }
        });
        let segmentNumber = (lastSegment?.segmentNumber || 0);

        // Create segments in database
        const createdSegments = [];
        for (const points of rawSegments) {
            segmentNumber++;

            const coordinates = points.map(p => [
                parseFloat(p.longitude),
                parseFloat(p.latitude)
            ]);

            // Calculate length
            let lengthMeters = 0;
            for (let i = 0; i < coordinates.length - 1; i++) {
                lengthMeters += haversineDistance(
                    coordinates[i][1], coordinates[i][0],
                    coordinates[i + 1][1], coordinates[i + 1][0]
                );
            }

            const segment = await prisma.roadSegment.create({
                data: {
                    roadId: road.id,
                    segmentNumber,
                    lengthMeters,
                    geometryJson: {
                        type: 'LineString',
                        coordinates
                    }
                }
            });

            createdSegments.push(segment);
        }

        res.json({
            message: `Generated ${createdSegments.length} segments`,
            segmentsCreated: createdSegments.length,
            segments: createdSegments
        });

    } catch (err) {
        console.error('Generate segments error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/segments/all
 * Delete all auto-generated segments (for cleanup/regeneration)
 */
router.delete('/all/generated', async (req, res) => {
    try {
        const road = await prisma.haulRoad.findFirst({
            where: { roadName: 'Auto-Generated Segments' }
        });

        if (road) {
            const result = await prisma.roadSegment.deleteMany({
                where: { roadId: road.id }
            });
            res.json({ deleted: result.count });
        } else {
            res.json({ deleted: 0 });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
