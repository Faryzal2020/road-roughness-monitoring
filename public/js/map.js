// Initialize map
const map = L.map('map').setView([-6.34, 106.93], 15);

// Dark tile layer
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap, &copy; CARTO',
    maxZoom: 19
}).addTo(map);

// Layer groups
let routeLayer = L.layerGroup().addTo(map);
let markersLayer = L.layerGroup().addTo(map);

// Color thresholds
function getRoughnessColor(roughness) {
    if (roughness < 100) return '#00ff88';      // Smooth - Green
    if (roughness < 300) return '#ffeb3b';      // Light bumps - Yellow
    if (roughness < 500) return '#ff9800';      // Moderate - Orange
    return '#f44336';                            // Severe - Red
}

function getRoughnessClass(roughness) {
    if (roughness < 100) return 'roughness-smooth';
    if (roughness < 300) return 'roughness-light';
    if (roughness < 500) return 'roughness-moderate';
    return 'roughness-severe';
}

function getRoughnessLabel(roughness) {
    if (roughness < 100) return 'Smooth';
    if (roughness < 300) return 'Light Bumps';
    if (roughness < 500) return 'Moderate';
    return 'Severe';
}

// Format timestamp
function formatTime(timestamp) {
    return new Date(timestamp).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// Load trucks for dropdown
async function loadTrucks() {
    try {
        const response = await fetch('/api/map/trucks');
        const trucks = await response.json();

        const select = document.getElementById('truckSelect');
        trucks.forEach(truck => {
            const option = document.createElement('option');
            option.value = truck.id;
            option.textContent = `${truck.truckId} (${truck.imei})`;
            select.appendChild(option);
        });
    } catch (err) {
        console.error('Failed to load trucks:', err);
    }
}

// Load telemetry data
async function loadTelemetry() {
    const truckId = document.getElementById('truckSelect').value;
    const fromDate = document.getElementById('fromDate').value;
    const toDate = document.getElementById('toDate').value;

    const params = new URLSearchParams();
    if (truckId) params.append('truckId', truckId);
    if (fromDate) params.append('from', new Date(fromDate).toISOString());
    if (toDate) params.append('to', new Date(toDate).toISOString());
    params.append('movingOnly', 'true');
    params.append('limit', '5000');

    try {
        document.getElementById('loadBtn').textContent = 'Loading...';

        const response = await fetch(`/api/map/telemetry?${params}`);
        const result = await response.json();

        if (result.error) {
            alert('Error: ' + result.error);
            return;
        }

        displayData(result);

    } catch (err) {
        console.error('Failed to load telemetry:', err);
        alert('Failed to load data: ' + err.message);
    } finally {
        document.getElementById('loadBtn').textContent = 'Load Data';
    }
}

// Display data on map
function displayData(result) {
    // Clear existing layers
    routeLayer.clearLayers();
    markersLayer.clearLayers();

    const data = result.data;

    if (data.length === 0) {
        alert('No data found for the selected filters');
        return;
    }

    // Update stats
    document.getElementById('totalPoints').textContent = data.length;
    document.getElementById('avgRoughness').textContent = Math.round(
        data.reduce((sum, d) => sum + d.roughness, 0) / data.length
    );
    document.getElementById('maxSpeed').textContent = Math.max(...data.map(d => d.speed)) + ' km/h';

    // Draw route segments with color coding
    for (let i = 0; i < data.length - 1; i++) {
        const start = data[i];
        const end = data[i + 1];

        // Skip if points are too far apart (likely GPS jump)
        const distance = Math.sqrt(
            Math.pow(end.lat - start.lat, 2) +
            Math.pow(end.lon - start.lon, 2)
        );
        if (distance > 0.001) continue; // ~100m threshold

        const color = getRoughnessColor(start.roughness);

        const polyline = L.polyline([
            [start.lat, start.lon],
            [end.lat, end.lon]
        ], {
            color: color,
            weight: 5,
            opacity: 0.9
        }).addTo(routeLayer);
    }

    // Add circle markers for each point
    data.forEach(point => {
        const color = getRoughnessColor(point.roughness);

        const circle = L.circleMarker([point.lat, point.lon], {
            radius: 4,
            fillColor: color,
            color: '#fff',
            weight: 1,
            fillOpacity: 0.8
        }).addTo(markersLayer);

        // Popup content
        const popupContent = `
            <div class="popup-content">
                <strong>Time:</strong> ${formatTime(point.timestamp)}<br>
                <strong>Speed:</strong> ${point.speed} km/h<br>
                <strong>Heading:</strong> ${point.heading || 'N/A'}°<br>
                <strong>Accelerometer:</strong><br>
                &nbsp;&nbsp;X: ${point.axisX} mG<br>
                &nbsp;&nbsp;Y: ${point.axisY} mG<br>
                &nbsp;&nbsp;Z: ${point.axisZ} mG<br>
                <div class="roughness-value ${getRoughnessClass(point.roughness)}">
                    ${getRoughnessLabel(point.roughness)}: ${point.roughness}
                </div>
            </div>
        `;

        circle.bindPopup(popupContent);
    });

    // Fit map to bounds
    if (result.bounds) {
        map.fitBounds([
            [result.bounds.minLat, result.bounds.minLon],
            [result.bounds.maxLat, result.bounds.maxLon]
        ], { padding: [50, 50] });
    }
}

// Clear map
function clearMap() {
    routeLayer.clearLayers();
    markersLayer.clearLayers();
    document.getElementById('totalPoints').textContent = '0';
    document.getElementById('avgRoughness').textContent = '0';
    document.getElementById('maxSpeed').textContent = '0';
}

// Event listeners
document.getElementById('loadBtn').addEventListener('click', loadTelemetry);
document.getElementById('clearBtn').addEventListener('click', clearMap);

// Initialize
loadTrucks();

// Auto-load data on page load
loadTelemetry();
