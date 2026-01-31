
import cv2
import numpy as np
import json
# shapely is standard for geo-calc, but we can implement basic area if package not guaranteed.
# Assuming standard python env for ML often has simplified dependencies.
# We will implement a shoelace formula for area to avoid extra deps if possible, 
# but Shapely is recommended in production.

def polygonize_mask(mask, epsilon=1.0):
    """
    Converts binary mask to polygons using Ramer-Douglas-Peucker simplification.
    """
    # Find Contours
    contours, hierarchy = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    polygons = []
    
    for cnt in contours:
        if cv2.contourArea(cnt) < 100: # Filter noise
            continue
            
        # Simplify contour
        approx = cv2.approxPolyDP(cnt, epsilon, True)
        
        # We need at least 3 points for a polygon
        if len(approx) >= 3:
            # Reshape to list of [x, y]
            poly_points = approx.reshape(-1, 2).tolist()
            polygons.append(poly_points)
            
    return polygons

def calculate_polygon_area(coords):
    """
    Calculates area of a polygon using Shoelace formula (Surveyor's formula).
    coords: List of [x, y] points.
    """
    if len(coords) < 3:
        return 0.0
        
    area = 0.0
    n = len(coords)
    j = n - 1 # Last vertex
    
    for i in range(n):
        area += (coords[j][0] + coords[i][0]) * (coords[j][1] - coords[i][1])
        j = i
        
    return abs(area / 2.0)

def mask_to_geojson(mask, epsilon=1.0, class_id=1):
    """
    Full pipeline: Mask -> Polygons -> GeoJSON dict
    """
    polygons = polygonize_mask(mask, epsilon)
    features = []
    
    for poly in polygons:
        area = calculate_polygon_area(poly)
        feature = {
            "type": "Feature",
            "properties": {
                "class_id": class_id,
                "confidence": 1.0, # Placeholder, needing model probability map integration for real score
                "area_pixels": area
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [poly + [poly[0]]] # Close the loop
            }
        }
        features.append(feature)
        
    return {
        "type": "FeatureCollection",
        "features": features
    }
