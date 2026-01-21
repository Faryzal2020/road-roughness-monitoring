import prisma from '../config/database.js';

// Cache segment lookups for rounded coordinates
// Key: "lat_rounded,lon_rounded" -> segmentId
const segmentCache = new Map();
const CACHE_SIZE_LIMIT = 1000;

function getCacheKey(lat, lon) {
  return `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
}

/**
 * Finds the road segment closest to the given point within 50 meters
 */
export async function assignRoadSegment(latitude, longitude) {
  const cacheKey = getCacheKey(latitude, longitude);
  if (segmentCache.has(cacheKey)) {
    return segmentCache.get(cacheKey);
  }

  // Use raw SQL for PostGIS functions
  // Note: We cast inputs to geography to use ST_DWithin (meters)
  // Ensure "geometryJson" field in DB actually contains valid GeoJSON LineString

  /*
    Optimized query:
    1. Make point from lat/lon (SRID 4326)
    2. Compare with RoadSegment.geometryJson using ST_GeomFromGeoJSON
    3. Output closest segment ID
  */

  try {
    const result = await prisma.$queryRaw`
      SELECT id 
      FROM "RoadSegment" 
      WHERE ST_DWithin(
    ST_SetSRID(ST_MakePoint(${Number(longitude)}, ${Number(latitude)}), 4326):: geography,
    ST_GeomFromGeoJSON(CAST("geometryJson" AS text)):: geography,
    50 -- distance in meters
  )
      LIMIT 1
    `;

    const segmentId = result.length > 0 ? result[0].id : null;

    // Cache management
    if (segmentCache.size >= CACHE_SIZE_LIMIT) {
      const firstKey = segmentCache.keys().next().value;
      segmentCache.delete(firstKey);
    }
    segmentCache.set(cacheKey, segmentId);

    return segmentId;
  } catch (err) {
    console.error('Segment assignment error (PostGIS might be missing or invalid geometry):', err.message);
    return null; // Fail safe, store without segment
  }
}
