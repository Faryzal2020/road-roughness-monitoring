// Segments View - Road segments with roughness coloring and drawing/editing

export class SegmentsView {
    constructor(map) {
        this.map = map;
        this.layer = L.layerGroup().addTo(map);
        this.drawLayer = new L.FeatureGroup().addTo(map);
        this.selectedSegment = null;
        this.segments = [];
        this.drawControl = null;
        this.isDrawMode = false;

        this.initDrawControl();
    }

    initDrawControl() {
        // Initialize Leaflet Draw control
        this.drawControl = new L.Control.Draw({
            position: 'topright',
            draw: {
                polyline: {
                    shapeOptions: {
                        color: '#00d9ff',
                        weight: 6
                    },
                    metric: true,
                    showLength: true
                },
                polygon: false,
                circle: false,
                rectangle: false,
                marker: false,
                circlemarker: false
            },
            edit: {
                featureGroup: this.drawLayer,
                edit: true,
                remove: true
            }
        });

        // Handle draw created event
        this.map.on(L.Draw.Event.CREATED, async (e) => {
            const layer = e.layer;
            const coords = layer.getLatLngs().map(latlng => [latlng.lng, latlng.lat]);

            if (coords.length < 2) {
                alert('Need at least 2 points');
                return;
            }

            // Prompt for road name
            const roadName = prompt('Enter road name for this segment:', 'New Road');
            if (roadName === null) return; // Cancelled

            // Save to database
            await this.createSegment(coords, roadName);
        });

        // Handle edit event
        this.map.on(L.Draw.Event.EDITED, async (e) => {
            const layers = e.layers;
            layers.eachLayer(async (layer) => {
                if (layer.segmentId) {
                    const coords = layer.getLatLngs().map(latlng => [latlng.lng, latlng.lat]);
                    await this.updateSegment(layer.segmentId, coords);
                }
            });
        });

        // Handle delete event
        this.map.on(L.Draw.Event.DELETED, async (e) => {
            const layers = e.layers;
            layers.eachLayer(async (layer) => {
                if (layer.segmentId) {
                    await this.deleteSegmentById(layer.segmentId);
                }
            });
        });
    }

    enableDrawMode() {
        if (!this.isDrawMode) {
            this.map.addControl(this.drawControl);
            this.isDrawMode = true;
            this.moveSegmentsToDrawLayer();
        }
    }

    disableDrawMode() {
        if (this.isDrawMode) {
            this.map.removeControl(this.drawControl);
            this.isDrawMode = false;
        }
    }

    moveSegmentsToDrawLayer() {
        // Move existing segments to editable layer
        this.drawLayer.clearLayers();

        this.segments.forEach(segment => {
            const geometry = segment.geometryJson;
            if (!geometry || !geometry.coordinates || geometry.coordinates.length < 2) return;

            const coords = geometry.coordinates.map(c => [c[1], c[0]]); // [lat, lon]

            const color = segment.avgRoughness !== null
                ? getRoughnessColor(segment.avgRoughness)
                : '#888';

            const polyline = L.polyline(coords, {
                color: color,
                weight: 8,
                opacity: 0.9
            });

            polyline.segmentId = segment.id;
            polyline.bindPopup(`Segment #${segment.id} - ${segment.roadName || 'Unknown'}`);

            this.drawLayer.addLayer(polyline);
        });
    }

    async createSegment(coords, roadName) {
        try {
            const response = await fetch('/api/segments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ geometry: coords, roadName })
            });

            const result = await response.json();
            if (result.error) throw new Error(result.error);

            // Reload segments
            await this.load({});

        } catch (err) {
            alert('Failed to create segment: ' + err.message);
        }
    }

    async updateSegment(id, coords) {
        try {
            const response = await fetch(`/api/segments/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ geometry: coords })
            });

            const result = await response.json();
            if (result.error) throw new Error(result.error);

        } catch (err) {
            alert('Failed to update segment: ' + err.message);
        }
    }

    async deleteSegmentById(id) {
        try {
            await fetch(`/api/segments/${id}`, { method: 'DELETE' });
        } catch (err) {
            console.error('Delete failed:', err);
        }
    }

    async load(filters) {
        const response = await fetch('/api/segments');
        const segments = await response.json();

        if (segments.error) throw new Error(segments.error);

        this.segments = segments;

        // If in draw mode, update the draw layer
        if (this.isDrawMode) {
            this.moveSegmentsToDrawLayer();
        } else {
            this.display(segments);
        }
    }

    display(segments) {
        this.layer.clearLayers();

        if (segments.length === 0) {
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
            polyline.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                this.selectSegment(segment, polyline);
            });

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
                if (this.selectedPolyline) {
                    this.layer.removeLayer(this.selectedPolyline);
                }
                document.getElementById('segmentInfo').classList.add('hidden');
                this.selectedSegment = null;
                this.selectedPolyline = null;

                await this.load({});
            }
        } catch (err) {
            alert('Delete failed: ' + err.message);
        }
    }

    clear() {
        this.layer.clearLayers();
        this.drawLayer.clearLayers();
        this.disableDrawMode();
        this.selectedSegment = null;
        this.selectedPolyline = null;
        document.getElementById('segmentInfo').classList.add('hidden');
    }
}
