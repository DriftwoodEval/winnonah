import os
from typing import cast
from unittest.mock import MagicMock, patch

import cv2
import numpy as np
import pytesseract
import pytest
from llama_cpp import Llama
from PIL import Image, ImageDraw

try:
    import resource
except ImportError:
    resource = None  # not available on Windows

from utils.document_categorizer import (
    CATEGORIES,
    _clean_client_names,
    _clean_confidence,
    _complete_json,
    _denoise_binarize,
    _deskew,
    _estimate_skew_angle,
    _orient_by_reading,
    _rotate_clockwise,
    analyze_document,
    build_prompt,
    categorize_document,
    extract_clients,
    fit_to_context,
    header_override_category,
    limit_cpu_usage,
    limit_memory_usage,
    page_rotation,
)


def _lined_page(skew_degrees: float) -> np.ndarray:
    """A synthetic page of horizontal text-like lines, rotated to simulate
    a skewed fax scan, then binarized the same way _denoise_binarize does."""
    image = Image.new("L", (600, 800), color=255)
    draw = ImageDraw.Draw(image)
    for y in range(50, 750, 30):
        draw.line((50, y, 550, y), fill=0, width=4)
    rotated = image.rotate(skew_degrees, expand=True, fillcolor=255)
    arr = np.array(rotated)
    return cv2.adaptiveThreshold(
        arr, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 15
    )


class FakeLlm:
    """Minimal stand-in for llama_cpp.Llama: whitespace-tokenizes text so
    token counts and truncation are predictable, and returns a canned chat
    completion response."""

    def __init__(self, n_ctx: int = 1000, chat_content: str | None = None):
        self._n_ctx = n_ctx
        self.chat_content = chat_content
        self.last_messages: list[dict] | None = None
        self.last_kwargs: dict | None = None

    def n_ctx(self):
        return self._n_ctx

    def tokenize(self, data: bytes, add_bos: bool = True):  # noqa: ARG002
        return data.decode("utf-8").split()

    def detokenize(self, tokens) -> bytes:
        return " ".join(tokens).encode("utf-8")

    def create_chat_completion(self, messages, **kwargs):
        self.last_messages = messages
        self.last_kwargs = kwargs
        return {"choices": [{"message": {"content": self.chat_content}}]}

    def as_llama(self) -> Llama:
        """Hands this fake back typed as Llama for passing into the
        functions under test, which are annotated to take a real Llama and
        don't need FakeLlm to be a subclass."""
        return cast(Llama, self)


class TestHeaderOverrideCategory:
    def test_matches_known_letterhead_marker(self):
        text = "STATE OF SOUTH CAROLINA\nDISABILITY DETERMINATION SERVICES\n..."
        assert header_override_category(text) == "Records Request"

    def test_match_is_case_insensitive(self):
        text = "disability determination services letterhead"
        assert header_override_category(text) == "Records Request"

    def test_only_checks_header_characters(self):
        far_away_marker = "x" * 600 + "DISABILITY DETERMINATION SERVICES"
        assert header_override_category(far_away_marker) is None

    def test_returns_none_when_no_marker_present(self):
        assert header_override_category("Just a regular document body.") is None


class TestBuildPrompt:
    def test_includes_document_text(self):
        prompt = build_prompt("patient referral details here")
        assert "patient referral details here" in prompt

    def test_lists_every_category(self):
        prompt = build_prompt("some text")
        for category in CATEGORIES:
            assert category in prompt

    def test_asks_for_conservative_confidence(self):
        prompt = build_prompt("some text")
        assert "confidence" in prompt
        assert "conservative" in prompt


class TestCleanClientNames:
    def test_capitalizes_each_name(self):
        assert _clean_client_names(["john smith"]) == ["John Smith"]

    def test_drops_none_string_entries(self):
        assert _clean_client_names(["john smith", "none", "None"]) == ["John Smith"]

    def test_drops_falsy_entries(self):
        assert _clean_client_names(["john smith", "", None]) == ["John Smith"]

    def test_returns_empty_list_for_non_list_input(self):
        assert _clean_client_names("john smith") == []
        assert _clean_client_names(None) == []

    def test_returns_empty_list_for_empty_list(self):
        assert _clean_client_names([]) == []


class TestCleanConfidence:
    def test_parses_numeric_string(self):
        assert _clean_confidence("0.75") == 0.75

    def test_parses_float(self):
        assert _clean_confidence(0.42) == 0.42

    def test_clamps_above_one(self):
        assert _clean_confidence(1.5) == 1.0

    def test_clamps_below_zero(self):
        assert _clean_confidence(-0.5) == 0.0

    def test_returns_zero_for_none(self):
        assert _clean_confidence(None) == 0.0

    def test_returns_zero_for_unparseable_value(self):
        assert _clean_confidence("not a number") == 0.0


