// Raw Trace View - Shows individual data points as circles

export class RawTraceView {
    constructor(map) {
        this.map = map;
        this.routeLayer = L.layerGroup().addTo(map);
        this.markersLayer = L.layerGroup().addTo(map);
    }

    async load(filters) {
        const params = new URLSearchParams();
        if (filters.truckId) params.append('truckId', filters.truckId);
        if (filters.from) params.append('from', new Date(filters.from).toISOString());
        if (filters.to) params.append('to', new Date(filters.to).toISOString());
        params.append('movingOnly', 'true');
        params.append('limit', '5000');

        const response = await fetch(`/api/map/telemetry?${params}`);
        const result = await response.json();

        if (result.error) throw new Error(result.error);

        this.display(result);
    }

    display(result) {
        this.clear();

        const data = result.data;
        if (data.length === 0) {
            alert('No data found for the selected filters');
            return;
        }

        // Filter by min speed
        const minSpeed = parseInt(document.getElementById('minSpeed').value) || 0;
        const filtered = data.filter(d => d.speed >= minSpeed);

        // Update stats
        document.getElementById('totalPoints').textContent = filtered.length;
        document.getElementById('avgRoughness').textContent = Math.round(
            filtered.reduce((sum, d) => sum + d.roughness, 0) / filtered.length
        ) || 0;
        document.getElementById('maxSpeed').textContent = Math.max(...filtered.map(d => d.speed)) + ' km/h';

        // Draw route segments with color coding
        for (let i = 0; i < filtered.length - 1; i++) {
            const start = filtered[i];
            const end = filtered[i + 1];

            // Skip if points are too far apart (likely GPS jump)
            const distance = Math.sqrt(
                Math.pow(end.lat - start.lat, 2) +
                Math.pow(end.lon - start.lon, 2)
            );
            if (distance > 0.001) continue; // ~100m threshold

            const color = getRoughnessColor(start.roughness);

            L.polyline([
                [start.lat, start.lon],
                [end.lat, end.lon]
            ], {
                color: color,
                weight: 5,
                opacity: 0.9
            }).addTo(this.routeLayer);
        }

        // Add circle markers
        filtered.forEach(point => {
            const color = getRoughnessColor(point.roughness);

            const circle = L.circleMarker([point.lat, point.lon], {
                radius: 4,
                fillColor: color,
                color: '#fff',
                weight: 1,
                fillOpacity: 0.8
            }).addTo(this.markersLayer);

            circle.bindPopup(`
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
            `);
        });

        // Fit bounds
        if (result.bounds) {
            this.map.fitBounds([
                [result.bounds.minLat, result.bounds.minLon],
                [result.bounds.maxLat, result.bounds.maxLon]
            ], { padding: [50, 50] });
        }
    }

    clear() {
        this.routeLayer.clearLayers();
        this.markersLayer.clearLayers();
    }
}
