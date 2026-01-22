// Main app entry point - coordinates between views

import { RawTraceView } from './views/raw-trace.js';
import { HeatmapView } from './views/heatmap.js';
import { SegmentsView } from './views/segments.js';

// Initialize map
const map = L.map('map').setView([-6.34, 106.93], 15);

// Dark tile layer
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap, &copy; CARTO',
    maxZoom: 19
}).addTo(map);

// Views
const views = {
    trace: new RawTraceView(map),
    heatmap: new HeatmapView(map),
    segments: new SegmentsView(map)
};

let currentView = 'trace';

// Color utility
window.getRoughnessColor = function (roughness) {
    if (roughness < 100) return '#00ff88';
    if (roughness < 300) return '#ffeb3b';
    if (roughness < 500) return '#ff9800';
    return '#f44336';
};

window.getRoughnessClass = function (roughness) {
    if (roughness < 100) return 'roughness-smooth';
    if (roughness < 300) return 'roughness-light';
    if (roughness < 500) return 'roughness-moderate';
    return 'roughness-severe';
};

window.getRoughnessLabel = function (roughness) {
    if (roughness < 100) return 'Smooth';
    if (roughness < 300) return 'Light Bumps';
    if (roughness < 500) return 'Moderate';
    return 'Severe';
};

// Format timestamp
window.formatTime = function (timestamp) {
    return new Date(timestamp).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
};

// Get filter values
function getFilters() {
    return {
        truckId: document.getElementById('truckSelect').value,
        from: document.getElementById('fromDate').value,
        to: document.getElementById('toDate').value,
        minSpeed: document.getElementById('minSpeed').value || '3'
    };
}

// Load trucks dropdown
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

// Edit mode state
let editModeActive = false;

// Switch view
function switchView(viewName) {
    // Reset edit mode if switching away from segments
    if (editModeActive && currentView === 'segments') {
        views.segments.disableDrawMode();
        editModeActive = false;
        document.getElementById('editModeBtn').textContent = '✏️ Edit Mode';
        document.getElementById('editModeBtn').classList.remove('active');
    }

    // Clear all views
    Object.values(views).forEach(v => v.clear());

    // Update tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.view === viewName);
    });

    // Show/hide segment controls
    const segmentControls = document.getElementById('segmentControls');
    segmentControls.classList.toggle('hidden', viewName !== 'segments');

    // Hide segment info panel
    document.getElementById('segmentInfo').classList.add('hidden');

    currentView = viewName;

    // Auto-load data for new view
    loadData();
}

// Load data for current view
async function loadData() {
    const filters = getFilters();
    const btn = document.getElementById('loadBtn');
    btn.textContent = 'Loading...';
    btn.disabled = true;

    try {
        await views[currentView].load(filters);
    } catch (err) {
        console.error('Load error:', err);
        alert('Failed to load data: ' + err.message);
    } finally {
        btn.textContent = 'Load Data';
        btn.disabled = false;
    }
}

// Clear current view
function clearData() {
    views[currentView].clear();
    document.getElementById('totalPoints').textContent = '0';
    document.getElementById('avgRoughness').textContent = '0';
    document.getElementById('maxSpeed').textContent = '0';
}

// Generate segments
async function generateSegments() {
    if (!confirm('Generate segments from existing data points?')) return;

    const btn = document.getElementById('generateBtn');
    btn.textContent = 'Generating...';
    btn.disabled = true;

    try {
        const minSpeed = document.getElementById('minSpeed').value || '3';
        const response = await fetch('/api/segments/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ minSpeed: parseInt(minSpeed) })
        });

        const result = await response.json();
        alert(result.message || `Created ${result.segmentsCreated} segments`);

        // Reload segments view
        if (currentView === 'segments') {
            loadData();
        }
    } catch (err) {
        alert('Generation failed: ' + err.message);
    } finally {
        btn.textContent = '⚡ Generate Segments';
        btn.disabled = false;
    }
}

// Delete all generated segments
async function deleteAllGenerated() {
    if (!confirm('Delete ALL auto-generated segments? This cannot be undone.')) return;

    try {
        const response = await fetch('/api/segments/all/generated', { method: 'DELETE' });
        const result = await response.json();
        alert(`Deleted ${result.deleted} segments`);

        if (currentView === 'segments') {
            loadData();
        }
    } catch (err) {
        alert('Delete failed: ' + err.message);
    }
}

// Event listeners
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
});

document.getElementById('loadBtn').addEventListener('click', loadData);
document.getElementById('clearBtn').addEventListener('click', clearData);
document.getElementById('generateBtn').addEventListener('click', generateSegments);
document.getElementById('deleteAllBtn').addEventListener('click', deleteAllGenerated);

// Edit mode toggle button handler
document.getElementById('editModeBtn').addEventListener('click', () => {
    editModeActive = !editModeActive;
    const btn = document.getElementById('editModeBtn');

    if (editModeActive) {
        views.segments.enableDrawMode();
        btn.textContent = '✅ Exit Edit Mode';
        btn.classList.add('active');
    } else {
        views.segments.disableDrawMode();
        views.segments.load({}); // Reload to show normal view
        btn.textContent = '✏️ Edit Mode';
        btn.classList.remove('active');
    }
});

// Initialize
loadTrucks();
loadData();


