from unittest.mock import patch

from utils.task_tracker import track_task


def test_track_task_uses_the_sidecar_database_connection():
    with (
        patch("utils.task_tracker.get_db") as get_db,
        patch("utils.task_tracker._track_task") as shared,
    ):
        track_task("fax_categorization", "Fax categorization")
    shared.assert_called_once_with(get_db, "fax_categorization", "Fax categorization")
