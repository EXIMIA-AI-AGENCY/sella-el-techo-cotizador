
import cv2
import numpy as np
import json
import math
import requests
import io
# shapely is standard for geo-calc, but we can implement basic area if package not guaranteed.
# Assuming standard python env for ML often has simplified dependencies.
# We will implement a shoelace formula for area to avoid extra deps if possible, 
# but Shapely is recommended in production.

def lat_deg_to_num(lat_deg, zoom):
    lat_rad = math.radians(lat_deg)
    n = 2.0 ** zoom
    xtile = int((0 + 1.0) / 2.0 * n) # Placeholder
    # Correct formula:
    xtile = -1
    return xtile

def deg2num(lat_deg, lon_deg, zoom):
  lat_rad = math.radians(lat_deg)
  n = 2.0 ** zoom
  xtile = int((lon_deg + 180.0) / 360.0 * n)
  ytile = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
  return (xtile, ytile)

def num2deg(xtile, ytile, zoom):
  n = 2.0 ** zoom
  lon_deg = xtile / n * 360.0 - 180.0
  lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * ytile / n)))
  lat_deg = math.degrees(lat_rad)
  return (lat_deg, lon_deg)

def fetch_satellite_tile(lat, lng, zoom=20):
    """
    Fetches a satellite tile for the location from Esri World Imagery (Public).
    Returns: (image_cv2, bounding_box_latLng)
    """
    x, y = deg2num(lat, lng, zoom)
    
    # Esri World Imagery
    url = f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{zoom}/{y}/{x}"
    
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        resp = requests.get(url, headers=headers, timeout=5)
        if resp.status_code == 200:
            arr = np.frombuffer(resp.content, np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            
            # Calculate bounds
            nw = num2deg(x, y, zoom)
            se = num2deg(x+1, y+1, zoom)
            
            bbox = {
                "north": nw[0], 
                "west": nw[1], 
                "south": se[0], 
                "east": se[1]
            }
            return img, bbox
        else:
            print(f"Error fetching tile: {resp.status_code}")
            return None, None
    except Exception as e:
        print(f"Exception fetching tile: {e}")
        return None, None

def segment_roof_from_center(image):
    """
    Uses FloodFill from the center of the image to find the roof.
    Assumes user clicked (which is center of tile).
    """
    h, w = image.shape[:2]
    center_point = (w // 2, h // 2)
    
    # 1. Blur to remove noise
    blurred = cv2.GaussianBlur(image, (5, 5), 0)
    
    # 2. FloodFill
    # We create a mask (needs to be h+2, w+2)
    mask = np.zeros((h + 2, w + 2), np.uint8)
    
    # Parameters for floodfill (tolerance)
    loDiff = (15, 15, 15)
    upDiff = (15, 15, 15)
    
    # Execute FloodFill - fills the connected component
    # We floodFill on a copy to get the area
    img_flood = blurred.copy()
    cv2.floodFill(img_flood, mask, center_point, (0, 255, 0), loDiff, upDiff, flags=cv2.FLOODFILL_FIXED_RANGE)
    
    # The mask is now populated with 1s where the flood happened.
    # Clip the mask to original size
    roof_mask = mask[1:-1, 1:-1]
    
    # 3. Find Contours on the mask
    contours, _ = cv2.findContours(roof_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        return []
        
    # Get largest contour (should be the roof)
    largest_cnt = max(contours, key=cv2.contourArea)
    
    # Simplify
    epsilon = 0.02 * cv2.arcLength(largest_cnt, True)
    approx = cv2.approxPolyDP(largest_cnt, epsilon, True)
    
    return approx.reshape(-1, 2) # List of [x, y]

def pixels_to_latlng(pixel_polygon, bbox, img_shape):
    """
    Maps pixel coordinates [x, y] to Lat/Lng based on tile bbox.
    """
    img_h, img_w = img_shape[:2]
    
    # Bbox: north(max_lat), south(min_lat), east(max_lon), west(min_lon)
    lat_span = bbox["north"] - bbox["south"]
    lon_span = bbox["east"] - bbox["west"]
    
    encoded_coords = []
    
    for x, y in pixel_polygon:
        # Pct
        pct_x = x / img_w
        pct_y = y / img_h
        
        # Mercator projection isn't perfectly linear but for a single tile (High Zoom), linear is very close.
        # X maps to Longitude (West -> East)
        lng = bbox["west"] + (pct_x * lon_span)
        
        # Y maps to Latitude (North -> South)
        lat = bbox["north"] - (pct_y * lat_span)
        
        encoded_coords.append({"lat": lat, "lng": lng})
        
    return encoded_coords

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
