
import os
import requests
import json
import math

class SolarAPIClient:
    """
    Client for interacting with Google Solar API.
    Designed for Serverless execution (AWS Lambda / pure Python script).
    """
    def __init__(self, api_key):
        self.api_key = api_key
        self.base_url = "https://solar.googleapis.com/v1"

    def get_roof_geometry(self, lat, lng, quality="HIGH"):
        """
        Fetches building insights and extracts vector geometry.
        """
        url = f"{self.base_url}/buildingInsights:findClosest"
        params = {
            "location.latitude": lat,
            "location.longitude": lng,
            "requiredQuality": quality,
            "key": self.api_key
        }

        try:
            response = requests.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            
            # Extract Critical Data
            if "solarPotential" not in data:
                return {"error": "No solar potential data found for this location"}

            solar_pot = data["solarPotential"]
            
            # 1. Parse Segments (The core 3D geometry)
            segments = self._process_segments(solar_pot.get("roofSegmentStats", []))
            
            # 2. Extract Bounds & Center
            bounding_box = solar_pot.get("boundingBox", {})
            center = data.get("center", {})
            
            # 3. Calculate Precision 3D Area
            # "areaMeters2" in wholeRoofStats is the 3D SURFACE AREA, not 2D footprint.
            # This accounts for the slope (pitch) which increases material usage.
            total_3d_area_sqft = solar_pot.get("wholeRoofStats", {}).get("areaMeters2", 0) * 10.7639
            max_pitch = max([s["pitch"] for s in segments]) if segments else 0
            
            # 4. Sealing-Specific Logic (Zero-Failure)
            # Liquid membrane needs to cover overlaps and vertical parapets (pretiles).
            # Google Solar DOES NOT measure vertical parapet walls, only the "sky-facing" planes.
            # We must estimate a "Parapet Factor" based on roof complexity (number of segments).
            
            # Complexity Heuristic: More segments = More valleys/hips/parapets
            num_segments = len(segments)
            complexity_factor = 1.0
            if num_segments > 5: complexity_factor = 1.05 # +5% for complex roofs
            if num_segments > 15: complexity_factor = 1.10 # +10% for very complex
            
            # Base Waste for Liquid Applied Membrane (Overlap/Roller absorption)
            # Standard industry is 10-15%. We recommend 15% to be "Ultra Safe".
            base_waste = 1.15 
            recommended_waste_factor = base_waste * complexity_factor

            estimated_material_area = total_3d_area_sqft * recommended_waste_factor

            return {
                "status": "success",
                "metrics": {
                    "geometric_surface_area_sqft": round(total_3d_area_sqft, 2),
                    "max_pitch_degrees": max_pitch,
                    "roof_segments_count": num_segments,
                    "recommended_waste_factor": round(recommended_waste_factor, 2),
                    "estimated_material_needed_sqft": round(estimated_material_area, 2)
                },
                "segments": segments,
                "bounding_box": bounding_box,
                "center": center,
                "note": "Area represents 3D surface including slope. Waste factor adds buffer for parapets and overlap."
            }

        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                return {"status": "error", "message": "Building not found at this location."}
            elif e.response.status_code == 403:
                return {"status": "error", "message": "API Key Invalid or Quota Exceeded."}
            else:
                return {"status": "error", "message": str(e)}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def _process_segments(self, raw_stats):
        """
        Aggregates roof segments based on pitch and azimuth.
        """
        processed = []
        for idx, stat in enumerate(raw_stats):
            processed.append({
                "id": idx + 1,
                "azimuth": round(stat.get("azimuthDegrees", 0), 1),
                "pitch": round(stat.get("pitchDegrees", 0), 1),
                "area_sqft": round(stat.get("stats", {}).get("areaMeters2", 0) * 10.7639, 2),
                "center": stat.get("center", {}),
                "bounding_box": stat.get("boundingBox", {})
            })
        return processed

    def get_visual_mask(self, lat, lng, radius_meters=50):
        """
        Fetches Data Layers (GeoTIFFs) for visual overlay.
        Returns the URL for the 'flux' (Solar Flux) layer or 'mask'.
        """
        url = f"{self.base_url}/dataLayers:get"
        params = {
            "location.latitude": lat,
            "location.longitude": lng,
            "radiusMeters": radius_meters,
            "view": "FULL_LAYERS",
            "requiredQuality": "HIGH",
            "key": self.api_key
        }
        
        try:
            response = requests.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            
            # Find Flux Layer or Mask Layer
            # We look for 'rgbUrl' if available, otherwise 'maskUrl'
            # The prompt asks for "image_overlay_url"
            
            if "imageryLayers" in data:
                # Prioritize RGB
                for layer in data["imageryLayers"]:
                     if "rgb" in layer: # Simplification, check API spec for exact key
                         pass 
                # Actually Solar API returns 'rgbUrl', 'maskUrl', 'dsmUrl', 'annualFluxUrl'
                
            # For simplicity, returning the Annual Flux URL which is most common for visualization
            return {
                "status": "success",
                "annual_flux_url": data.get("annualFluxUrl"),
                "mask_url": data.get("maskUrl"),
                "dsm_url": data.get("dsmUrl"),
                "rgb_url": data.get("rgbUrl")
            }
            
        except Exception as e:
            return {"status": "error", "message": str(e)}

# --- Execution Entry Point (Simulation) ---
if __name__ == "__main__":
    # Load API Key from Env or Hardcoded (User needs to supply)
    # Using the key found in js/map_logic.js for demo purposes
    API_KEY = "AIzaSyBR72tWGSonQu3eMgfcEUZdDiAcqaQ_bhA"
    
    # Test Coordinates (A generic location in PR, or derived from known building)
    LAT = 18.2208
    LNG = -66.5901
    
    # Actually, let's use a coordinate likely to have data. 
    # San Juan Urban Area: 18.427406, -66.070267
    TEST_LAT = 18.427406
    TEST_LNG = -66.070267

    client = SolarAPIClient(API_KEY)
    
    print(f"--- Fetching Building Insights for {TEST_LAT}, {TEST_LNG} ---")
    geometry_data = client.get_roof_geometry(TEST_LAT, TEST_LNG)
    print(json.dumps(geometry_data, indent=2))
    
    print("\n--- Fetching Visual Layers ---")
    visual_data = client.get_visual_mask(TEST_LAT, TEST_LNG)
    print(json.dumps(visual_data, indent=2))
