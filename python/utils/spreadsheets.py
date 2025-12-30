import pandas as pd
from loguru import logger


def open_local(file) -> pd.DataFrame:
    """Reads a CSV file and returns a DataFrame."""
    try:
        with open(file, encoding="utf-8") as f:
            logger.debug(f"Opening {file}")
            df = pd.read_csv(f)
    except UnicodeDecodeError:
        logger.warning(f"UnicodeDecodeError for {file}")
        with open(file, encoding="latin1") as f:
            logger.debug(f"Opening {file} with latin1 encoding")
            df = pd.read_csv(f)
    return df


def get_unique_values(df: pd.DataFrame, column: str) -> list:
    """Returns a list of unique values in a column of a DataFrame."""
    return df[column].unique().tolist()
