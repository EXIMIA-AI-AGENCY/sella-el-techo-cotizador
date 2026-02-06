console.log("🚀 map_logic.js is parsing...");
let map;
let drawingManager;
let currentPolygon = null;

// Expose vital functions globally (Hoisting allows this)
window.useCurrentLocation = useCurrentLocation;
window.initMap = initMap;

// Global Pricing Constants (defaults, overridden by backend via window.PRICING)
const CONSTANTS = {
    get WASTE_FACTOR() { return window.PRICING ? window.PRICING.waste_factor : 1.15; },
    get PRICE_SQFT() { return window.PRICING ? window.PRICING.silicona : 4.50; },
    get TAX_RATE() { return window.PRICING ? window.PRICING.tax_rate : 0.115; }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Bind Address Input Autocomplete
    const input = document.getElementById("addressInput");
    if (input) {
        // ... (existing autocomplete logic usually here or initMap)
    }

    // Bind Use Location Button
    const btnUseLoc = document.getElementById("btnUseLocation");
    if (btnUseLoc) {
        btnUseLoc.addEventListener("click", () => {
            console.log("📍 Button Clicked (Event Listener)");
            useCurrentLocation();
        });
    } else {
        console.error("❌ 'Use My Location' button not found in DOM");
    }
});

function initMap() {
    // 1. Initialize Map centered on Puerto Rico
    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 18.2208, lng: -66.5901 },
        zoom: 9,
        mapTypeId: "satellite",
        tilt: 0,
        fullscreenControl: false,
        streetViewControl: false,
        mapTypeControl: false,
        gestureHandling: "greedy", // Fix for "cannot move mouse well" - grabs all events
        zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM }
    });

    // Expose map globally for resize triggers
    window.map = map;

    // 2. Initialize Autocomplete
    initAutocomplete();

    // 3. Initialize Drawing Manager
    initDrawingManager();

    // 4. Click Listener for Auto-Detect
    map.addListener("click", (e) => {
        // GUARD: If drawing manual, ignore click (let DrawingManager handle it)
        if (drawingManager && drawingManager.getDrawingMode() !== null) return;

        console.log("Map Clicked at:", e.latLng.toString());
        // alert("Click en el mapa detectado. Buscando datos..."); // Debug Alert

        // Visual feedback
        new google.maps.Marker({
            position: e.latLng,
            map: map,
            title: "Punto Seleccionado"
        });

        fetchSolarData(e.latLng.lat(), e.latLng.lng());
    });
}

function initAutocomplete() {
    const input = document.getElementById("addressInput");
    const options = {
        componentRestrictions: { country: "pr" },
        fields: ["geometry", "name"],
        strictBounds: false,
    };

    const autocomplete = new google.maps.places.Autocomplete(input, options);
    autocomplete.bindTo("bounds", map);

    autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();

        if (!place.geometry || !place.geometry.location) {
            alert("No details available for input: '" + place.name + "'");
            return;
        }

        // Save location for Step 2 recenter
        window.mapCenter = place.geometry.location;

        // Enable 'Next' button on Step 1 implicitly by validating input length
        document.getElementById("addressInput").dispatchEvent(new Event('input'));

        // TRIGGER SOLAR API AUTOMATICALLY
        console.log("Autocomplete triggered. Fetching Solar Data...");
        fetchSolarData(place.geometry.location.lat(), place.geometry.location.lng());
    });
}

