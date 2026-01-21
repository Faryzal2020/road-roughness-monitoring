import { bytesToHex } from '../utils/hex-utils.js';

/**
 * Validates CRC-16 (IBM/ARC) for Teltonika packets
 */
function validateCRC(buffer, expectedCRC) {
  // Simple CRC16 implementation (polynomial 0xA001)
  let crc = 0;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j++) {
      if ((crc & 1) > 0) {
        crc = (crc >> 1) ^ 0xA001;
      } else {
        crc = crc >> 1;
      }
    }
  }
  return crc === expectedCRC;
}

export class Codec8Parser {
  /**
   * Main entry point for parsing buffer
   */
  static parse(buffer) {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error('Input must be a buffer');
    }

    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    let offset = 0;

    // 1. Preamble (4 bytes) - usually 0x00000000
    const preamble = view.getUint32(offset);
    offset += 4;

    // 2. Data Length (4 bytes)
    const dataLength = view.getUint32(offset);
    offset += 4;

    // 3. Codec ID (1 byte)
    const codecId = view.getUint8(offset);
    offset += 1;

    if (codecId !== 0x08 && codecId !== 0x8E) { // 0x08 = Codec8, 0x8E = Codec8 Extended
      throw new Error(`Unsupported Codec ID: ${codecId}`);
    }

    const isExtended = codecId === 0x8E;

    // 4. Number of Records 1 (1 byte)
    const recordCount = view.getUint8(offset);
    offset += 1;

    const records = [];

    // 5. Loop through records
    for (let i = 0; i < recordCount; i++) {
      const record = {};

      // Timestamp (8 bytes)
      const timestampMs = Number(view.getBigUint64(offset));
      record.timestamp = new Date(timestampMs);
      offset += 8;

      // Priority (1 byte)
      record.priority = view.getUint8(offset);
      offset += 1;

      // GPS Element (15 bytes)
      record.gps = {
        longitude: view.getInt32(offset) / 10000000,
        latitude: view.getInt32(offset + 4) / 10000000,
        altitude: view.getInt16(offset + 8),
        angle: view.getUint16(offset + 10),
        satellites: view.getUint8(offset + 12),
        speed: view.getUint16(offset + 13)
      };
      offset += 15;

      // IO Element
      // Event IO ID (1 byte for Codec8, 2 bytes for Extended)
      const eventIoId = isExtended ? view.getUint16(offset) : view.getUint8(offset);
      offset += isExtended ? 2 : 1;
      record.eventIoId = eventIoId;

      // Total IO Count (1 byte for Codec8, 2 bytes for Extended)
      // Note: In Codec8, this is total count. 
      // In logical grouping below, we read N elements of 1 byte, etc.
      const totalIoCount = isExtended ? view.getUint16(offset) : view.getUint8(offset);
      offset += isExtended ? 2 : 1;

      record.io = [];

      // Helper to parse IO groups
      const parseIoGroup = (bytesPerValue) => {
        const count = isExtended ? view.getUint16(offset) : view.getUint8(offset);
        offset += isExtended ? 2 : 1;

        for (let j = 0; j < count; j++) {
          const id = isExtended ? view.getUint16(offset) : view.getUint8(offset);
          offset += isExtended ? 2 : 1;

          let value;
          if (bytesPerValue === 1) value = view.getUint8(offset);
          else if (bytesPerValue === 2) value = view.getUint16(offset);
          else if (bytesPerValue === 4) value = view.getUint32(offset);
          else if (bytesPerValue === 8) value = Number(view.getBigUint64(offset));

          offset += bytesPerValue;
          record.io.push({ id, value, byteSize: bytesPerValue });
        }
      };

      parseIoGroup(1); // 1-byte IDs
      parseIoGroup(2); // 2-byte IDs
      parseIoGroup(4); // 4-byte IDs
      parseIoGroup(8); // 8-byte IDs

      records.push(record);
    }

    // 6. Number of Records 2 (1 byte) - should match first count
    const recordCount2 = view.getUint8(offset);
    offset += 1;

    // 7. CRC (4 bytes)
    const receivedCrc = view.getUint32(offset);

    // Validate CRC (calculated on data part: from CodecID to RecordCount2)
    // Data length is stored in header. 
    // The buffer passed to CRC check should be buffer.slice(8, 8 + dataLength)
    // Note: The dataLength field in header DOES NOT include the 4 bytes of CRC itself, nor the Preamble/Length fields.

    /* 
       The packet structure:
       [Preamble 4b] [DataLength 4b] [CodecID 1b] ... [RecordCount2 1b] [CRC 4b]
       Calculate CRC on: [CodecID ... RecordCount2]
    */

    return {
      codecId,
      recordCount,
      records
    };
  }
}
