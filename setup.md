# Server Setup Guide

Please follow these steps to configure and start the server.

## 1. Prerequisites
Ensure you have **PostgreSQL** installed and running with **TimescaleDB** extension.

## 2. Environment Setup
1.  **Install Dependencies:**
    ```powershell
    bun install
    ```
2.  Copy the `.env.example` file to a new file named `.env`.
    ```powershell
    cp .env.example .env
    ```
2.  Open `.env` and update the `DATABASE_URL` with your actual credentials.
    ```
    DATABASE_URL="postgresql://username:password@localhost:5432/road_roughness?schema=public"
    ```

## 3. Database Migration
Run the following command to create the database tables and enable TimescaleDB.
```powershell
bunx prisma migrate dev --name init
```
*If this fails with a permission error regarding `create_hypertable`, ensure your database user has SUPERUSER privileges or the TimescaleDB extension is already enabled on the database.*

## 4. Custom TimescaleDB Setup
Prisma might not automatically create the hypertable. If the migration succeeds but you see warnings, run this SQL manually in your database (e.g., via pgAdmin):
```sql
SELECT create_hypertable('TruckTelemetry', 'timestamp');
```

## 5. Build and Start (Production with PM2)
1.  Install PM2 globally (if not already installed):
    ```bash
    npm install -g pm2
    ```
2.  Start the application using the ecosystem file:
    ```bash
    pm2 start ecosystem.config.js
    ```
3.  Save the process list to resurrect on reboot:
    ```bash
    pm2 save
    ```

## 6. Verification
Once the server is running, the AI agent will test connectivity from the outside.