class TestCompleteJson:
    def test_parses_valid_json_content(self):
        llm = FakeLlm(chat_content='{"category": "Referral"}')
        result = _complete_json(llm.as_llama(), "prompt", {}, 0.0)
        assert result == {"category": "Referral"}

    def test_returns_empty_dict_for_invalid_json(self):
        llm = FakeLlm(chat_content="not json")
        result = _complete_json(llm.as_llama(), "prompt", {}, 0.0)
        assert result == {}

    def test_returns_empty_dict_for_empty_content(self):
        llm = FakeLlm(chat_content=None)
        result = _complete_json(llm.as_llama(), "prompt", {}, 0.0)
        assert result == {}

    def test_passes_prompt_and_schema_to_llm(self):
        llm = FakeLlm(chat_content="{}")
        schema = {"type": "object"}
        _complete_json(llm.as_llama(), "my prompt", schema, 0.3)
        assert llm.last_messages == [{"role": "user", "content": "my prompt"}]
        assert llm.last_kwargs is not None
        assert llm.last_kwargs["response_format"] == {
            "type": "json_object",
            "schema": schema,
        }
        assert llm.last_kwargs["temperature"] == 0.3


class TestFitToContext:
    def test_returns_text_unchanged_when_within_budget(self):
        llm = FakeLlm(n_ctx=1000)
        text = "short document text"
        result = fit_to_context(llm.as_llama(), text, lambda t: t, response_reserve=10)
        assert result == text

    def test_truncates_text_exceeding_budget(self):
        llm = FakeLlm(n_ctx=20)
        text = " ".join(f"word{i}" for i in range(100))
        result = fit_to_context(llm.as_llama(), text, lambda t: t, response_reserve=1)
        assert len(result.split()) < 100

    def test_empty_document_stays_empty(self):
        llm = FakeLlm(n_ctx=1000)
        assert (
            fit_to_context(llm.as_llama(), "", lambda t: t, response_reserve=10) == ""
        )


class TestAnalyzeDocument:
    def test_returns_category_clients_and_confidence(self):
        llm = FakeLlm(
            chat_content='{"category": "Referral", "clients": ["john smith"], "confidence": 0.9}'
        )
        category, clients, confidence = analyze_document(
            llm.as_llama(), "some document text"
        )
        assert category == "Referral"
        assert clients == ["John Smith"]
        assert confidence == 0.9

    def test_missing_fields_fall_back_to_defaults(self):
        llm = FakeLlm(chat_content="{}")
        category, clients, confidence = analyze_document(
            llm.as_llama(), "some document text"
        )
        assert category == ""
        assert clients == []
        assert confidence == 0.0


class TestExtractClients:
    def test_returns_cleaned_client_names(self):
        llm = FakeLlm(chat_content='{"clients": ["jane doe"]}')
        assert extract_clients(llm.as_llama(), "some document text") == ["Jane Doe"]

    def test_returns_empty_list_when_no_clients(self):
        llm = FakeLlm(chat_content='{"clients": []}')
        assert extract_clients(llm.as_llama(), "some document text") == []


class TestCategorizeDocument:
    def test_header_override_skips_model_when_clients_not_wanted(self):
        llm = FakeLlm(chat_content="{}")
        text = "DISABILITY DETERMINATION SERVICES\nbody text"
        category, clients, confidence = categorize_document(
            llm.as_llama(), text, want_clients=False
        )
        assert category == "Records Request"
        assert clients == []
        assert confidence == 1.0
        assert llm.last_messages is None

    def test_header_override_still_extracts_clients_when_wanted(self):
        llm = FakeLlm(chat_content='{"clients": ["john smith"]}')
        text = "DISABILITY DETERMINATION SERVICES\nbody text"
        category, clients, confidence = categorize_document(
            llm.as_llama(), text, want_clients=True
        )
        assert category == "Records Request"
        assert clients == ["John Smith"]
        assert confidence == 1.0

    def test_falls_back_to_model_when_no_header_override(self):
        llm = FakeLlm(
            chat_content='{"category": "Insurance", "clients": [], "confidence": 0.6}'
        )
        category, _clients, confidence = categorize_document(
            llm.as_llama(), "a plain document with no known letterhead"
        )
        assert category == "Insurance"
        assert confidence == 0.6


