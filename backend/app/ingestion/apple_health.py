import re
import shutil
import zipfile
from bisect import bisect_left
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from xml.etree import ElementTree as ET

from fastapi import UploadFile
from shapely.geometry import LineString

from app.core.config import settings


APPLE_HEALTH_DATETIME_FORMAT = "%Y-%m-%d %H:%M:%S %z"
APPLE_HEALTH_SOURCE = "apple_health"
MIN_VALID_PACE_SECONDS_PER_MILE = 2 * 60
MAX_VALID_PACE_SECONDS_PER_MILE = 60 * 60


@dataclass(slots=True)
class ParsedActivity:
    source: str
    activity_type: str
    name: str
    started_at: datetime | None
    duration_seconds: float | None
    distance_meters: float | None
    elevation_gain_meters: float | None
    active_energy_kcal: float | None
    basal_energy_kcal: float | None
    average_heart_rate_bpm: float | None
    max_heart_rate_bpm: float | None
    recovery_heart_rate_bpm: float | None
    min_elevation_meters: float | None
    max_elevation_meters: float | None
    min_pace_seconds_per_mile: float | None
    max_pace_seconds_per_mile: float | None
    start_latitude: float | None
    start_longitude: float | None
    end_latitude: float | None
    end_longitude: float | None
    workout_metadata_json: dict[str, str] | None
    route_points_json: list[dict[str, object]] | None
    route_wkt: str | None


@dataclass(slots=True)
class ParsedAppleHealthImport:
    total_records: int
    skipped_records: int
    activities: list[ParsedActivity]


@dataclass(slots=True)
class HeartRateSample:
    recorded_at: datetime
    value_bpm: float


@dataclass(slots=True)
class ParsedRoute:
    route_wkt: str | None
    min_elevation_meters: float | None
    max_elevation_meters: float | None
    min_pace_seconds_per_mile: float | None
    max_pace_seconds_per_mile: float | None
    start_latitude: float | None
    start_longitude: float | None
    end_latitude: float | None
    end_longitude: float | None
    route_points_json: list[dict[str, object]] | None


