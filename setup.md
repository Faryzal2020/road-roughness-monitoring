# Server Setup Guide

Please follow these steps to configure and start the server. This guide assumes a fresh Ubuntu or Debian server.

## 1. System Prerequisites (Ubuntu/Debian)

### Install Bun.js
```bash
curl -fsSL https://bun.sh/install | bash
# Restart your shell or source .bashrc as instructed
source ~/.bashrc
```

### Install PostgreSQL + TimescaleDB + PostGIS

**Step 1. Add PostgreSQL & TimescaleDB Repositories**
```bash
# Update Apt
sudo apt-get update

# Install GPG tools
sudo apt install gnupg postgresql-common apt-transport-https lsb-release wget

# Add PostgreSQL Repository
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh

# Add TimescaleDB Repository
echo "deb https://packagecloud.io/timescale/timescaledb/ubuntu/ $(lsb_release -c -s) main" | sudo tee /etc/apt/sources.list.d/timescaledb.list
wget --quiet -O - https://packagecloud.io/timescale/timescaledb/gpgkey | sudo apt-key add -
```

**Step 2. Install Packages**
Replace `16` with `15` or `14` if you prefer an older version.
```bash
sudo apt update
sudo apt install timescaledb-2-postgresql-15 postgresql-client-15 postgresql-15-postgis-3
```
*Note: `postgresql-15-postgis-3` adds spatial support which is required.*

**Step 3. Tune & Restart PostgreSQL**
```bash
# Initialize TimescaleDB configuration
sudo timescaledb-tune --quiet --yes

# Restart Service
sudo systemctl restart postgresql
```

**Step 4. Create User & Database**
```bash
# Switch to postgres user
sudo -i -u postgres

# Create a user (replacing 'roadroughness' and '123' with your secure credentials)
createuser --interactive --pwprompt
# Enter name: roadroughness
# Enter password: 123
# Shall the new role be a superuser? (y/n) y 
# (Superuser recommended for initial setup to create extensions easily)

# Create Database
createdb -O roadroughness road_roughness

# Exit postgres user shell
exit
```

**Step 5. Enable Extensions**
Log in to your new database:
```bash
psql "postgresql://roadroughness:123@localhost:5432/road_roughness"
```
Run the following SQL commands:
```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS postgis;
\q
```

## 2. Project Environment Setup

1.  **Clone/Upload Project**:
    Navigate to your project directory (e.g., `~/road-roughness-monitoring`).

2.  **Install Dependencies**:
    ```bash
    bun install
    ```

3.  **Setup Environment Variables**:
    Create a `.env` file:
    ```bash
    cp .env.example .env
    nano .env
    ```
    Update the `DATABASE_URL`:
    ```
    DATABASE_URL="postgresql://roadroughness:123@localhost:5432/road_roughness?schema=public"
    TCP_PORT=5027
    PORT=3010
    ```

## 3. Database Schema Migration

Run the Prisma migration to create tables. This also handles TimescaleDB hypertables if defined in the migration.

```bash
bunx prisma migrate dev --name init
```

*Note: Since PostGIS is required, ensure you ran the `CREATE EXTENSION postgis` command in step 1. If you forgot, run it now via psql.*

## 4. Build and Start (Production with PM2)

1.  **Install PM2**:
    ```bash
    bun add -g pm2
    ```

2.  **Start the Application**:
    ```bash
    pm2 start ecosystem.config.cjs
    ```

3.  **Monitor Logs**:
    ```bash
    pm2 logs
    ```

4.  **Save for Reboot**:
    ```bash
    pm2 save
    pm2 startup
    # Follow the on-screen command to enable startup script
    ```

## 5. Verification
Check that the server is listening:
```bash
curl http://localhost:3010/health
```
Send a test packet or use the debug endpoint if available.
