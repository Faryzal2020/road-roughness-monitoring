# Mining Truck Road Roughness Monitoring System
## Implementation Plan for AI Coding Agent

---

## Tech Stack
- **Runtime**: Bun.js
- **Language**: JavaScript
- **Database**: PostgreSQL + TimescaleDB
- **ORM**: Prisma 7
- **Protocol**: Teltonika Codec8

---

## Project Structure

```
project-root/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── index.js                    # Main server entry
│   ├── config/
│   │   ├── database.js            # Prisma client singleton
│   │   └── constants.js           # Thresholds, intervals
│   ├── parsers/
│   │   ├── codec8.js              # Codec8/Extended parser
│   │   └── avl-mapper.js          # AVL ID → field mapping
│   ├── services/
│   │   ├── telemetry-ingestion.js # Process & store telemetry
│   │   ├── device-validator.js    # IMEI registration check
│   │   └── segment-assignment.js  # Assign road segments
│   ├── algorithms/
│   │   ├── rms-calculator.js      # Root Mean Square
│   │   ├── iri-estimator.js       # IRI calculation
│   │   ├── event-detector.js      # Roughness event detection
│   │   └── statistics-aggregator.js # Daily/hourly stats
│   ├── routes/
│   │   ├── telemetry.js           # POST /telemetry (device endpoint)
│   │   ├── debug.js               # Debug/parser endpoints
│   │   └── dashboard.js           # Dashboard API endpoints
│   ├── middleware/
│   │   ├── error-handler.js       # Global error handling
│   │   └── logger.js              # Request/response logging
│   └── utils/
│       ├── hex-utils.js           # Hex conversion utilities
│       └── geo-utils.js           # Geographic calculations
├── tests/
│   ├── parsers/
│   └── algorithms/
├── scripts/
│   ├── seed-data.js               # Initial data setup
│   └── calculate-stats.js         # Background job runner
├── .env
├── package.json
└── README.md
```

---

## Database Schema (Prisma)

### Core Models

**Truck**
- id (Int, PK, autoincrement)
- imei (String, unique, indexed)
- truckId (String, unique)
- registration, make, model
- capacityTons (Decimal)
- status (enum: ACTIVE, MAINTENANCE, RETIRED)
- createdAt, updatedAt (DateTime)

**HaulRoad**
- id (Int, PK)
- roadName (String)
- roadType (String)
- startLat, startLon (Decimal)
- endLat, endLon (Decimal)
- lengthMeters (Decimal)
- surfaceType (String)
- speedLimitKmh (Int)
- active (Boolean)
- createdAt, updatedAt

**RoadSegment**
- id (Int, PK)
- roadId (Int, FK → HaulRoad)
- segmentNumber (Int)
- startChainageM (Decimal)
- endChainageM (Decimal)
- lengthMeters (Decimal)
- avgGradePercent (Decimal)
- geometryJson (Json) // GeoJSON LineString
- @@unique([roadId, segmentNumber])

**TruckTelemetry** (TimescaleDB hypertable)
- id (BigInt, PK, autoincrement)
- timestamp (DateTime, indexed, hypertable dimension)
- truckId (Int, FK → Truck, indexed)
- latitude, longitude (Decimal)
- altitude, speed, heading (Int)
- satellites, hdop (Int, Decimal)
- axisX, axisY, axisZ (Int) // mG values
- ignition, movement (Boolean)
- externalVoltage, batteryVoltage (Int)
- din1, din2 (Boolean)
- ain1 (Int)
- totalOdometer, tripOdometer (BigInt, Int)
- gsmSignal (Int)
- roadSegmentId (Int, FK → RoadSegment, nullable, indexed)
- isLoaded (Boolean, nullable)
- rawData (Json) // Complete AVL packet
- processed (Boolean, default: false, indexed)
- createdAt (DateTime)
- @@index([truckId, timestamp(sort: Desc)])
- @@index([roadSegmentId, timestamp(sort: Desc)])

**RoughnessEvent**
- id (Int, PK)
- timestamp (DateTime, indexed)
- truckId (Int, FK → Truck)
- latitude, longitude (Decimal)
- roadSegmentId (Int, FK → RoadSegment, nullable)
- eventType (String) // pothole, washboard, bump
- severity (enum: LOW, MEDIUM, HIGH, CRITICAL)
- peakZAxis, peakYAxis, peakXAxis (Int)
- durationMs (Int)
- speedKmh (Int)
- isLoaded (Boolean)
- verified, maintenanceRequired (Boolean)
- notes (String, nullable)
- createdAt, updatedAt

