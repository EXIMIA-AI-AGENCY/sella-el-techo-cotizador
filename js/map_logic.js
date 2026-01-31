let map;
let drawingManager;
let currentPolygon = null;

// Global Pricing Constants
const CONSTANTS = {
    WASTE_FACTOR: 1.15, // 15% waste/overlap
    PRICE_SQFT: 4.50,   // Base price example
    TAX_RATE: 0.115
};

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
    if (!navigator.geolocation) {
        alert("Tu navegador no soporta geolocalización.");
        return;
    }

    const btn = document.querySelector("button[onclick='useCurrentLocation()']");
    const originalText = btn.innerText;
    btn.innerText = "⏳ Buscando...";

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const pos = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
            };

            // 1. Save Center
            window.mapCenter = pos;

            // 2. Reverse Geocode to get address text
            const geocoder = new google.maps.Geocoder();
            geocoder.geocode({ location: pos }, (results, status) => {
                if (status === "OK" && results[0]) {
                    document.getElementById("addressInput").value = results[0].formatted_address;
                    document.getElementById("btnNext").disabled = false;

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
                    document.getElementById("addressInput").value = "Ubicación detectada (Lat: " + pos.lat.toFixed(4) + ")";
                }
                btn.innerText = originalText;
            });
        },
        () => {
            alert("No pudimos detectar tu ubicación. Por favor escríbela manual.");
            btn.innerText = originalText;
        }
    );
}

