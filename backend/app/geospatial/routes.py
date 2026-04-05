def estimate_route_grade(distance_meters: float, elevation_gain_meters: float) -> float:
    if distance_meters <= 0:
        return 0.0
    return elevation_gain_meters / distance_meters
