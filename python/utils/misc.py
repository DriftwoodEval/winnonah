import pandas as pd


def get_column(series, column, default=None):
    if column in series:
        value = series[column]

        if isinstance(value, list) and len(value) == 1 and pd.isna(value[0]):
            return default

        if isinstance(value, list):
            return value

        elif pd.notna(value):
            return value

    return default
