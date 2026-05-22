from pathlib import Path

import pandas as pd
from loguru import logger


def open_local(file: Path) -> pd.DataFrame:
    """Reads a CSV file and returns a DataFrame."""
    try:
        with Path.open(file, encoding="utf-8") as f:
            logger.debug(f"Opening {file}")
            df = pd.read_csv(f)
    except UnicodeDecodeError:
        logger.warning(f"UnicodeDecodeError for {file}")
        with Path.open(file, encoding="latin1") as f:
            logger.debug(f"Opening {file} with latin1 encoding")
            df = pd.read_csv(f)
    return df
