from models import Phase


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
                        "status": st.status,
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
