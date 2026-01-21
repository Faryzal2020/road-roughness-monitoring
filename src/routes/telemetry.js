import express from 'express';
import { Codec8Parser } from '../parsers/codec8.js';
import { processTelemetryPacket } from '../services/telemetry-ingestion.js';
import { bytesToHex } from '../utils/hex-utils.js';

const router = express.Router();

// Main endpoint for Teltonika Devices
// Expects raw binary body
router.post('/', async (req, res) => {
    try {
        const rawBuffer = req.body;

        // Logging logic for debugging
        // console.log('Received payload:', rawBuffer.length, 'bytes');

        if (rawBuffer.length === 0) {
            return res.status(400).send('Empty payload');
        }

        // Capture IMEI?
        // Codec8 packets DON'T contain IMEI inside the data packet usually.
        // The IMEI is sent in the LOGIN packet (first connection).
        // Express HTTP server assumes stateless requests.
        // IF the device sends HTTP POST, it usually puts IMEI in query param or header.
        // Teltonika FMB/FMC configured for HTTP sends: ?imei=<imei>

        const imei = req.query.imei;

        if (!imei) {
            return res.status(400).json({ error: 'Missing IMEI parameter' });
        }

        // 1. Parse
        let parsed;
        try {
            parsed = Codec8Parser.parse(rawBuffer);
        } catch (parseError) {
            console.error('Parse Error:', parseError.message);
            console.error('Hex:', bytesToHex(rawBuffer));
            return res.status(400).json({ error: 'Invalid Codec8 Format', details: parseError.message });
        }

        // 2. Process
        const result = await processTelemetryPacket(parsed, imei);

        // 3. Response
        // For Teltonika HTTP, simply 200 OK often suffices, 
        // but sometimes it expects specific ACK.
        // Documentation says: HTTP 200 OK.

        res.json(result);

    } catch (err) {
        console.error('Telemetry Handler Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
