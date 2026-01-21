import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const { Pool } = pg;

// Parse DATABASE_URL manually for better control
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
}

// Parse the connection string to extract components
// Format: postgresql://user:password@host:port/database?schema=public
const url = new URL(connectionString);

// Create PostgreSQL connection pool with explicit configuration
const pool = new Pool({
    user: url.username,
    password: url.password,
    host: url.hostname,
    port: parseInt(url.port || '5432'),
    database: url.pathname.slice(1), // Remove leading /
    ssl: false // Set to true if using SSL
});

// Create Prisma adapter
const adapter = new PrismaPg(pool);

// Initialize Prisma Client with adapter
const prisma = new PrismaClient({
    adapter,
    log: ['error', 'warn']
});

export default prisma;
