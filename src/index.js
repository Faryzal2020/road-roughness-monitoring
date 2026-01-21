import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import telemetryRoutes from './routes/telemetry.js';
import debugRoutes from './routes/debug.js';
import dashboardRoutes from './routes/dashboard.js';
import { startTCPServer } from './services/tcp-server.js';

dotenv.config();

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
