import math
from dataclasses import dataclass

from app.core.config import settings
from app.models.activity import Activity


ELEVATION_WEIGHT = 0.3
GENDER_EXPONENT = 1.92
GENDER_COEFFICIENT = 0.64
TRIMP_UPPER_BOUND = 300.0


@dataclass
class EffortScoreResult:
    effort_score: float
    trimp: float
    hr_intensity_ratio: float
    max_hr_used: float
    elevation_factor: float
    formula_version: str = "v1"

    def to_dict(self) -> dict:
        return {
            "effort_score": round(self.effort_score, 1),
            "trimp": round(self.trimp, 1),
            "hr_intensity_ratio": round(self.hr_intensity_ratio, 3),
            "max_hr_used": self.max_hr_used,
            "elevation_factor": round(self.elevation_factor, 3),
            "formula_version": self.formula_version,
        }


def compute_effort_score(activity: Activity) -> EffortScoreResult | None:
    avg_hr = activity.average_heart_rate_bpm
    duration_s = activity.duration_seconds

    if avg_hr is None or duration_s is None or duration_s <= 0:
        return None

    # Determine max HR: config override > per-activity value
    if settings.user_max_heart_rate > 0:
        max_hr = settings.user_max_heart_rate
    elif activity.max_heart_rate_bpm is not None and activity.max_heart_rate_bpm > 0:
        max_hr = activity.max_heart_rate_bpm
    else:
        return None

    # Clamp avg_hr if it exceeds max_hr (edge case in noisy data)
    avg_hr = min(avg_hr, max_hr)

    hr_ratio = avg_hr / max_hr
    duration_min = duration_s / 60.0

    trimp = duration_min * hr_ratio * GENDER_COEFFICIENT * math.exp(GENDER_EXPONENT * hr_ratio)

    elevation_gain = activity.elevation_gain_meters or 0.0
    elevation_factor = 1.0 + (elevation_gain / 1000.0) * ELEVATION_WEIGHT

    adjusted_trimp = trimp * elevation_factor

    effort_score = max(0.0, min(adjusted_trimp / TRIMP_UPPER_BOUND, 1.0)) * 100.0

    return EffortScoreResult(
        effort_score=effort_score,
        trimp=adjusted_trimp,
        hr_intensity_ratio=hr_ratio,
        max_hr_used=max_hr,
        elevation_factor=elevation_factor,
    )