function useCurrentLocation() {
    try {
        console.log("📍 Button Clicked: Starting Geolocation...");

        if (!navigator.geolocation) {
            alert("Tu navegador no soporta geolocalización.");
            return;
        }

        const btn = document.querySelector("button[onclick='useCurrentLocation()']") || document.getElementById('btnUseLocation');
        let originalText = "📍 Usar mi ubicación";
        if (btn) {
            originalText = btn.innerText;
            btn.innerText = "⏳ Buscando...";
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const pos = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                };

                console.log("📍 Location Found:", pos);

                // 1. Save Center
                window.mapCenter = pos;

                // 2. Reverse Geocode to get address text
                const geocoder = new google.maps.Geocoder();
                geocoder.geocode({ location: pos }, (results, status) => {
                    if (status === "OK" && results[0]) {
                        const addrInput = document.getElementById("addressInput");
                        if (addrInput) addrInput.value = results[0].formatted_address;

                        const nextBtn = document.getElementById("btnNext");
                        if (nextBtn) nextBtn.disabled = false;

                        // AUTO-ADVANCE: Set map view and jump
                        if (window.map) {
                            window.map.setCenter(pos);
                            window.map.setZoom(21);
                            window.map.setHeading(0);
                            window.map.setTilt(45);
                        }
                        if (window.changeStep) window.changeStep(1);

                        // TRIGGER SOLAR API
                        fetchSolarData(pos.lat, pos.lng);

                    } else {
                        const addrInput = document.getElementById("addressInput");
                        if (addrInput) addrInput.value = "Ubicación detectada (Lat: " + pos.lat.toFixed(4) + ")";
                    }
                    if (btn) btn.innerText = originalText;
                });
            },
            (error) => {
                console.error("Geolocation Error:", error);
                let errorMsg = "No pudimos detectar tu ubicación.";
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        errorMsg = "❌ Denegaste el permiso de ubicación. Actívalo en el navegador.";
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMsg = "❌ La información de ubicación no está disponible.";
                        break;
                    case error.TIMEOUT:
                        errorMsg = "❌ Tiempo de espera agotado al buscar ubicación.";
                        break;
                    default:
                        errorMsg = "❌ Error desconocido al ubicarte.";
                        break;
                }
                alert(errorMsg);
                if (btn) btn.innerText = originalText;
            }
        );
    } catch (e) {
        alert("Error crítico en geolocalización: " + e.message);
        console.error(e);
    }
}
window.useCurrentLocation = useCurrentLocation;

