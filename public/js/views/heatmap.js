// Heatmap View - Grid-based aggregated roughness

export class HeatmapView {
    constructor(map) {
        this.map = map;
        this.layer = L.layerGroup().addTo(map);
    }

    async load(filters) {
        const params = new URLSearchParams();
        params.append('gridSize', '10'); // 10 meter grid
        params.append('minSpeed', filters.minSpeed || '3');

        const response = await fetch(`/api/map/heatmap?${params}`);
        const result = await response.json();

        if (result.error) throw new Error(result.error);

        this.display(result);
    }

    display(result) {
        this.clear();

        const cells = result.cells;
        if (cells.length === 0) {
            alert('No heatmap data available');
            return;
        }

        // Update stats
        document.getElementById('totalPoints').textContent = cells.reduce((sum, c) => sum + c.pointCount, 0);
        document.getElementById('avgRoughness').textContent = Math.round(
            cells.reduce((sum, c) => sum + c.avgRoughness * c.pointCount, 0) /
            cells.reduce((sum, c) => sum + c.pointCount, 0)
        ) || 0;
        document.getElementById('maxSpeed').textContent = '-';

        // Draw grid cells as rectangles
        const gridSize = result.cells[0]?.gridSize || 0.00009;

        cells.forEach(cell => {
            const color = getRoughnessColor(cell.avgRoughness);

            const bounds = [
                [cell.lat - gridSize / 2, cell.lon - gridSize / 2],
                [cell.lat + gridSize / 2, cell.lon + gridSize / 2]
            ];

            const rect = L.rectangle(bounds, {
                color: color,
                weight: 1,
                fillColor: color,
                fillOpacity: 0.6
            }).addTo(this.layer);

            rect.bindPopup(`
                <div class="popup-content">
                    <strong>Grid Cell</strong><br>
                    <strong>Points:</strong> ${cell.pointCount}<br>
                    <strong>Avg Roughness:</strong> ${cell.avgRoughness}<br>
                    <strong>Max Roughness:</strong> ${cell.maxRoughness}<br>
                    <div class="roughness-value ${getRoughnessClass(cell.avgRoughness)}">
                        ${getRoughnessLabel(cell.avgRoughness)}
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
        this.layer.clearLayers();
    }
}