class AppleHealthParser:
    async def inspect(self, file: UploadFile) -> dict[str, str]:
        filename = file.filename
        if not filename:
            raise ValueError("Uploaded Apple Health file must include a filename.")

        if not filename.endswith((".xml", ".zip")):
            raise ValueError("Apple Health import currently expects an .xml or .zip export.")

        return {"status": "accepted", "filename": filename}

    async def persist_upload(self, *, file: UploadFile, import_job_id: object) -> Path:
        await file.seek(0)
        storage_dir = settings.import_storage_dir / str(import_job_id)
        storage_dir.mkdir(parents=True, exist_ok=True)

        filename = self._sanitize_filename(file.filename or "apple-health-export.xml")
        destination = storage_dir / filename

        with destination.open("wb") as target:
            shutil.copyfileobj(file.file, target)

        return destination

    def parse_export(self, file_path: Path) -> ParsedAppleHealthImport:
        if file_path.suffix.lower() == ".zip":
            return self._parse_zip_export(file_path)
        if file_path.suffix.lower() == ".xml":
            return self._parse_xml_export(file_path)
        raise ValueError("Apple Health import currently expects an .xml or .zip export.")

    def _parse_xml_export(self, file_path: Path) -> ParsedAppleHealthImport:
        def load_route(route_reference: str) -> ParsedRoute:
            route_path = file_path.parent / route_reference.lstrip("/")
            if not route_path.exists():
                return self._empty_route()
            with route_path.open("rb") as route_stream:
                return self._parse_gpx_route(route_stream)

        with file_path.open("rb") as source:
            return self._parse_workouts(source, load_route)

    def _parse_zip_export(self, file_path: Path) -> ParsedAppleHealthImport:
        with zipfile.ZipFile(file_path) as archive:
            export_member = self._find_export_member(archive)
            if export_member is None:
                raise ValueError("Apple Health zip archive does not include export.xml.")

            def load_route(route_reference: str) -> ParsedRoute:
                route_member = self._find_archive_member(archive, route_reference.lstrip("/"))
                if route_member is None:
                    return self._empty_route()
                with archive.open(route_member) as route_stream:
                    return self._parse_gpx_route(route_stream)

            with archive.open(export_member) as source:
                return self._parse_workouts(source, load_route)

    def _parse_workouts(
        self,
        source: object,
        route_loader: Callable[[str], ParsedRoute],
    ) -> ParsedAppleHealthImport:
        activities: list[ParsedActivity] = []
        heart_rate_samples: list[HeartRateSample] = []
        total_records = 0
        skipped_records = 0

        for _, element in ET.iterparse(source, events=("end",)):
            local_name = self._local_name(element.tag)
            if local_name == "Record":
                heart_rate_sample = self._parse_heart_rate_record(element)
                if heart_rate_sample is not None:
                    heart_rate_samples.append(heart_rate_sample)
                element.clear()
                continue

            if local_name != "Workout":
                continue

            total_records += 1
            parsed_activity = self._parse_workout_element(element, route_loader)
            if parsed_activity is None:
                skipped_records += 1
            else:
                activities.append(parsed_activity)
            element.clear()

        self._assign_recovery_heart_rates(activities, heart_rate_samples)
        self._assign_route_point_heart_rates(activities, heart_rate_samples)

        return ParsedAppleHealthImport(
            total_records=total_records,
            skipped_records=skipped_records,
            activities=activities,
        )

    def _parse_workout_element(
        self,
        workout: ET.Element,
        route_loader: Callable[[str], ParsedRoute],
    ) -> ParsedActivity | None:
        activity_type = self._normalize_activity_type(workout.attrib.get("workoutActivityType"))
        if activity_type is None:
            return None

        started_at = self._parse_datetime(workout.attrib.get("startDate"))
        ended_at = self._parse_datetime(workout.attrib.get("endDate"))
        duration_seconds = self._duration_to_seconds(
            workout.attrib.get("duration"),
            workout.attrib.get("durationUnit"),
        )
        if duration_seconds is None and started_at is not None and ended_at is not None:
            duration_seconds = max((ended_at - started_at).total_seconds(), 0.0)

        metadata_entries = self._metadata_entries(workout)
        statistics = self._statistics_entries(workout)

        distance_meters = self._distance_to_meters(
            workout.attrib.get("totalDistance"),
            workout.attrib.get("totalDistanceUnit"),
        )
        if distance_meters is None:
            distance_meters = self._distance_from_statistics(statistics)

        elevation_gain_meters = self._elevation_from_metadata(metadata_entries)
        active_energy_kcal = self._energy_from_statistics(
            statistics,
            statistic_type="HKQuantityTypeIdentifierActiveEnergyBurned",
        )
        basal_energy_kcal = self._energy_from_statistics(
            statistics,
            statistic_type="HKQuantityTypeIdentifierBasalEnergyBurned",
        )
        average_heart_rate_bpm, max_heart_rate_bpm = self._heart_rate_from_statistics(statistics)

        route_reference = self._route_reference(workout)
        parsed_route = route_loader(route_reference) if route_reference is not None else self._empty_route()

        return ParsedActivity(
            source=APPLE_HEALTH_SOURCE,
            activity_type=activity_type,
            name=self._humanize_activity_type(activity_type),
            started_at=started_at,
            duration_seconds=duration_seconds,
            distance_meters=distance_meters,
            elevation_gain_meters=elevation_gain_meters,
            active_energy_kcal=active_energy_kcal,
            basal_energy_kcal=basal_energy_kcal,
            average_heart_rate_bpm=average_heart_rate_bpm,
            max_heart_rate_bpm=max_heart_rate_bpm,
            recovery_heart_rate_bpm=None,
            min_elevation_meters=parsed_route.min_elevation_meters,
            max_elevation_meters=parsed_route.max_elevation_meters,
            min_pace_seconds_per_mile=parsed_route.min_pace_seconds_per_mile,
            max_pace_seconds_per_mile=parsed_route.max_pace_seconds_per_mile,
            start_latitude=parsed_route.start_latitude,
            start_longitude=parsed_route.start_longitude,
            end_latitude=parsed_route.end_latitude,
            end_longitude=parsed_route.end_longitude,
            workout_metadata_json=metadata_entries or None,
            route_points_json=parsed_route.route_points_json,
            route_wkt=parsed_route.route_wkt,
        )

    @staticmethod
    def _sanitize_filename(filename: str) -> str:
        safe_name = Path(filename).name
        return re.sub(r"[^A-Za-z0-9._-]+", "-", safe_name)

    @staticmethod
    def _find_export_member(archive: zipfile.ZipFile) -> str | None:
        for member_name in archive.namelist():
            normalized_name = member_name.rstrip("/")
            if normalized_name.endswith("export.xml"):
                return member_name
        return None

    @staticmethod
    def _find_archive_member(archive: zipfile.ZipFile, reference: str) -> str | None:
        reference = reference.rstrip("/")
        for member_name in archive.namelist():
            normalized_name = member_name.rstrip("/")
            if normalized_name == reference or normalized_name.endswith(reference):
                return member_name
        return None

    @staticmethod
    def _metadata_entries(workout: ET.Element) -> dict[str, str]:
        metadata: dict[str, str] = {}
        for child in workout:
            if AppleHealthParser._local_name(child.tag) != "MetadataEntry":
                continue
            key = child.attrib.get("key")
            value = child.attrib.get("value")
            if key and value:
                metadata[key] = value
        return metadata

    @staticmethod
    def _parse_heart_rate_record(record: ET.Element) -> HeartRateSample | None:
        if record.attrib.get("type") != "HKQuantityTypeIdentifierHeartRate":
            return None

        recorded_at = AppleHealthParser._parse_datetime(record.attrib.get("startDate"))
        value_bpm = AppleHealthParser._to_float(record.attrib.get("value"))
        if recorded_at is None or value_bpm is None:
            return None

        return HeartRateSample(recorded_at=recorded_at, value_bpm=value_bpm)

    @staticmethod
    def _statistics_entries(workout: ET.Element) -> list[ET.Element]:
        return [
            child
            for child in workout
            if AppleHealthParser._local_name(child.tag) == "WorkoutStatistics"
        ]

    @staticmethod
    def _route_reference(workout: ET.Element) -> str | None:
        for child in workout:
            if AppleHealthParser._local_name(child.tag) != "WorkoutRoute":
                continue
            for route_child in child:
                if AppleHealthParser._local_name(route_child.tag) == "FileReference":
                    return route_child.attrib.get("path")
        return None

    @staticmethod
    def _parse_datetime(value: str | None) -> datetime | None:
        if value is None:
            return None
        try:
            return datetime.strptime(value, APPLE_HEALTH_DATETIME_FORMAT)
        except ValueError:
            return None

    @staticmethod
    def _duration_to_seconds(value: str | None, unit: str | None) -> float | None:
        amount = AppleHealthParser._to_float(value)
        if amount is None:
            return None

        multiplier = {
            "s": 1.0,
            "sec": 1.0,
            "min": 60.0,
            "h": 3600.0,
            "hr": 3600.0,
        }.get((unit or "s").lower())
        if multiplier is None:
            return None
        return amount * multiplier

    @staticmethod
    def _distance_to_meters(value: str | None, unit: str | None) -> float | None:
        amount = AppleHealthParser._to_float(value)
        if amount is None:
            return None

        multiplier = {
            "m": 1.0,
            "km": 1000.0,
            "mi": 1609.344,
            "ft": 0.3048,
            "yd": 0.9144,
        }.get((unit or "m").lower())
        if multiplier is None:
            return None
        return amount * multiplier

    @staticmethod
    def _distance_from_statistics(statistics: list[ET.Element]) -> float | None:
        for statistic in statistics:
            statistic_type = statistic.attrib.get("type", "")
            if "Distance" not in statistic_type:
                continue

            distance_meters = AppleHealthParser._distance_to_meters(
                statistic.attrib.get("sum"),
                statistic.attrib.get("unit"),
            )
            if distance_meters is not None:
                return distance_meters
        return None

    @staticmethod
    def _energy_from_statistics(statistics: list[ET.Element], *, statistic_type: str) -> float | None:
        for statistic in statistics:
            if statistic.attrib.get("type") != statistic_type:
                continue
            return AppleHealthParser._to_float(statistic.attrib.get("sum"))
        return None

    @staticmethod
    def _heart_rate_from_statistics(statistics: list[ET.Element]) -> tuple[float | None, float | None]:
        for statistic in statistics:
            if statistic.attrib.get("type") != "HKQuantityTypeIdentifierHeartRate":
                continue
            return (
                AppleHealthParser._to_float(statistic.attrib.get("average")),
                AppleHealthParser._to_float(statistic.attrib.get("maximum")),
            )
        return None, None

    @staticmethod
    def _elevation_from_metadata(metadata_entries: dict[str, str]) -> float | None:
        value = metadata_entries.get("HKElevationAscended")
        if value is None:
            return None

        amount, unit = AppleHealthParser._split_value_and_unit(value)
        if amount is None:
            return None

        multiplier = {
            "m": 1.0,
            "meter": 1.0,
            "meters": 1.0,
            "cm": 0.01,
            "ft": 0.3048,
        }.get(unit.lower() if unit else "m")
        if multiplier is None:
            return None
        return amount * multiplier

    @staticmethod
    def _normalize_activity_type(value: str | None) -> str | None:
        if not value:
            return None
        prefix = "HKWorkoutActivityType"
        normalized = value[len(prefix) :] if value.startswith(prefix) else value
        normalized = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", normalized)
        normalized = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", normalized)
        return normalized.strip("_").lower()

    @staticmethod
    def _humanize_activity_type(activity_type: str) -> str:
        return activity_type.replace("_", " ").title()

    @staticmethod
    def _parse_gpx_route(source: object) -> ParsedRoute:
        root = ET.parse(source).getroot()
        namespace = {"gpx": "http://www.topografix.com/GPX/1/1"}
        coordinates: list[tuple[float, float]] = []
        elevations: list[float] = []
        paces_seconds_per_mile: list[float] = []
        route_points: list[dict[str, object]] = []

        for point in root.findall(".//gpx:trkpt", namespace):
            latitude = AppleHealthParser._to_float(point.attrib.get("lat"))
            longitude = AppleHealthParser._to_float(point.attrib.get("lon"))
            if latitude is None or longitude is None:
                continue
            coordinates.append((longitude, latitude))
            elevation = AppleHealthParser._to_float(point.findtext("gpx:ele", default=None, namespaces=namespace))
            if elevation is not None:
                elevations.append(elevation)
            speed = AppleHealthParser._parse_speed(point)
            pace_seconds_per_mile = AppleHealthParser._pace_seconds_per_mile(speed)
            if pace_seconds_per_mile is not None:
                paces_seconds_per_mile.append(pace_seconds_per_mile)
            recorded_at = AppleHealthParser._parse_route_point_time(point, namespace)
            route_points.append(
                {
                    "latitude": latitude,
                    "longitude": longitude,
                    "elevation_meters": elevation,
                    "recorded_at": recorded_at.isoformat() if recorded_at else None,
                    "speed_meters_per_second": speed,
                    "pace_seconds_per_mile": pace_seconds_per_mile,
                    "heart_rate_bpm": None,
                }
            )

        if len(coordinates) < 2:
            return ParsedRoute(
                route_wkt=None,
                min_elevation_meters=min(elevations) if elevations else None,
                max_elevation_meters=max(elevations) if elevations else None,
                min_pace_seconds_per_mile=min(paces_seconds_per_mile) if paces_seconds_per_mile else None,
                max_pace_seconds_per_mile=max(paces_seconds_per_mile) if paces_seconds_per_mile else None,
                start_latitude=coordinates[0][1] if coordinates else None,
                start_longitude=coordinates[0][0] if coordinates else None,
                end_latitude=coordinates[-1][1] if coordinates else None,
                end_longitude=coordinates[-1][0] if coordinates else None,
                route_points_json=route_points or None,
            )

        return ParsedRoute(
            route_wkt=LineString(coordinates).wkt,
            min_elevation_meters=min(elevations) if elevations else None,
            max_elevation_meters=max(elevations) if elevations else None,
            min_pace_seconds_per_mile=min(paces_seconds_per_mile) if paces_seconds_per_mile else None,
            max_pace_seconds_per_mile=max(paces_seconds_per_mile) if paces_seconds_per_mile else None,
            start_latitude=coordinates[0][1],
            start_longitude=coordinates[0][0],
            end_latitude=coordinates[-1][1],
            end_longitude=coordinates[-1][0],
            route_points_json=route_points,
        )

    @staticmethod
    def _parse_speed(point: ET.Element) -> float | None:
        for child in point.iter():
            if AppleHealthParser._local_name(child.tag) == "speed":
                return AppleHealthParser._to_float(child.text)
        return None

    @staticmethod
    def _pace_seconds_per_mile(speed_meters_per_second: float | None) -> float | None:
        if speed_meters_per_second is None or speed_meters_per_second <= 0:
            return None

        pace_seconds_per_mile = 1609.344 / speed_meters_per_second
        if not MIN_VALID_PACE_SECONDS_PER_MILE <= pace_seconds_per_mile <= MAX_VALID_PACE_SECONDS_PER_MILE:
            return None

        return pace_seconds_per_mile

    @staticmethod
    def _parse_route_point_time(point: ET.Element, namespace: dict[str, str]) -> datetime | None:
        time_text = point.findtext("gpx:time", default=None, namespaces=namespace)
        if time_text is None:
            return None
        try:
            return datetime.fromisoformat(time_text.replace("Z", "+00:00"))
        except ValueError:
            return None

    @staticmethod
    def _empty_route() -> ParsedRoute:
        return ParsedRoute(
            route_wkt=None,
            min_elevation_meters=None,
            max_elevation_meters=None,
            min_pace_seconds_per_mile=None,
            max_pace_seconds_per_mile=None,
            start_latitude=None,
            start_longitude=None,
            end_latitude=None,
            end_longitude=None,
            route_points_json=None,
        )

    @staticmethod
    def _assign_recovery_heart_rates(
        activities: list[ParsedActivity],
        heart_rate_samples: list[HeartRateSample],
    ) -> None:
        if not activities or not heart_rate_samples:
            return

        heart_rate_samples.sort(key=lambda sample: sample.recorded_at)
        sample_times = [sample.recorded_at for sample in heart_rate_samples]

        for activity in activities:
            if activity.started_at is None or activity.duration_seconds is None:
                continue

            workout_end = activity.started_at.timestamp() + activity.duration_seconds
            end_datetime = datetime.fromtimestamp(workout_end, tz=activity.started_at.tzinfo)
            start_index = bisect_left(sample_times, end_datetime)

            recovery_candidates = [
                sample.value_bpm
                for sample in heart_rate_samples[start_index : start_index + 20]
                if 60 <= (sample.recorded_at - end_datetime).total_seconds() <= 600
            ]
            if recovery_candidates:
                activity.recovery_heart_rate_bpm = min(recovery_candidates)

    @staticmethod
    def _assign_route_point_heart_rates(
        activities: list[ParsedActivity],
        heart_rate_samples: list[HeartRateSample],
    ) -> None:
        if not activities or not heart_rate_samples:
            return

        heart_rate_samples.sort(key=lambda sample: sample.recorded_at)
        sample_times = [sample.recorded_at for sample in heart_rate_samples]

        for activity in activities:
            if not activity.route_points_json:
                continue

            for point in activity.route_points_json:
                recorded_at_raw = point.get("recorded_at")
                if not isinstance(recorded_at_raw, str):
                    continue

                try:
                    recorded_at = datetime.fromisoformat(recorded_at_raw)
                except ValueError:
                    continue

                heart_rate = AppleHealthParser._interpolated_heart_rate(
                    recorded_at,
                    heart_rate_samples,
                    sample_times,
                )
                if heart_rate is not None:
                    point["heart_rate_bpm"] = heart_rate

    @staticmethod
    def _interpolated_heart_rate(
        recorded_at: datetime,
        heart_rate_samples: list[HeartRateSample],
        sample_times: list[datetime],
    ) -> float | None:
        sample_index = bisect_left(sample_times, recorded_at)
        previous_sample = heart_rate_samples[sample_index - 1] if sample_index > 0 else None
        next_sample = heart_rate_samples[sample_index] if sample_index < len(heart_rate_samples) else None

        max_single_side_gap_seconds = 120.0
        max_interpolation_window_seconds = 300.0

        if previous_sample and previous_sample.recorded_at == recorded_at:
            return previous_sample.value_bpm
        if next_sample and next_sample.recorded_at == recorded_at:
            return next_sample.value_bpm

        if previous_sample and next_sample:
            before_gap = (recorded_at - previous_sample.recorded_at).total_seconds()
            after_gap = (next_sample.recorded_at - recorded_at).total_seconds()
            total_gap = (next_sample.recorded_at - previous_sample.recorded_at).total_seconds()

            if (
                0 <= before_gap <= max_interpolation_window_seconds
                and 0 <= after_gap <= max_interpolation_window_seconds
                and 0 < total_gap <= max_interpolation_window_seconds * 2
            ):
                ratio = before_gap / total_gap if total_gap > 0 else 0.0
                interpolated = previous_sample.value_bpm + (
                    (next_sample.value_bpm - previous_sample.value_bpm) * ratio
                )
                return round(interpolated, 2)

        nearest_sample: HeartRateSample | None = None
        nearest_gap_seconds: float | None = None
        for candidate in (previous_sample, next_sample):
            if candidate is None:
                continue
            gap_seconds = abs((candidate.recorded_at - recorded_at).total_seconds())
            if nearest_gap_seconds is None or gap_seconds < nearest_gap_seconds:
                nearest_sample = candidate
                nearest_gap_seconds = gap_seconds

        if nearest_sample is not None and nearest_gap_seconds is not None and nearest_gap_seconds <= max_single_side_gap_seconds:
            return nearest_sample.value_bpm

        return None

    @staticmethod
    def _split_value_and_unit(value: str) -> tuple[float | None, str | None]:
        parts = value.strip().split(maxsplit=1)
        if not parts:
            return None, None
        return AppleHealthParser._to_float(parts[0]), parts[1] if len(parts) > 1 else None

    @staticmethod
    def _to_float(value: str | None) -> float | None:
        if value is None:
            return None
        try:
            return float(value)
        except ValueError:
            return None

    @staticmethod
    def _local_name(tag: str) -> str:
        if "}" in tag:
            return tag.split("}", maxsplit=1)[1]
        return tag
