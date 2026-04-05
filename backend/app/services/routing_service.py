import json
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.core.config import settings
from app.schemas.routing import (
    ElevationRequest,
    ElevationResponse,
    RoutePlanPoint,
    RoutePlanRequest,
    RoutePlanResponse,
)


VALHALLA_COSTING_BY_ACTIVITY_TYPE = {
    "running": "pedestrian",
    "hiking": "pedestrian",
    "cycling": "bicycle",
}

OSRM_PROFILE_BY_ACTIVITY_TYPE = {
    "running": "foot",
    "hiking": "foot",
    "cycling": "bike",
}

VALHALLA_COSTING_OPTIONS_BY_ACTIVITY_TYPE = {
    "cycling": {
        "bicycle": {
            "bicycle_type": "Cross",
            "use_roads": 0.5,
            "avoid_bad_surfaces": 0.25,
        },
    },
}


class RoutingService:
    def plan_route(self, payload: RoutePlanRequest) -> RoutePlanResponse:
        if payload.activity_type not in VALHALLA_COSTING_BY_ACTIVITY_TYPE:
            return RoutePlanResponse(
                route_points=payload.waypoints,
                distance_meters=_calculate_route_distance_meters(payload.waypoints),
                source="manual",
                source_detail="manual routing for unsupported activity type",
            )

        try:
            return self._plan_with_valhalla(payload)
        except Exception as valhalla_error:
            try:
                osrm_response = self._plan_with_osrm(payload)
                osrm_response.source_detail = f"Valhalla failed: {valhalla_error}"
                return osrm_response
            except Exception as osrm_error:
                return RoutePlanResponse(
                    route_points=payload.waypoints,
                    distance_meters=_calculate_route_distance_meters(payload.waypoints),
                    source="manual",
                    source_detail=f"Valhalla failed: {valhalla_error}; OSRM failed: {osrm_error}",
                )

    def lookup_elevation(self, payload: ElevationRequest) -> ElevationResponse:
        try:
            return self._elevation_from_valhalla(payload)
        except Exception:
            try:
                return self._elevation_from_open_meteo(payload)
            except Exception:
                count = len(payload.coordinates)
                return ElevationResponse(
                    elevations=[None] * count,
                    elevation_gain_meters=0.0,
                    elevation_loss_meters=0.0,
                )

    def _elevation_from_valhalla(self, payload: ElevationRequest) -> ElevationResponse:
        shape = [
            {"lat": point.latitude, "lon": point.longitude}
            for point in payload.coordinates
        ]
        body = json.dumps({"shape": shape}, separators=(",", ":")).encode("utf-8")
        request = Request(
            f"{settings.valhalla_base_url}/height",
            data=body,
            headers={
                "User-Agent": "AltviaPlanner/0.1 (elevation lookup)",
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urlopen(request, timeout=15) as response:
            result = json.loads(response.read().decode("utf-8"))

        raw_heights = result.get("height", [])
        elevations: list[float | None] = [
            None if h == -32768 else float(h) for h in raw_heights
        ]
        gain, loss = _compute_gain_loss(elevations)
        return ElevationResponse(
            elevations=elevations,
            elevation_gain_meters=gain,
            elevation_loss_meters=loss,
        )

    def _elevation_from_open_meteo(self, payload: ElevationRequest) -> ElevationResponse:
        all_elevations: list[float | None] = []
        batch_size = 100
        coords = payload.coordinates

        for start in range(0, len(coords), batch_size):
            batch = coords[start : start + batch_size]
            latitudes = ",".join(f"{p.latitude:.6f}" for p in batch)
            longitudes = ",".join(f"{p.longitude:.6f}" for p in batch)
            params = urlencode({"latitude": latitudes, "longitude": longitudes})
            url = f"https://api.open-meteo.com/v1/elevation?{params}"
            request = Request(
                url,
                headers={
                    "User-Agent": "AltviaPlanner/0.1 (elevation lookup)",
                    "Accept": "application/json",
                },
            )
            with urlopen(request, timeout=10) as response:
                result = json.loads(response.read().decode("utf-8"))

            raw = result.get("elevation", [])
            for value in raw:
                if value is None or (isinstance(value, float) and not _is_finite(value)):
                    all_elevations.append(None)
                else:
                    all_elevations.append(float(value))

        gain, loss = _compute_gain_loss(all_elevations)
        return ElevationResponse(
            elevations=all_elevations,
            elevation_gain_meters=gain,
            elevation_loss_meters=loss,
        )

    def _plan_with_valhalla(self, payload: RoutePlanRequest) -> RoutePlanResponse:
        request_payload: dict = {
            "locations": [
                {"lat": point.latitude, "lon": point.longitude}
                for point in payload.waypoints
            ],
            "costing": VALHALLA_COSTING_BY_ACTIVITY_TYPE[payload.activity_type],
            "directions_options": {
                "units": "kilometers",
            },
            "shape_format": "geojson",
            "language": "en-US",
        }
        costing_options = VALHALLA_COSTING_OPTIONS_BY_ACTIVITY_TYPE.get(payload.activity_type)
        if costing_options:
            request_payload["costing_options"] = costing_options
        params = urlencode({"json": json.dumps(request_payload, separators=(",", ":"))})
        request = Request(
            f"{settings.valhalla_base_url}/route?{params}",
            headers={
                "User-Agent": "AltviaPlanner/0.1 (route planning)",
                "Accept": "application/json",
            },
            method="GET",
        )
        with urlopen(request, timeout=10) as response:
            payload_json = json.loads(response.read().decode("utf-8"))

        trip = payload_json.get("trip", {})
        legs = trip.get("legs", [])
        if not legs:
            raise ValueError("Valhalla route response did not include legs.")

        route_coordinates: list[list[float]] = []
        for leg in legs:
            shape = leg.get("shape")
            if not shape:
                continue
            route_coordinates.extend(_decode_valhalla_shape(shape))

        if len(route_coordinates) < 2:
            raise ValueError("Valhalla route response did not include route geometry.")

        route_points = [
            RoutePlanPoint(latitude=latitude, longitude=longitude)
            for longitude, latitude in route_coordinates
        ]
        distance_meters = sum(float(leg.get("summary", {}).get("length", 0.0)) for leg in legs) * 1000.0
        return RoutePlanResponse(
            route_points=route_points,
            distance_meters=distance_meters,
            source="valhalla",
            source_detail="Valhalla pedestrian/bicycle routing",
        )

    def _plan_with_osrm(self, payload: RoutePlanRequest) -> RoutePlanResponse:
        coordinates = ";".join(f"{point.longitude},{point.latitude}" for point in payload.waypoints)
        profile = OSRM_PROFILE_BY_ACTIVITY_TYPE[payload.activity_type]
        params = urlencode({"overview": "full", "geometries": "geojson", "steps": "false"})
        url = f"{settings.osrm_base_url}/route/v1/{profile}/{coordinates}?{params}"
        request = Request(
            url,
            headers={
                "User-Agent": "AltviaPlanner/0.1 (route planning)",
                "Accept": "application/json",
            },
        )
        with urlopen(request, timeout=10) as response:
            payload_json = json.loads(response.read().decode("utf-8"))

        routes = payload_json.get("routes", [])
        if not routes:
            raise ValueError("OSRM route response did not include routes.")

        geometry = routes[0]["geometry"]["coordinates"]
        route_points = [
            RoutePlanPoint(latitude=latitude, longitude=longitude)
            for longitude, latitude in geometry
        ]
        return RoutePlanResponse(
            route_points=route_points,
            distance_meters=float(routes[0].get("distance", 0.0)),
            source="osrm",
            source_detail="OSRM fallback routing",
        )


def _calculate_route_distance_meters(route_points: list[RoutePlanPoint]) -> float:
    from math import asin, cos, radians, sin, sqrt

    total_distance_meters = 0.0
    for left_point, right_point in zip(route_points, route_points[1:]):
        latitude_delta = radians(right_point.latitude - left_point.latitude)
        longitude_delta = radians(right_point.longitude - left_point.longitude)
        latitude_a = radians(left_point.latitude)
        latitude_b = radians(right_point.latitude)
        haversine = (
            sin(latitude_delta / 2) ** 2
            + cos(latitude_a) * cos(latitude_b) * sin(longitude_delta / 2) ** 2
        )
        total_distance_meters += 2 * 6_371_000.0 * asin(sqrt(haversine))
    return total_distance_meters


def _decode_valhalla_shape(shape: object) -> list[list[float]]:
    if isinstance(shape, dict):
        coordinates = shape.get("coordinates")
        if isinstance(coordinates, list):
            return coordinates
        raise ValueError("Valhalla shape object missing coordinates.")

    if isinstance(shape, str):
        return _decode_polyline6(shape)

    raise ValueError("Unsupported Valhalla shape format.")


def _decode_polyline6(encoded: str) -> list[list[float]]:
    coordinates: list[list[float]] = []
    index = 0
    latitude = 0
    longitude = 0

    while index < len(encoded):
        latitude_change, index = _decode_polyline_value(encoded, index)
        longitude_change, index = _decode_polyline_value(encoded, index)
        latitude += latitude_change
        longitude += longitude_change
        coordinates.append([longitude / 1_000_000.0, latitude / 1_000_000.0])

    return coordinates


def _decode_polyline_value(encoded: str, index: int) -> tuple[int, int]:
    result = 0
    shift = 0

    while True:
        value = ord(encoded[index]) - 63
        index += 1
        result |= (value & 0x1F) << shift
        shift += 5
        if value < 0x20:
            break

    decoded = ~(result >> 1) if (result & 1) else (result >> 1)
    return decoded, index


def _compute_gain_loss(elevations: list[float | None]) -> tuple[float, float]:
    gain = 0.0
    loss = 0.0
    previous: float | None = None
    for current in elevations:
        if current is not None and previous is not None:
            delta = current - previous
            if delta > 0:
                gain += delta
            else:
                loss += abs(delta)
        if current is not None:
            previous = current
    return gain, loss


def _is_finite(value: float) -> bool:
    import math
    return math.isfinite(value)