**RoadSegmentStats**
- id (Int, PK)
- roadSegmentId (Int, FK → RoadSegment, indexed)
- date (DateTime, date only, indexed)
- totalPasses, loadedPasses, emptyPasses (Int)
- avgZAxisRms (Decimal)
- maxZAxis, minZAxis (Int)
- stdDevZAxis (Decimal)
- estimatedIri (Decimal) // m/km
- iriCategory (String) // good, fair, poor, very_poor
- roughnessEventCount, criticalEventCount (Int)
- @@unique([roadSegmentId, date])

**Alert**
- id (Int, PK)
- alertType (String)
- severity (enum: INFO, WARNING, CRITICAL)
- truckId (Int, FK → Truck, nullable)
- roadSegmentId (Int, FK → RoadSegment, nullable)
- latitude, longitude (Decimal, nullable)
- title (String)
- message (String)
- data (Json, nullable)
- acknowledged (Boolean, default: false, indexed)
- acknowledgedBy, acknowledgedAt (String, DateTime, nullable)
- resolved (Boolean, default: false)
- resolvedAt (DateTime, nullable)
- createdAt (DateTime, indexed)

### Prisma Configuration Notes
- Enable TimescaleDB preview feature
- Use raw SQL for hypertable creation (migration file)
- Create compound indexes for common queries
- Set up cascade deletes appropriately

---

## Implementation Phases

### Phase 1: Foundation (Days 1-2)

**1.1 Project Setup**
- Initialize Bun project
- Install dependencies: `@prisma/client`, `express`, `cors`, `dotenv`
- Configure Prisma with PostgreSQL + TimescaleDB
- Create `.env` with DATABASE_URL, PORT, LOG_LEVEL

**1.2 Database Setup**
- Define complete Prisma schema
- Generate initial migration
- Write custom migration SQL for TimescaleDB:
  - `SELECT create_hypertable('TruckTelemetry', 'timestamp')`
  - Add compression policy (7 days)
  - Add retention policy (2 years)
- Create PostGIS indexes using raw SQL if needed
- Run migrations

**1.3 Base Server**
- Create Express server with Bun
- Set up middleware: CORS, JSON parser, logger
- Implement global error handler
- Health check endpoint: `GET /health`

---

### Phase 2: Codec8 Parser (Days 3-4)

**2.1 Parser Implementation (`parsers/codec8.js`)**

**Functions:**
- `parseCodec8(buffer)` → returns parsed packet object
  - Parse preamble (4 bytes)
  - Parse data length (4 bytes)
  - Parse codec ID (1 byte)
  - Parse number of records (1 byte)
  - Loop through AVL records:
    - Parse timestamp (8 bytes, Unix ms)
    - Parse priority (1 byte)
    - Parse GPS element (15 bytes): lon, lat, alt, angle, satellites, speed
    - Parse IO element count
    - Parse IO elements by size (1-byte, 2-byte, 4-byte, 8-byte)
  - Parse CRC-16 (4 bytes)
  - Validate CRC
- `parseCodec8Extended(buffer)` → handle 16-byte IO elements
- `validateCRC(buffer, expectedCRC)` → boolean

**Error Handling:**
- Throw descriptive errors for malformed packets
- Log hex dump on parse failure

**2.2 AVL Mapper (`parsers/avl-mapper.js`)**

**Mapping Object:**
```javascript
AVL_ID_MAP = {
  1: 'din1',
  9: 'ain1',
  16: 'totalOdometer',
  17: 'axisX',
  18: 'axisY',
  19: 'axisZ',
  21: 'gsmSignal',
  66: 'externalVoltage',
  67: 'batteryVoltage',
  68: 'batteryCurrent',
  // ... complete FMC130 AVL ID list
}
```

**Function:**
- `mapAVLToFields(ioElements)` → normalized object
  - Iterate through IO elements
  - Map AVL ID to field name
  - Convert units if needed (e.g., voltage mV)
  - Return structured object

---

### Phase 3: Telemetry Ingestion (Days 5-6)

**3.1 Device Validator (`services/device-validator.js`)**