class TestPageRotation:
    BINARY = np.zeros((8, 8), dtype=np.uint8)

    def test_zero_when_osd_confidently_upright(self):
        with patch(
            "pytesseract.image_to_osd",
            return_value="Rotate: 0\nOrientation confidence: 7.50",
        ):
            assert page_rotation(MagicMock(), self.BINARY) == 0

    def test_returns_osd_angle_when_raw_and_clean_agree_confidently(self):
        with (
            patch(
                "pytesseract.image_to_osd",
                return_value="Rotate: 90\nOrientation confidence: 7.50",
            ) as osd,
            patch("utils.document_categorizer._orient_by_reading") as fallback,
        ):
            assert page_rotation(MagicMock(), self.BINARY) == 90
        assert osd.call_count == 2
        fallback.assert_not_called()

    def test_reads_four_ways_when_osd_confidence_low(self):
        with (
            patch(
                "pytesseract.image_to_osd",
                return_value="Rotate: 90\nOrientation confidence: 0.31",
            ),
            patch(
                "utils.document_categorizer._orient_by_reading", return_value=270
            ) as fallback,
        ):
            assert page_rotation(MagicMock(), self.BINARY) == 270
        fallback.assert_called_once()

    def test_reads_four_ways_when_osd_fails(self):
        with (
            patch(
                "pytesseract.image_to_osd",
                side_effect=pytesseract.TesseractError(1, "no OSD"),
            ),
            patch(
                "utils.document_categorizer._orient_by_reading", return_value=0
            ) as fallback,
        ):
            assert page_rotation(MagicMock(), self.BINARY) == 0
        fallback.assert_called_once()

    def test_reads_four_ways_when_raw_and_clean_osd_disagree(self):
        with (
            patch(
                "pytesseract.image_to_osd",
                side_effect=[
                    "Rotate: 0\nOrientation confidence: 5.00",
                    "Rotate: 90\nOrientation confidence: 5.00",
                ],
            ),
            patch(
                "utils.document_categorizer._orient_by_reading", return_value=270
            ) as fallback,
        ):
            assert page_rotation(MagicMock(), self.BINARY) == 270
        fallback.assert_called_once()


class TestRotateClockwise:
    def test_lossless_quarter_turns(self):
        arr = np.arange(6, dtype=np.uint8).reshape(2, 3)
        assert np.array_equal(_rotate_clockwise(arr, 0), arr)
        assert np.array_equal(_rotate_clockwise(arr, 90), np.rot90(arr, -1))
        assert np.array_equal(_rotate_clockwise(arr, 180), np.rot90(arr, 2))
        assert np.array_equal(_rotate_clockwise(arr, 270), np.rot90(arr, 1))
        round_trip = _rotate_clockwise(_rotate_clockwise(arr, 270), 90)
        assert np.array_equal(round_trip, arr)


class TestOrientByReading:
    def _img(self):
        return Image.new("RGB", (20, 20), color="white")

    def test_keeps_the_rotation_that_reads_as_the_most_text(self):
        # scores returned for rotations 0, 90, 180, 270 in that order
        with patch(
            "utils.document_categorizer._readability_score",
            side_effect=[300.0, 4000.0, 200.0, 100.0],
        ):
            assert _orient_by_reading(self._img()) == 90

    def test_no_rotation_when_upright_already_reads_best(self):
        with patch(
            "utils.document_categorizer._readability_score",
            side_effect=[4000.0, 300.0, 200.0, 100.0],
        ):
            assert _orient_by_reading(self._img()) == 0

    def test_leaves_page_alone_when_nothing_reads_well(self):
        with patch(
            "utils.document_categorizer._readability_score",
            side_effect=[120.0, 200.0, 60.0, 30.0],
        ):
            assert _orient_by_reading(self._img()) == 0

    def test_leaves_page_alone_when_winner_barely_beats_runner_up(self):
        # near-tie between two perpendicular orientations: an upright page
        # Tesseract happens to read about as well rotated 90 degrees
        with patch(
            "utils.document_categorizer._readability_score",
            side_effect=[9326.0, 9353.0, 830.0, 1090.0],
        ):
            assert _orient_by_reading(self._img()) == 0

    def test_rotates_landscape_page_that_reads_clearly_better_one_way(self):
        # real shape: correct orientation (270) beats its upside down (90)
        # decisively and edges out the perpendicular render
        with patch(
            "utils.document_categorizer._readability_score",
            side_effect=[3112.0, 329.0, 645.0, 4495.0],
        ):
            assert _orient_by_reading(self._img()) == 270

    def test_osd_hint_breaks_a_perpendicular_near_tie_toward_best(self):
        # 90 and 180 read close and are 90 degrees apart; OSD agreed on 180,
        # so take the higher-reading rotation (90)
        with patch(
            "utils.document_categorizer._readability_score",
            side_effect=[122.0, 3900.0, 3473.0, 251.0],
        ):
            assert _orient_by_reading(self._img(), osd_hint=180, osd_conf=1.8) == 90

    def test_osd_hint_breaks_a_180_degree_tie_toward_osd(self):
        # 0 and 180 read close and are 180 degrees apart; trust OSD's call
        with patch(
            "utils.document_categorizer._readability_score",
            side_effect=[3900.0, 200.0, 3473.0, 150.0],
        ):
            assert _orient_by_reading(self._img(), osd_hint=180, osd_conf=1.8) == 180

    def test_osd_hint_ignored_when_too_unconfident(self):
        # upright still reads well enough not to trip the sideways rule, so
        # the weak OSD hint is the only lever and it's ignored
        with patch(
            "utils.document_categorizer._readability_score",
            side_effect=[900.0, 3900.0, 3473.0, 251.0],
        ):
            assert _orient_by_reading(self._img(), osd_hint=180, osd_conf=0.4) == 0

    def test_rotates_sideways_page_when_upright_barely_reads(self):
        # angle 0 is near-blank; 90 and its 180-flip both read well (fax
        # speckle narrowing the gap), so rotate to the higher-reading 90
        with patch(
            "utils.document_categorizer._readability_score",
            side_effect=[241.0, 3642.0, 3054.0, 120.0],
        ):
            assert _orient_by_reading(self._img()) == 90

    def test_osd_hint_ignored_when_not_among_the_top_two(self):
        with patch(
            "utils.document_categorizer._readability_score",
            side_effect=[900.0, 3900.0, 3473.0, 251.0],
        ):
            assert _orient_by_reading(self._img(), osd_hint=0, osd_conf=3.0) == 0


