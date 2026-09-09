from utils.special_accommodations import build_accommodation_email


def test_build_accommodation_email_subject_is_secure():
    subject, _ = build_accommodation_email("Maria Garcia", "1234567890", "Spanish")
    assert "secure" in subject.lower()


def test_build_accommodation_email_body_has_all_fields():
    _, body = build_accommodation_email("Maria Garcia", "1234567890", "Spanish")
    assert "Maria Garcia" in body
    assert "1234567890" in body
    assert "Spanish" in body
