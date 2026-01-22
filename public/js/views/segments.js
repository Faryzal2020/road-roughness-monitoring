// Segments View - Road segments with roughness coloring and editing

export class SegmentsView {
    constructor(map) {
        this.map = map;
        this.layer = L.layerGroup().addTo(map);
        this.selectedSegment = null;
        this.segments = [];
    }

    async load(filters) {
        const response = await fetch('/api/segments');
        const segments = await response.json();

        if (segments.error) throw new Error(segments.error);

        this.segments = segments;
        this.display(segments);
    }

    display(segments) {
        this.clear();

        if (segments.length === 0) {
            // No segments yet - show message
            document.getElementById('totalPoints').textContent = '0';
            document.getElementById('avgRoughness').textContent = '-';
            document.getElementById('maxSpeed').textContent = '-';
            return;
        }

        // Update stats
        const totalPoints = segments.reduce((sum, s) => sum + (s.pointCount || 0), 0);
        const validSegments = segments.filter(s => s.avgRoughness !== null);
        const avgRoughness = validSegments.length > 0
            ? Math.round(validSegments.reduce((sum, s) => sum + s.avgRoughness, 0) / validSegments.length)
            : 0;

        document.getElementById('totalPoints').textContent = segments.length + ' segments';
        document.getElementById('avgRoughness').textContent = avgRoughness;
        document.getElementById('maxSpeed').textContent = totalPoints + ' pts';

        let allBounds = [];

        segments.forEach(segment => {
            const geometry = segment.geometryJson;
            if (!geometry || !geometry.coordinates || geometry.coordinates.length < 2) return;

            const coords = geometry.coordinates.map(c => [c[1], c[0]]); // [lat, lon]
            allBounds = allBounds.concat(coords);

            const color = segment.avgRoughness !== null
                ? getRoughnessColor(segment.avgRoughness)
                : '#888';

            const polyline = L.polyline(coords, {
                color: color,
                weight: 8,
                opacity: 0.9
            }).addTo(this.layer);

            // Click to select
            polyline.on('click', () => this.selectSegment(segment, polyline));

            // Popup
            polyline.bindPopup(`
                <div class="popup-content">
                    <strong>Segment #${segment.id}</strong><br>
                    <strong>Road:</strong> ${segment.roadName || 'Unknown'}<br>
                    <strong>Length:</strong> ${Math.round(segment.lengthMeters || 0)}m<br>
                    <strong>Points:</strong> ${segment.pointCount || 0}<br>
                    ${segment.avgRoughness !== null ? `
                        <div class="roughness-value ${getRoughnessClass(segment.avgRoughness)}">
                            ${getRoughnessLabel(segment.avgRoughness)}: ${segment.avgRoughness}
                        </div>
                    ` : '<em>No roughness data</em>'}
                </div>
            `);
        });

        // Fit bounds
        if (allBounds.length > 0) {
            this.map.fitBounds(allBounds, { padding: [50, 50] });
        }
    }

    selectSegment(segment, polyline) {
        // Deselect previous
        if (this.selectedPolyline) {
            this.selectedPolyline.setStyle({ weight: 8 });
        }

        this.selectedSegment = segment;
        this.selectedPolyline = polyline;
        polyline.setStyle({ weight: 12 });

        // Show info panel
        const panel = document.getElementById('segmentInfo');
        panel.classList.remove('hidden');

        document.getElementById('segmentDetails').innerHTML = `
            <p><strong>ID:</strong> ${segment.id}</p>
            <p><strong>Road:</strong> ${segment.roadName || 'Unknown'}</p>
            <p><strong>Length:</strong> ${Math.round(segment.lengthMeters || 0)}m</p>
            <p><strong>Points:</strong> ${segment.pointCount || 0}</p>
            <p><strong>Roughness:</strong> ${segment.avgRoughness ?? 'N/A'}</p>
        `;

        // Delete handler
        document.getElementById('deleteSegmentBtn').onclick = () => this.deleteSegment(segment.id);
    }

    async deleteSegment(id) {
        if (!confirm(`Delete segment #${id}?`)) return;

        try {
            const response = await fetch(`/api/segments/${id}`, { method: 'DELETE' });
            const result = await response.json();

            if (result.success) {
                // Remove from display
                if (this.selectedPolyline) {
                    this.layer.removeLayer(this.selectedPolyline);
                }
                document.getElementById('segmentInfo').classList.add('hidden');
                this.selectedSegment = null;
                this.selectedPolyline = null;

                // Reload
                this.load({});
            }
        } catch (err) {
            alert('Delete failed: ' + err.message);
        }
    }

    clear() {
        this.layer.clearLayers();
        this.selectedSegment = null;
        this.selectedPolyline = null;
        document.getElementById('segmentInfo').classList.add('hidden');
    }
}