// SOLAR API INTEGRATION
// SOLAR API INTEGRATION (Modified for Local CV)
// SOLAR API INTEGRATION (Prioritized: Google -> Local -> Sim)
async function fetchSolarData(lat, lng) {
    const areaLabel = document.getElementById('liveArea');
    if (areaLabel) areaLabel.innerText = "Analizando...";

    // 1. TRY GOOGLE SOLAR API (The "Real" Auto-Mapping)
    // ----------------------------------------------------------------
    // INSTRUCTIONS: To enable Google Solar, paste your API Key here.
    // It must have "Solar API" enabled in Google Cloud Console.
    const googleApiKey = "AIzaSyBR72tWGSonQu3eMgfcEUZdDiAcqaQ_bhA"; // <--- PASTE KEY HERE
    // ----------------------------------------------------------------

    try {
        if (!googleApiKey || googleApiKey.length < 10) throw new Error("No Google Key Configured");

        const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&requiredQuality=HIGH&key=${googleApiKey}`;

        console.log("Calling Google Solar API...");
        const response = await fetch(url);

        // If 403/400, key is invalid or quota exceeded
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Google API Failed (${response.status}): ${errText}`);
        }

        const data = await response.json();

        if (data.solarPotential && data.solarPotential.wholeRoofStats) {
            console.log("✅ Google Solar Success!", data);

            // A. Get Area Stats
            const areaM2 = data.solarPotential.wholeRoofStats.areaMeters2;
            const areaSqFt = areaM2 * 10.7639;

            // B. Draw Roof (Polygon) - Detailed Segments
            // Google Solar returns segments. We will draw ALL of them to form the shape.

            if (currentPolygon) currentPolygon.setMap(null); // Clear main

            // Clear any previous segments if we stored them (we might need a global array for this)
            if (window.roofSegments) {
                window.roofSegments.forEach(s => s.setMap(null));
            }
            window.roofSegments = [];

            const segments = data.solarPotential.roofSegmentStats || [];
            if (segments.length > 0) {
                console.log("Drawing " + segments.length + " segments...");

                segments.forEach(seg => {
                    const sBox = seg.boundingBox;
                    const segPoly = new google.maps.Rectangle({
                        strokeColor: "#00FF00",
                        strokeOpacity: 0.8,
                        strokeWeight: 2,
                        fillColor: "#00FF00",
                        fillOpacity: 0.4,
                        map: window.map,
                        bounds: {
                            north: sBox.ne.latitude,
                            south: sBox.sw.latitude,
                            east: sBox.ne.longitude,
                            west: sBox.sw.longitude
                        },
                        clickable: false // Let clicks pass through or handle separately
                    });
                    window.roofSegments.push(segPoly);
                });

                // Create a main transparent "Interaction" box for area calculation/dragging
                // Or just use the main bounding box for user adjustments
                const totalBox = data.solarPotential.wholeRoofStats.boundingBox;
                currentPolygon = new google.maps.Rectangle({
                    strokeColor: "#FFFFFF",
                    strokeOpacity: 0.5,
                    strokeWeight: 2,
                    fillColor: "#000000",
                    fillOpacity: 0.0, // Transparent, just for bounds
                    map: window.map,
                    bounds: {
                        north: totalBox.ne.latitude,
                        south: totalBox.sw.latitude,
                        east: totalBox.ne.longitude,
                        west: totalBox.sw.longitude
                    },
                    editable: true,
                    draggable: true
                });

            } else {
                // Fallback to single box if no segments
                const box = data.solarPotential.wholeRoofStats.boundingBox;
                currentPolygon = new google.maps.Rectangle({
                    strokeColor: "#00FF00",
                    strokeOpacity: 0.8,
                    strokeWeight: 3,
                    fillColor: "#00FF00",
                    fillOpacity: 0.3,
                    map: window.map,
                    bounds: {
                        north: box.ne.latitude,
                        south: box.sw.latitude,
                        east: box.ne.longitude,
                        west: box.sw.longitude
                    },
                    editable: true,
                    draggable: true
                });
            }

            // Listener for the Main Box (currentPolygon)
            currentPolygon.addListener("bounds_changed", () => {
                const ne = currentPolygon.getBounds().getNorthEast();
                const sw = currentPolygon.getBounds().getSouthWest();
                const height = google.maps.geometry.spherical.computeDistanceBetween(ne, { lat: ne.lat(), lng: sw.lng() });
                const width = google.maps.geometry.spherical.computeDistanceBetween(ne, { lat: sw.lat(), lng: ne.lng() });
                const newArea = (height * width) * 10.7639;
                if (window.updateAreaState) window.updateAreaState(newArea);
            });

            // Calculate Precision Stats
            if (window.updateAreaState) {
                // Approximate complexity by segment count
                // More physics-based waste factor
                // e.g. if many segments, higher waste
                const wasteFactor = segments.length > 4 ? 1.15 : 1.10;

                const stats = {
                    geometric: Math.round(areaSqFt),
                    waste_factor: wasteFactor,
                    material_needed: Math.round(areaSqFt * wasteFactor),
                    complexity_score: segments.length
                };

                window.updateAreaState(stats.geometric, stats);
                alert(`✅ Techo Detectado (Google Solar)\n\nSe trazaron ${segments.length} secciones del techo.`);
            }

            // Fit map nicely
            if (currentPolygon) window.map.fitBounds(currentPolygon.getBounds());

            return; // EXIT SUCCESS
        }

    } catch (googleError) {
        console.warn("Google Solar API unavailable (Reason: " + googleError.message + "). Trying Local AI...");
    }

    // 2. TRY LOCAL BACKEND (CV Auto-Trace)
    // ----------------------------------------------------------------
    try {
        const localUrl = `http://localhost:8000/segment?lat=${lat}&lng=${lng}`;
        console.log("Calling Local CV Backend...");
        const response = await fetch(localUrl).catch(e => { throw new Error("Local Server Off"); });

        if (!response.ok) throw new Error("Local Backend Failed");

        const data = await response.json();

        if (data.roofSegmentStats && data.roofSegmentStats.length > 0) {
            console.log("✅ Local CV Success!", data);

            const polyCoords = data.roofSegmentStats[0].boundingPolygon;

            if (currentPolygon) currentPolygon.setMap(null);

            currentPolygon = new google.maps.Polygon({
                paths: polyCoords,
                strokeColor: "#00FF00",
                strokeOpacity: 0.8,
                strokeWeight: 3,
                fillColor: "#00FF00",
                fillOpacity: 0.3,
                map: window.map,
                editable: true,
                draggable: true
            });

            // Calculate Area
            const areaM2 = google.maps.geometry.spherical.computeArea(currentPolygon.getPath());
            const areaSqFt = areaM2 * 10.7639;

            if (window.updateAreaState) window.updateAreaState(areaSqFt);
            alert("✅ Techo Detectado (Local AI)");
            return; // EXIT SUCCESS

        }
    } catch (localError) {
        console.warn("Local Smart Trace failed:", localError);
    }

    // 3. FALLBACK: MANUAL PROMPT
    // ----------------------------------------------------------------
    console.warn("All auto-methods failed. User must draw manually.");
    alert("⚠️ No pudimos detectar el techo en este punto.\n\nPor favor usa el botón '✏️ Dibujar Manual' para trazarlo tú mismo.");
    window.toggleManualMode(true);
    // Helper: Simulation REMOVED per user request
    // If API fails, better to let user draw manually than show a random box.
}

let manualMode = false; // Global state for manual drawing

