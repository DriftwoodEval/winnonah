import json

import pytest
from driftwood_common.log_format import json_log_format
from loguru import logger


@pytest.fixture
def log_lines():
    """Collect the lines loguru writes through json_log_format."""
    lines: list[str] = []
    handler_id = logger.add(lines.append, format=json_log_format)
    yield lines
    logger.remove(handler_id)


def parse_only_line(lines: list[str]) -> dict:
    assert len(lines) == 1
    assert lines[0].endswith("\n")
    return json.loads(lines[0])


class TestJsonLogFormat:
    def test_writes_one_json_line_with_the_record_fields(self, log_lines):
        logger.info("hello world")
        parsed = parse_only_line(log_lines)
        assert parsed["message"] == "hello world"
        assert parsed["level"] == "INFO"
        assert parsed["module"] == __name__
        assert parsed["function"] == "test_writes_one_json_line_with_the_record_fields"
        assert isinstance(parsed["line"], int)
        assert parsed["time"]
        assert "exception" not in parsed

    @pytest.mark.parametrize(
        "message",
        ["value {foo} <bar>", "<unknown>", "{{already doubled}}", "100% {done}"],
    )
    def test_braces_and_angle_brackets_survive_loguru_parsing(self, log_lines, message):
        logger.info(message)
        assert parse_only_line(log_lines)["message"] == message

    def test_includes_the_traceback_when_logging_an_exception(self, log_lines):
        try:
            raise ValueError("bad <value> {x}")
        except ValueError:
            logger.exception("failed")
        parsed = parse_only_line(log_lines)
        assert parsed["message"] == "failed"
        assert "Traceback" in parsed["exception"]
        assert "ValueError: bad <value> {x}" in parsed["exception"]
