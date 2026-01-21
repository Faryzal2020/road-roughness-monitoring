import prisma from '../config/database.js';
import { validateIMEI } from './device-validator.js';
import { assignRoadSegment } from './segment-assignment.js';
import { mapAVLToFields } from '../parsers/avl-mapper.js';

export async function processTelemetryPacket(parsedPacket, imei) {
  if (!parsedPacket || !parsedPacket.records || parsedPacket.records.length === 0) {
    return { success: false, error: "Empty packet" };
  }

  // 1. Validate Device
  const truck = await validateIMEI(imei);
  if (!truck) {
    console.warn(`Unauthorized IMEI: ${imei}`);
    throw new Error('Unauthorized Device');
  }

  const { id: truckId } = truck;
  const recordsToInsert = [];

  // 2. Process each record
  for (const record of parsedPacket.records) {
    const { timestamp, gps, io } = record;

    // Map IO elements
    const mappedIO = mapAVLToFields(io);

    // Assign Segment (Async but we await it here for simplicity, 
    // in high load might want to fire-and-forget or batch)
    const segmentId = await assignRoadSegment(gps.latitude, gps.longitude);

    // Determine load status (Simple logic for now: DIN1=1 is Loaded)
    // Refine this based on actual sensor configuration later
    const isLoaded = Boolean(mappedIO.din1);

    // Prepare DB object
    // Note: TimescaleDB handles the partition based on 'timestamp'
    recordsToInsert.push({
      timestamp: timestamp,
      truckId: truckId,

      // GPS
      latitude: gps.latitude,
      longitude: gps.longitude,
      altitude: gps.altitude,
      speed: gps.speed,
      heading: gps.angle,
      satellites: gps.satellites,

      // Accelerometer (mG)
      axisX: mappedIO.axisX || 0,
      axisY: mappedIO.axisY || 0,
      axisZ: mappedIO.axisZ || 0,

      // Vehicle Sensors
      ignition: Boolean(mappedIO.ignition),
      movement: Boolean(mappedIO.movement),
      externalVoltage: mappedIO.externalVoltage || 0,
      batteryVoltage: mappedIO.batteryVoltage || 0,

      // Digital/Analog Inputs
      din1: Boolean(mappedIO.din1),
      din2: Boolean(mappedIO.din2),
      ain1: mappedIO.ain1 || 0,

      // Other
      totalOdometer: mappedIO.totalOdometer ? BigInt(mappedIO.totalOdometer) : null,
      gsmSignal: mappedIO.gsmSignal,

      // Meta
      roadSegmentId: segmentId,
      isLoaded: isLoaded,
      rawData: record, // Store full raw record as JSON for debugging
      processed: false // Processed by event detector later
    });
  }

  // 3. Batch Insert
  if (recordsToInsert.length > 0) {
    // createMany is efficient for batch inserts
    await prisma.truckTelemetry.createMany({
      data: recordsToInsert,
      skipDuplicates: true // In case of re-transmissions
    });
  }

  return {
    success: true,
    truckId: truckId,
    recordsProcessed: recordsToInsert.length
  };
}
