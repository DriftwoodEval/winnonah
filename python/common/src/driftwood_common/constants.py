"""Constants shared by every Python project in the practice's stack."""

from typing import Final

# The practice's timezone. Mirrored in the web app as BUSINESS_TIMEZONE in
# src/lib/constants.ts and exposed to other services as `business_timezone` on
# the shared config (`py-config` API). Prefer a configured value where one is
# already in scope; this is the default for code that is not handed one.
BUSINESS_TIMEZONE: Final = "America/New_York"
