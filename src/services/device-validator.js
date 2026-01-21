import prisma from '../config/database.js';

// Simple in-memory cache to reduce DB hits
// Map<imei, { truck, expiresAt }>
const deviceCache = new Map();
const TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function validateIMEI(imei) {
    const now = Date.now();

    // Custom: Check cache
    if (deviceCache.has(imei)) {
        const cached = deviceCache.get(imei);
        if (cached.expiresAt > now) {
            return cached.truck;
        }
        deviceCache.delete(imei);
    }

    // Query DB
    const truck = await prisma.truck.findUnique({
        where: { imei: String(imei) },
        select: { id: true, imei: true, truckId: true, status: true }
    });

    if (truck) {
        // Cache result
        deviceCache.set(imei, {
            truck,
            expiresAt: now + TTL_MS
        });
    }

    return truck;
}
