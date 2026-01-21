import { Codec8Parser } from '../src/parsers/codec8.js';
import { mapAVLToFields } from '../src/parsers/avl-mapper.js';
import { hexToBytes } from '../src/utils/hex-utils.js';

// Sample FMC130 Codec8 string (Replace with real data from logs)
// This is a dummy example structure for testing
const SAMPLE_HEX = "0000000000000045080100000185D83E9C800100000000000000000000000000000000030001010100020002001103AF00EF00000000000100001234";

// Helper to run test
function testParser(hexString) {
  console.log("Testing Hex:", hexString);
  try {
    const buffer = hexToBytes(hexString);
    const parsed = Codec8Parser.parse(buffer);

    console.log("✅ Parse Success!");
    console.log("Codec ID:", parsed.codecId);
    console.log("Record Count:", parsed.recordCount);

    parsed.records.forEach((rec, idx) => {
      console.log(`\nRecord #${idx + 1}:`);
      console.log("  Timestamp:", rec.timestamp);
      console.log("  GPS:", rec.gps);

      const mappedIO = mapAVLToFields(rec.io);
      console.log("  Mapped IO:", mappedIO);
      console.log("  Raw IO:", rec.io);
    });

  } catch (error) {
    console.error("❌ Parse Failed:", error.message);
  }
}

// Allow passing hex via command line
const inputHex = process.argv[2];
if (inputHex) {
  testParser(inputHex);
} else {
  console.log("Usage: bun scripts/test-parser.js <HEX_STRING>");
  console.log("Running with dummy sample...");
  // Note: The dummy sample above might fail CRC check if not perfect, 
  // but it verifies the structure.
  // For a real test, we need a real packet.
  testParser(SAMPLE_HEX);
}
