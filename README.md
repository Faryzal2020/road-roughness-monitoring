# Road Roughness Monitoring

Road roughness monitoring system using Teltonika telemetry data.

## Requirements

- **Runtime**: [Bun](https://bun.sh) (v1.0+)
- **Database**: PostgreSQL (v15+) with **TimescaleDB** and **PostGIS** extensions.

## Setup & Running

### Windows

1.  **Install Bun**:
    Open PowerShell and run:
    ```powershell
    powershell -c "irm bun.sh/install.ps1 | iex"
    ```

2.  **Setup Database (Docker Recommended)**:
    It is highly recommended to use Docker for the database on Windows to easily get TimescaleDB and PostGIS.
    ```powershell
    docker run -d --name road-roughness-db -p 5432:5432 -e POSTGRES_PASSWORD=password -e POSTGRES_DB=road_roughness timescale/timescaledb-ha:pg15
    ```
    *Note: Ensure Docker Desktop is running.*

3.  **Install Dependencies**:
    ```bash
    bun install
    ```

4.  **Configuration**:
    Create a `.env` file from the example:
    ```powershell
    copy .env.example .env
    ```
    Update `.env` `DATABASE_URL` if you changed the password (default in example matches the Docker command above):
    ```env
    DATABASE_URL="postgresql://postgres:password@localhost:5432/road_roughness?schema=public"
    ```

5.  **Initialize Database**:
    ```bash
    bunx prisma migrate dev --name init
    ```

6.  **Run the App**:
    ```bash
    bun run index.js
    ```

### Linux (Ubuntu/Debian)

1.  **Install Bun**:
    ```bash
    curl -fsSL https://bun.sh/install | bash
    source ~/.bashrc
    ```

2.  **Setup Database**:
    You need PostgreSQL 15, TimescaleDB, and PostGIS.
    See `setup.md` for detailed step-by-step installation instructions for Linux/Ubuntu.

    *Quick summary for Ubuntu (requires adding TimescaleDB & Postgres repos first):*
    ```bash
    # Install packages
    sudo apt install timescaledb-2-postgresql-15 postgresql-15-postgis-3
    
    # Tune and Restart
    sudo timescaledb-tune --yes
    sudo systemctl restart postgresql
    
    # Create DB and User (example)
    sudo -u postgres createuser --interactive --pwprompt
    sudo -u postgres createdb -O <your_user> road_roughness
    
    # Enable extensions is handled by Prisma migration, but DB user needs superuser or explicit permissions.
    ```

3.  **Install Dependencies**:
    ```bash
    bun install
    ```

4.  **Configuration**:
    ```bash
    cp .env.example .env
    nano .env
    ```

5.  **Initialize Database**:
    ```bash
    bunx prisma migrate dev --name init
    ```

6.  **Run the App**:
    ```bash
    bun run index.js
    ```
