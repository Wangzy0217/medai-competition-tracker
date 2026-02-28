import re
from datetime import date

from models import Phase


def _parse_deadline(deadline: str):
    if not deadline:
        return None
    trimmed = deadline.strip()
    if trimmed in {"待定", "TBD", "tbd"}:
        return None
    match = re.search(r"(\d{4})[./-](\d{1,2})[./-](\d{1,2})", trimmed)
    if not match:
        return None
    year, month, day = map(int, match.groups())
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _derive_status(current_status: str, deadline: str):
    manual_status = current_status if current_status in {"PENDING", "IN_PROGRESS", "COMPLETED", "REVIEWING"} else "IN_PROGRESS"
    if manual_status in {"COMPLETED", "REVIEWING"}:
        return manual_status
    parsed = _parse_deadline(deadline)
    if not parsed:
        return manual_status
    days_left = (parsed - date.today()).days
    if days_left < 0:
        return "RISK"
    if days_left <= 10:
        return "WARNING"
    return manual_status


def serialize_phase(phase: Phase):
    return {
        "id": phase.id,
        "title": phase.title,
        "dateRange": phase.date_range,
        "mainTasks": [
            {
                "id": mt.id,
                "title": mt.title,
                "dateRange": mt.date_range,
                "subTasks": [
                    {
                        "id": st.id,
                        "description": st.description,
                        "owner": st.owner,
                        "deadline": st.deadline,
                        "status": _derive_status(st.status, st.deadline),
                        "predecessorId": st.predecessor_id,
                    }
                    for st in mt.sub_tasks
                ],
            }
            for mt in phase.main_tasks
        ],
    }


def get_full_data():
    phases = Phase.query.order_by(Phase.order_index).all()
    return [serialize_phase(p) for p in phases]