class TestDenoiseBinarize:
    def test_returns_black_and_white_array_same_size(self):
        image = Image.fromarray(
            (np.random.default_rng(0).random((100, 150, 3)) * 255).astype("uint8"),
            "RGB",
        )
        result = _denoise_binarize(image)
        assert result.shape == (100, 150)
        assert set(np.unique(result).tolist()) <= {0, 255}

    def test_handles_blank_page_without_crashing(self):
        _denoise_binarize(Image.new("RGB", (100, 100), color="white"))


class TestEstimateSkewAngle:
    def test_returns_near_zero_for_unskewed_page(self):
        angle = _estimate_skew_angle(_lined_page(0))
        assert abs(angle) < 0.5

    @pytest.mark.parametrize("skew_degrees", [5, -5, 2, -8])
    def test_recovers_the_applied_skew(self, skew_degrees):
        # The returned angle is the correction to apply (i.e. the inverse
        # of the skew that was applied), matching what _deskew feeds
        # straight into cv2.getRotationMatrix2D.
        angle = _estimate_skew_angle(_lined_page(skew_degrees))
        assert angle == pytest.approx(-skew_degrees, abs=0.5)

    def test_returns_zero_when_no_lines_detected(self):
        blank = np.full((100, 100), 255, dtype=np.uint8)
        assert _estimate_skew_angle(blank) == 0.0


class TestDeskew:
    @pytest.mark.parametrize("skew_degrees", [5, -5, 8])
    def test_straightens_skewed_page(self, skew_degrees):
        image = Image.new("L", (600, 800), color=255)
        draw = ImageDraw.Draw(image)
        for y in range(50, 750, 30):
            draw.line((50, y, 550, y), fill=0, width=4)
        rotated = image.rotate(skew_degrees, expand=True, fillcolor=255).convert("RGB")

        cleaned = _deskew(_denoise_binarize(rotated))

        assert abs(_estimate_skew_angle(cleaned)) < 0.5


class TestLimitCpuUsage:
    def test_sets_thread_limit_env_vars(self, monkeypatch):
        for var in (
            "OMP_THREAD_LIMIT",
            "OMP_NUM_THREADS",
            "OPENBLAS_NUM_THREADS",
            "MKL_NUM_THREADS",
        ):
            monkeypatch.delenv(var, raising=False)

        limit_cpu_usage(4)

        assert os.environ["OMP_THREAD_LIMIT"] == "4"
        assert os.environ["OMP_NUM_THREADS"] == "4"
        assert os.environ["OPENBLAS_NUM_THREADS"] == "4"
        assert os.environ["MKL_NUM_THREADS"] == "4"

    def test_does_not_override_existing_env_vars(self, monkeypatch):
        monkeypatch.setenv("OMP_THREAD_LIMIT", "99")

        limit_cpu_usage(4)

        assert os.environ["OMP_THREAD_LIMIT"] == "99"


class TestLimitMemoryUsage:
    def test_calls_setrlimit_with_computed_byte_limit(self):
        if resource is None:
            pytest.skip("resource module not available on this platform")

        rlim_infinity = resource.RLIM_INFINITY
        captured = {}

        def fake_getrlimit(_which):
            return (0, rlim_infinity)

        def fake_setrlimit(_which, limits):
            captured["limits"] = limits

        with (
            patch("resource.getrlimit", fake_getrlimit),
            patch("resource.setrlimit", fake_setrlimit),
        ):
            limit_memory_usage(1.0)

        assert captured["limits"][0] == int(1.0 * 1024**3)
