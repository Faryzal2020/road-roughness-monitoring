export function bytesToHex(buffer) {
    return Buffer.from(buffer).toString('hex').toUpperCase();
}

export function hexToBytes(hex) {
    return Buffer.from(hex, 'hex');
}
