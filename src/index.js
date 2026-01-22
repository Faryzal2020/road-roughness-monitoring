import dotenv from 'dotenv';

// IMPORTANT: Load environment variables BEFORE any other imports
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import telemetryRoutes from './routes/telemetry.js';
import debugRoutes from './routes/debug.js';
import dashboardRoutes from './routes/dashboard.js';
import mapRoutes from './routes/map.js';
import segmentRoutes from './routes/segments.js';
import { startTCPServer } from './services/tcp-server.js';

// ES Module dirname workaround
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
// For binary Codec8 data (Teltonika) - ensure this path is specific if possible, 
// or used globally if no other endpoints need default parsing for octet-stream
app.use(express.raw({ type: 'application/octet-stream', limit: '1mb' }));

// Routes
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/debug', debugRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/segments', segmentRoutes);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Basic Routes
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start HTTP Server
app.listen(PORT, () => {
    console.log(`[HTTP] Server running on port ${PORT}`);
});

// Start TCP Server for Teltonika Devices
startTCPServer();

export default app;
