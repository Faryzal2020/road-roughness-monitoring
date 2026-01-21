import express from 'express';
import { Codec8Parser } from '../parsers/codec8.js';
import { mapAVLToFields, AVL_ID_MAP } from '../parsers/avl-mapper.js';
import { hexToBytes } from '../utils/hex-utils.js';
import prisma from '../config/database.js';

const router = express.Router();

// Parse Hex String
router.post('/parse', (req, res) => {
    const { hex } = req.body;
    if (!hex) return res.status(400).json({ error: 'Missing hex field' });

    try {
        const buffer = hexToBytes(hex);
        const parsed = Codec8Parser.parse(buffer);

        // Enhance with mappings
        const enhancedRecords = parsed.records.map(r => ({
            ...r,
            mappedIO: mapAVLToFields(r.io)
        }));

        res.json({
            meta: {
                codecId: parsed.codecId,
                count: parsed.recordCount
            },
            records: enhancedRecords
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Get AVL Map
router.get('/avl-map', (req, res) => {
    res.json(AVL_ID_MAP);
});

// Simulate Insertion (Bypass Parser)
router.post('/simulate', async (req, res) => {
    // Useful for frontend testing without device
    // Body: { imei, latitude, longitude, axisZ, etc... }
    const data = req.body;
    // TODO: manually call processTelemetryPacket with mocked structure
    res.json({ status: 'Not implemented yet, use actual ingestion flow' });
});

export default router;