// SOLAR API INTEGRATION
async function fetchSolarData(lat, lng) {
    const apiKey = "AIzaSyBR72tWGSonQu3eMgfcEUZdDiAcqaQ_bhA";
    const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&requiredQuality=HIGH&key=${apiKey}`;

    // Show loading state in UI
    const areaLabel = document.getElementById('liveArea');
    if (areaLabel) areaLabel.innerText = "Calculando IA...";

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.solarPotential && data.solarPotential.wholeRoofStats) {

            // 1. Get Area
            const areaM2 = data.solarPotential.wholeRoofStats.areaMeters2;
            const areaSqFt = areaM2 * 10.7639;

            console.log("Solar API Success:", areaSqFt);

            // 2. DRAW THE ROOF (High Precision Polygon)
            // Instead of a simple box, we try to draw the actual segments.
            if (currentPolygon) currentPolygon.setMap(null);

            // If we have segments, draw them. Otherwise fallback to box.
            const segments = data.solarPotential.roofSegmentStats;
            if (segments && segments.length > 0) {
                // Google Solar unfortunately doesn't return the *vertices* of the polygon segments directly in this endpoint.
                // It only returns bounding boxes for segments. 
                // Best approach: Draw the main bounding box, but make it easier to edit.
            }

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

            // Add listener to recalculate if user fixes the box
            currentPolygon.addListener("bounds_changed", () => {
                // Re-calculate manual area if modified
                // Re-calculate manual area if modified
                // We use height * width for the rectangle approximation
                const ne = currentPolygon.getBounds().getNorthEast();
                const sw = currentPolygon.getBounds().getSouthWest();
                const height = google.maps.geometry.spherical.computeDistanceBetween(ne, { lat: ne.lat(), lng: sw.lng() });
                const width = google.maps.geometry.spherical.computeDistanceBetween(ne, { lat: sw.lat(), lng: ne.lng() });
                const newAreaSqFt = (height * width) * 10.7639;

                // Fallback to manual mode logic
                if (window.updateAreaState) window.updateAreaState(newAreaSqFt);
            });


            // Fit map nicely
            window.map.fitBounds(currentPolygon.getBounds());

            // Update Global State
            if (window.updateAreaState) {
                // Count segments for complexity
                const segmentCount = (data.solarPotential.roofSegmentStats || []).length;

                const stats = calculatePrecisionArea(areaSqFt, segmentCount);

                console.log("Precision Calc:", stats);

                // ALERT for User Feedback (To ensure they feel the difference)
                alert(`✅ MODO PRECISIÓN 3D ACTIVADO\n\n• Complejidad de Techo: ${segmentCount > 5 ? 'ALTA' : 'ESTÁNDAR'}\n• Desperdicio Ajustado: ${Math.round((stats.waste_factor - 1) * 100)}%\n• Material Calculado: ${stats.material_needed} ft²`);

                // Pass Geometric Area to UI so it displays "Measured".
                // We pass the full stats so the UI can use the accurate "material_needed" for pricing.
                window.updateAreaState(stats.geometric, stats);

                // Notify user
                setTimeout(() => {
                    // alert(`🏠 Techo Detectado con Precisión\n\nÁrea Geométrica: ${stats.geometric} ft²\nMaterial Estimado: ${stats.material_needed} ft² (incluye ${Math.round((stats.waste_factor-1)*100)}% de desperdicio y pretiles).`);
                }, 800);
            }
        } else {
            console.warn("Solar API: No roof stats found for this location.");
            if (areaLabel) areaLabel.innerText = "0";
        }
    } catch (error) {
        console.error("Solar API Error:", error);

        // AUTO-SIMULATION MODE (Requested "Lo Mejor")
        const userWantsDemo = confirm("⚠️ Alerta Google Solar: Tu API Key no es válida.\n\n¿Quieres activar el MODO SIMULACIÓN para ver cómo funcionaría el sistema con una llave real?");

        if (userWantsDemo) {
            simulateSolarData();
        } else {
            if (areaLabel) areaLabel.innerText = "0";
        }
    }
}

// Helper: Simulate Data if API breaks
function simulateSolarData() {
    const center = window.map.getCenter();

    // 1. Draw Mock Green Box (Precision)
    if (currentPolygon) currentPolygon.setMap(null);
    const size = 0.0001; // Approx 10 meters
    const bounds = {
        north: center.lat() + size,
        south: center.lat() - size,
        east: center.lng() + size,
        west: center.lng() - size
    };

    currentPolygon = new google.maps.Rectangle({
        strokeColor: "#00FF00",
        strokeOpacity: 0.8,
        strokeWeight: 3,
        fillColor: "#00FF00",
        fillOpacity: 0.3,
        map: window.map,
        bounds: bounds,
        editable: true,
        draggable: true
    });

    // Add listener (Same as real mode)
    currentPolygon.addListener("bounds_changed", () => {
        const ne = currentPolygon.getBounds().getNorthEast();
        const sw = currentPolygon.getBounds().getSouthWest();
        const height = google.maps.geometry.spherical.computeDistanceBetween(ne, { lat: ne.lat(), lng: sw.lng() });
        const width = google.maps.geometry.spherical.computeDistanceBetween(ne, { lat: sw.lat(), lng: ne.lng() });
        const newAreaSqFt = (height * width) * 10.7639;
        if (window.updateAreaState) window.updateAreaState(newAreaSqFt);
    });

    // 2. Mock Stats (High Complexity Example)
    const mockStat = {
        geometric: 1250,
        waste_factor: 1.25, // Complex
        material_needed: 1563,
        complexity_score: 8
    };

    alert(`✅ [SIMULACIÓN] MODO PRECISIÓN 3D ACTIVADO\n\n• Complejidad de Techo: ALTA (Simulada)\n• Desperdicio Ajustado: 25%\n• Material Calculado: ${mockStat.material_needed} ft²`);

    if (window.updateAreaState) window.updateAreaState(mockStat.geometric, mockStat);

    window.map.fitBounds(currentPolygon.getBounds());
}

function initDrawingManager() {
    // Helper to toggle mode
    window.setManualDraw = (enable) => {
        console.log("Setting Manual Draw:", enable);
        if (drawingManager) {
            drawingManager.setDrawingMode(enable ? google.maps.drawing.OverlayType.POLYGON : null);
            drawingManager.setOptions({ drawingControl: false });
        }
    };

    drawingManager = new google.maps.drawing.DrawingManager({
        drawingMode: null, // Default to Hand Mode (Click Selection)
        drawingControl: false, // Hidden by default, use custom buttons
        drawingControlOptions: {
            position: google.maps.ControlPosition.TOP_CENTER,
            drawingModes: [google.maps.drawing.OverlayType.POLYGON],
        },
        polygonOptions: {
            fillColor: "#ff9900",
            fillOpacity: 0.4,
            strokeWeight: 2,
            strokeColor: "#ff9900",
            clickable: true,
            editable: true,
            draggable: true,
            zIndex: 1,
        },
    });

    drawingManager.setMap(map);

    google.maps.event.addListener(drawingManager, "overlaycomplete", function (event) {
        if (currentPolygon) {
            currentPolygon.setMap(null);
        }

        currentPolygon = event.overlay;
        drawingManager.setDrawingMode(null);
        calculateArea();

        const path = currentPolygon.getPath();
        google.maps.event.addListener(path, "set_at", calculateArea);
        google.maps.event.addListener(path, "insert_at", calculateArea);
    });
}

function calculateArea() {
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
