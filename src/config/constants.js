export const THRESHOLDS = {
  ROUGHNESS: {
    MEDIUM: 2000,    // mG
    HIGH: 2500,
    CRITICAL: 3500
  },
  // Roughness Index Categories (Arbitrary units based on StdDev for now)
  IRI_CATEGORIES: {
    GOOD: 2.5,
    FAIR: 4,
    POOR: 6
  },
  SEGMENT_PROXIMITY: 50  // meters
};

export const CACHE_TTL = {
  IMEI_VALIDATION: 300,     // 5 minutes
  SEGMENT_LOOKUP: 600       // 10 minutes
};

export const BATCH_SIZES = {
  TELEMETRY_INSERT: 100,
  EVENT_PROCESSING: 1000
};
