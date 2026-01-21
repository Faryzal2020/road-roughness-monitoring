/**
 * Mapping of Teltonika AVL IDs to human-readable field names.
 * Based on FMC130 standard mappings.
 */
export const AVL_ID_MAP = {
    // DIN/AIN
    1: 'din1',
    2: 'din2',
    3: 'din3',
    9: 'ain1',
    6: 'ain2', // Corrected from 10

    // Power
    66: 'externalVoltage', // mV
    67: 'batteryVoltage',  // mV
    68: 'batteryCurrent',  // mA

    // Network
    21: 'gsmSignal', // Corrected from 241 (241 is Operator Code)

    // Odometer
    16: 'totalOdometer',

    // Accelerometer (FMC130)
    // Be careful: Some devices map these differently or use IDs 17,18,19 vs Custom IO
    17: 'axisX',
    18: 'axisY',
    19: 'axisZ',

    // Custom or specific scenarios
    239: 'ignition',
    240: 'movement',
    200: 'sleepMode'
};

/**
 * Maps raw IO array to structured object
 */
export function mapAVLToFields(ioElements) {
    const mapped = {};

    for (const io of ioElements) {
        const fieldName = AVL_ID_MAP[io.id];
        if (fieldName) {
            mapped[fieldName] = io.value;
        } else {
            // Keep unknown IDs in a separate object or just loose
            if (!mapped.unknown) mapped.unknown = {};
            mapped.unknown[io.id] = io.value;
        }
    }

    return mapped;
}