**Functions:**
- `validateIMEI(imei)` → Promise<Truck | null>
  - Query Prisma: `prisma.truck.findUnique({ where: { imei } })`
  - Return truck object or null
  - Cache results (in-memory Map, TTL 5 min)

**3.2 Segment Assignment (`services/segment-assignment.js`)**

**Functions:**
- `assignRoadSegment(latitude, longitude)` → Promise<Int | null>
  - Use raw SQL with PostGIS (Prisma doesn't support geography well):
    ```sql
    SELECT id FROM "RoadSegment"
    WHERE ST_DWithin(
      ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
      ST_GeomFromGeoJSON(geometry_json)::geography,
      50
    )
    ORDER BY ST_Distance(...)
    LIMIT 1
    ```
  - Return segment ID or null
  - Cache segment lookups by rounded lat/lon

**3.3 Telemetry Ingestion Service (`services/telemetry-ingestion.js`)**

**Main Function:**
- `processTelemetryPacket(parsedData, imei)` → Promise<void>

**Steps:**
1. Validate IMEI → get truckId
2. If not registered → throw error (will be caught and logged)
3. For each AVL record in packet:
   - Extract timestamp, GPS, IO elements
   - Map AVL IDs to fields
   - Assign road segment (async)
   - Determine isLoaded (from din1 or threshold logic)
   - Insert into TruckTelemetry via Prisma
   - Store complete AVL record in rawData (JSONB)
4. Return success/failure summary

**Batch Insert:**
- Use `prisma.truckTelemetry.createMany()` for efficiency
- Handle duplicates (ON CONFLICT DO NOTHING if timestamp+truckId unique)

---

### Phase 4: Algorithms (Days 7-8)

**4.1 RMS Calculator (`algorithms/rms-calculator.js`)**

**Function:**
- `calculateRMS(values[])` → Decimal
  - Formula: sqrt(sum(values²) / n)
  - Handle empty arrays
  - Return rounded to 2 decimals

**4.2 IRI Estimator (`algorithms/iri-estimator.js`)**

**Function:**
- `estimateIRI(axisZValues[], speedKmh)` → Object
  - Calculate RMS of Z-axis
  - Apply speed correction factor
  - Empirical formula: `IRI ≈ (RMS / 1000) × speedFactor × calibration`
  - Return: `{ iri, category }` where category is:
    - < 2.5: "good"
    - 2.5-4: "fair"
    - 4-6: "poor"
    - > 6: "very_poor"

**Research Note:**
- IRI from accelerometer is approximation
- Requires calibration with actual IRI measurements
- Include confidence interval in return

**4.3 Event Detector (`algorithms/event-detector.js`)**

**Function:**
- `detectRoughnessEvents(telemetryRecords[])` → Event[]
  - Define thresholds:
    - MEDIUM: |axisZ| > 2000 mG
    - HIGH: |axisZ| > 2500 mG
    - CRITICAL: |axisZ| > 3500 mG
  - Scan for peaks exceeding threshold
  - Calculate event duration (consecutive high readings)
  - Determine event type (heuristics based on axis patterns)
  - Return array of event objects

**4.4 Statistics Aggregator (`algorithms/statistics-aggregator.js`)**

**Function:**
- `aggregateDailyStats(roadSegmentId, date)` → Promise<void>
  - Query all telemetry for segment on date
  - Calculate:
    - Total/loaded/empty pass counts
    - Z-axis: RMS, max, min, stddev
    - Estimate IRI from aggregated data
    - Count roughness events
  - Upsert into RoadSegmentStats
  - Determine trend (compare with previous period)

---

### Phase 5: API Endpoints (Days 9-10)

**5.1 Telemetry Endpoint (`routes/telemetry.js`)**

**POST /api/telemetry**
- Receive binary Codec8 data (Buffer)
- Extract IMEI from packet or query parameter
- Parse with Codec8 parser
- Process with ingestion service
- Return: `{ success: boolean, recordsProcessed: int, errors: [] }`
- Status codes:
  - 200: Success
  - 400: Parse error
  - 403: IMEI not registered
  - 500: Server error

**5.2 Debug Endpoints (`routes/debug.js`)**

**POST /api/debug/parse**
- Accept hex string or binary buffer
- Parse with Codec8 parser
- Return full parsed structure (JSON)
- Include validation results
- Show AVL ID mappings
- Purpose: Verify parser works before registering IMEI

**GET /api/debug/packet/:imei/latest**
- Fetch latest raw packet for IMEI
- Return rawData field from TruckTelemetry
- Show parsed vs stored comparison

**POST /api/debug/simulate**
- Accept JSON telemetry data (manual format)
- Bypass parser, directly insert
- Purpose: Test ingestion without device

**GET /api/debug/avl-map**
- Return complete AVL ID mapping
- Show supported fields for FMC130

**5.3 Dashboard Endpoints (`routes/dashboard.js`)**

**GET /api/dashboard/trucks**
- List all trucks with latest status
- Join with latest TruckTelemetry record
- Return: truckId, location, speed, isLoaded, lastUpdate, roadName

**GET /api/dashboard/trucks/:id/telemetry**
- Query params: startDate, endDate, limit
- Return paginated telemetry history
- Include road segment info

**GET /api/dashboard/trucks/:id/route**
- Date range filter
- Return GPS coordinates array for map visualization
- Include roughness color coding (green/yellow/red based on Z-axis)

**GET /api/dashboard/segments**
- List all road segments with latest stats
- Filter by roadId, iriCategory, date range
- Sort by IRI (worst first) or name
- Return: segmentId, roadName, segmentNumber, IRI, eventCount, lastUpdated

**GET /api/dashboard/segments/:id/stats**
- Date range filter
- Return time series of IRI over time
- Include pass counts, events

**GET /api/dashboard/segments/:id/events**
- Query params: severity, startDate, endDate
- Return roughness events for segment
- Paginated

**GET /api/dashboard/events/recent**
- Query params: severity, limit (default 50)
- Return recent roughness events across all segments
- For real-time alerting

**GET /api/dashboard/alerts**
- Query params: acknowledged, resolved
- Return system alerts
- Filter by severity, truck, segment

**POST /api/dashboard/alerts/:id/acknowledge**
- Body: { acknowledgedBy: string }
- Mark alert as acknowledged

**GET /api/dashboard/maintenance-priority**
- Calculate maintenance priority scores
- Return segments needing attention
- Order by urgency

**GET /api/dashboard/statistics/summary**
- Overall statistics:
  - Total trucks active
  - Total road length
  - Average IRI across network
  - Critical segments count
  - Events last 24h

---

### Phase 6: Background Jobs (Day 11)

**6.1 Stats Calculator Script (`scripts/calculate-stats.js`)**

**Cron Schedule:** Run daily at 2 AM

**Process:**
1. Get all road segments
2. For each segment:
   - Calculate yesterday's stats
   - Update RoadSegmentStats table
3. Generate alerts for deteriorating segments
4. Log completion

**6.2 Event Detection Job**

**Cron Schedule:** Run every 15 minutes

**Process:**
1. Query unprocessed telemetry (`processed = false`)
2. Run event detector algorithm
3. Insert detected events into RoughnessEvent
4. Generate critical alerts
5. Mark telemetry as processed
6. Batch process (1000 records at a time)

**Implementation:**
- Use `setInterval()` or cron library
- Ensure single instance (use PG advisory locks)

---

### Phase 7: Testing & Documentation (Day 12)

**7.1 Unit Tests**
- Parser: Test with real Codec8 hex dumps
- Algorithms: Test RMS, IRI calculations with known inputs
- AVL Mapper: Verify all FMC130 IDs mapped

**7.2 Integration Tests**
- POST packet → verify DB insertion
- Segment assignment accuracy
- End-to-end flow: packet → parsing → storage → retrieval

**7.3 Documentation**
- README with setup instructions
- API documentation (endpoints, parameters, responses)
- Configuration guide (.env variables)
- Troubleshooting guide
- Sample Codec8 packets for testing

---

## Configuration Constants

**`config/constants.js`**

```javascript
export const THRESHOLDS = {
  ROUGHNESS: {
    MEDIUM: 2000,    // mG
    HIGH: 2500,
    CRITICAL: 3500
  },
  IRI_CATEGORIES: {
    GOOD: 2.5,
    FAIR: 4,
    POOR: 6
  },
  SEGMENT_PROXIMITY: 50  // meters
}

export const CACHE_TTL = {
  IMEI_VALIDATION: 300,     // 5 minutes
  SEGMENT_LOOKUP: 600       // 10 minutes
}

export const BATCH_SIZES = {
  TELEMETRY_INSERT: 100,
  EVENT_PROCESSING: 1000
}
```

---

## Error Handling Strategy

**Global Error Handler:**
- Catch all unhandled errors
- Log with context (IMEI, timestamp, endpoint)
- Return consistent error format:
  ```json
  {
    "success": false,
    "error": "Error description",
    "code": "ERROR_CODE",
    "timestamp": "ISO 8601"
  }
  ```

**Specific Error Types:**
- `UnregisteredDeviceError`: IMEI not in database
- `ParseError`: Codec8 parsing failed
- `ValidationError`: Data validation failed
- `DatabaseError`: Prisma/PG errors

**Logging:**
- Use structured logging (JSON format)
- Log levels: ERROR, WARN, INFO, DEBUG
- Include request ID for tracing

---

## Performance Considerations

**1. Database Optimizations**
- Index all foreign keys
- Composite indexes for common queries
- TimescaleDB compression after 7 days
- Connection pooling (Prisma handles this)

**2. Caching**
- In-memory cache for IMEI validation
- Cache road segment lookups by rounded coordinates
- Use Redis if scaling beyond single instance

**3. Batch Processing**
- Insert telemetry in batches (100 records)
- Process events in chunks (1000 records)
- Use background jobs for heavy calculations

**4. Query Optimization**
- Use Prisma select to fetch only needed fields
- Implement pagination for all list endpoints
- Use materialized views for dashboard stats (TimescaleDB continuous aggregates)

---

## Security Checklist

- [ ] Validate all input data
- [ ] Sanitize IMEI and user inputs
- [ ] Use parameterized queries (Prisma does this)
- [ ] Rate limiting on public endpoints
- [ ] HTTPS only in production
- [ ] Environment variables for secrets
- [ ] CORS configuration for dashboard origin
- [ ] API key authentication (optional, for dashboard)

---

## Deployment Checklist

- [ ] Database migrations applied
- [ ] TimescaleDB hypertable created
- [ ] Environment variables configured
- [ ] Background jobs scheduled
- [ ] Monitoring/alerting configured
- [ ] Log aggregation setup
- [ ] Database backups automated
- [ ] SSL certificates installed
- [ ] Firewall rules configured
- [ ] Documentation deployed

---

## Future Enhancements (Post-MVP)

1. **Machine Learning:**
   - Train model to predict maintenance needs
   - Classify road damage types automatically
   - Anomaly detection for unusual patterns

2. **Real-time Processing:**
   - WebSocket connections for live dashboard updates
   - Real-time event notifications

3. **Advanced Analytics:**
   - Correlation with weather data
   - Load impact analysis (loaded vs empty)
   - Driver behavior analysis

4. **Mobile App:**
   - Driver alerts for rough sections ahead
   - Report issues directly from truck

5. **Optimization:**
   - Route optimization based on road conditions
   - Maintenance scheduling optimization

---

## Development Timeline

- **Day 1-2:** Foundation (Project setup, database, base server)
- **Day 3-4:** Codec8 parser and AVL mapping
- **Day 5-6:** Telemetry ingestion pipeline
- **Day 7-8:** Algorithm implementation
- **Day 9-10:** API endpoints (debug + dashboard)
- **Day 11:** Background jobs and automation
- **Day 12:** Testing, documentation, deployment prep

**Total:** 12 development days for MVP

---

## Success Metrics

- [ ] Successfully parse 100% of FMC130 Codec8 packets
- [ ] Process and store telemetry with <1s latency
- [ ] Accurately assign road segments (>95% accuracy within 50m)
- [ ] Dashboard loads in <2s
- [ ] Background jobs complete without errors
- [ ] Zero data loss during ingestion
- [ ] API response times <200ms (P95)

---

## Notes for AI Agent

- Use Bun-specific APIs where beneficial (faster file I/O, native TypeScript)
- Prisma 7 may require `@prisma/client@latest-7` during preview
- Test Codec8 parser extensively with real hex dumps from FMC130
- PostGIS functions require raw SQL in Prisma (use `$queryRaw`)
- TimescaleDB setup requires custom migration SQL
- All coordinates use WGS84 (SRID 4326)
- Accelerometer values from FMC130 are in milligravity (mG)
- IMEI is 15-digit string from FMC130
- Implement graceful shutdown (close DB connections, finish processing)

---

**End of Implementation Plan**