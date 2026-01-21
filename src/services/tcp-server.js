import net from 'net';
import { Codec8Parser } from '../parsers/codec8.js';
import { processTelemetryPacket } from '../services/telemetry-ingestion.js';
import { bytesToHex } from '../utils/hex-utils.js';

const TCP_PORT = process.env.TCP_PORT || 5027;
const sessions = new Map(); // Track IMEI per socket

export function startTCPServer() {
    const server = net.createServer((socket) => {
        const clientId = `${socket.remoteAddress}:${socket.remotePort}`;
        console.log(`[TCP] Client connected: ${clientId}`);

        let imei = null;
        let buffer = Buffer.alloc(0);
        let expectingIMEI = true;

        socket.on('data', async (data) => {
            buffer = Buffer.concat([buffer, data]);

            try {
                // Step 1: IMEI Handshake (first message, 17 bytes: 2-byte length + 15-byte IMEI)
                if (expectingIMEI) {
                    if (buffer.length < 2) return; // Wait for length bytes

                    const imeiLength = buffer.readUInt16BE(0);

                    if (buffer.length < 2 + imeiLength) return; // Wait for full IMEI

                    imei = buffer.slice(2, 2 + imeiLength).toString('ascii');
                    console.log(`[TCP] ${clientId} IMEI: ${imei}`);

                    // Store IMEI for this session
                    sessions.set(socket, imei);

                    // Send ACK: 0x01 = accept, 0x00 = reject
                    // For MVP, accept all. Later add IMEI validation.
                    socket.write(Buffer.from([0x01]));

                    // Remove processed bytes
                    buffer = buffer.slice(2 + imeiLength);
                    expectingIMEI = false;
                }

                // Step 2: Process Codec8 Data Packets
                while (buffer.length >= 8) {
                    // Check if we have enough data for a packet
                    // Structure: [Preamble 4b][DataLength 4b][Data...][CRC 4b]
                    if (buffer.length < 8) break;

                    const preamble = buffer.readUInt32BE(0);
                    const dataLength = buffer.readUInt32BE(4);

                    const packetLength = 8 + dataLength + 4; // Preamble + Length + Data + CRC

                    if (buffer.length < packetLength) {
                        // Wait for complete packet
                        break;
                    }

                    // Extract packet
                    const packet = buffer.slice(0, packetLength);

                    // Parse
                    try {
                        const parsed = Codec8Parser.parse(packet);
                        console.log(`[TCP] ${clientId} Parsed ${parsed.recordCount} records`);

                        // Process telemetry
                        if (imei) {
                            await processTelemetryPacket(parsed, imei);
                        }

                        // Send ACK: number of records processed (4 bytes, big-endian)
                        const ack = Buffer.alloc(4);
                        ack.writeUInt32BE(parsed.recordCount, 0);
                        socket.write(ack);

                    } catch (parseError) {
                        console.error(`[TCP] Parse error for ${clientId}:`, parseError.message);
                        console.error('[TCP] Hex:', bytesToHex(packet));
                    }

                    // Remove processed packet from buffer
                    buffer = buffer.slice(packetLength);
                }

            } catch (err) {
                console.error(`[TCP] Error handling data from ${clientId}:`, err);
            }
        });

        socket.on('end', () => {
            console.log(`[TCP] Client disconnected: ${clientId}`);
            sessions.delete(socket);
        });

        socket.on('error', (err) => {
            console.error(`[TCP] Socket error for ${clientId}:`, err.message);
            sessions.delete(socket);
        });
    });

    server.listen(TCP_PORT, () => {
        console.log(`[TCP] Teltonika server listening on port ${TCP_PORT}`);
    });

    return server;
}