function initDrawingManager() {
    // Helper to toggle mode
    window.toggleManualMode = function (forceManual) {
        manualMode = forceManual !== undefined ? forceManual : !manualMode;

        const btn = document.getElementById('btnManual');

        if (manualMode) {
            // Activate Drawing
            window.drawingManager.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
            window.drawingManager.setOptions({
                drawingControl: true
            });
            // Clear existing
            if (currentPolygon) currentPolygon.setMap(null);
            if (window.roofSegments) window.roofSegments.forEach(s => s.setMap(null));
        } else {
            // Deactivate
            window.drawingManager.setDrawingMode(null);
            window.drawingManager.setOptions({
                drawingControl: false
            });
        }

        // Update Button UI
        if (btn) {
            if (manualMode) {
                btn.className = 'btn btn-sm btn-primary';
                btn.innerText = '👆 Volver a Auto';
            } else {
                btn.className = 'btn btn-sm btn-outline-secondary';
                btn.innerText = '✏️ Dibujar Manual';
            }
        }
    };

    window.drawingManager = new google.maps.drawing.DrawingManager({
        drawingMode: null, // Start disabled
        drawingControl: false,
        drawingControlOptions: {
            position: google.maps.ControlPosition.TOP_CENTER,
            drawingModes: [google.maps.drawing.OverlayType.POLYGON],
        },
        polygonOptions: {
            fillColor: "#00FF00",
            fillOpacity: 0.3,
            strokeWeight: 2,
            editable: true,
            draggable: true
        }
    });

    window.drawingManager.setMap(window.map);

    // Event: When polygon is complete
    google.maps.event.addListener(window.drawingManager, 'overlaycomplete', function (event) {
        if (event.type === 'polygon') {
            // Remove previous
            if (currentPolygon) currentPolygon.setMap(null);
            if (window.roofSegments) window.roofSegments.forEach(s => s.setMap(null));

            currentPolygon = event.overlay;

            // Add listener to new polygon
            currentPolygon.getPath().addListener("set_at", updateAreaFromPolygon);
            currentPolygon.getPath().addListener("insert_at", updateAreaFromPolygon);

            // Initial calc
            updateAreaFromPolygon();

            // Switch back to "Auto" UI state but keep the polygon
            // manualMode = false; 
            // window.drawingManager.setDrawingMode(null);
            // window.toggleManualMode(false); 
        }
    });
}

function updateAreaFromPolygon() {
    if (!currentPolygon) return;
    const areaM2 = google.maps.geometry.spherical.computeArea(currentPolygon.getPath());
    const areaSqFt = areaM2 * 10.7639;

    // Manual Drawing Logic:
    // Manual polygons are 2D footprints. Real roofs have slope (Pitch) + Parapets.
    // To match the precision of the AI (which measures 3D surface), we must add a 
    // "Manual Correction Factor" of ~20% (1.20) instead of the standard 15% (1.15).
    // This compensates for the missing Z-axis data in manual drawings.
    const MANUAL_SAFETY_FACTOR = 1.20;

    // Simulate "Stats" object for manual drawing to unify UI behavior
    const simulatedStats = {
        geometric: Math.round(areaSqFt),
        waste_factor: MANUAL_SAFETY_FACTOR.toFixed(2),
        material_needed: Math.round(areaSqFt * MANUAL_SAFETY_FACTOR),
        complexity_score: 1, // Assumed simple
        isManual: true
    };

    // Call Global Wizard Function with the same structure as AI
    if (window.updateAreaState) {
        window.updateAreaState(simulatedStats.geometric, simulatedStats);
    }
}

// High Precision Sealing Logic (Zero-Failure)
function calculatePrecisionArea(solarSqFt, segmentsCount = 1) {
    // 1. Geometric 3D Area (from Google Solar)
    // This is already the surface area, not footprint.

    // 2. Complexity Factor (Parapets & Detail Work)
    // More segments = more vertical walls (parapets) that Google doesn't measure.
    let complexityFactor = 1.0;
    if (segmentsCount > 5) complexityFactor = 1.05; // +5% for complex
    if (segmentsCount > 15) complexityFactor = 1.10; // +10% for very complex

    // 3. Recommended Waste Factor (Sealing Industry Standard: 15%)
    // We add the complexity factor to the base waste.
    const baseWaste = 1.15;
    const recommendedWaste = baseWaste * complexityFactor;

    // 4. Material Needed
    const materialNeeded = solarSqFt * recommendedWaste;

    return {
        geometric: Math.round(solarSqFt),
        waste_factor: recommendedWaste.toFixed(2),
        material_needed: Math.round(materialNeeded),
        complexity_score: segmentsCount
    };
}
