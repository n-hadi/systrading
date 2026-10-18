import pandas as pd


def get_corr_histories(instruments, corr_variable):
    """Pairwise correlations between instruments, for one shared column."""
    values = pd.DataFrame({
        ticker: instrument["dataframe"][corr_variable]
        for ticker, instrument in instruments.items()
    })

    return build_corr_histories(values)


def get_signal_corr_histories(df):
    """Pairwise correlations between one instrument's raw rule signals."""
    signals = [
        column
        for column in df.columns
        if column.startswith("s_")
    ]

    return build_corr_histories(df[signals])


def build_corr_histories(values):
    pair_history = get_pairwise_corr_history(values)

    return {
        # The index travels with the values: these series are plotted against
        # a date axis, and a bare list would leave the frontend guessing.
        "Date": [str(d)[:10] for d in values.index],
        "pairs": pair_history,
        "average": get_average_corr_history(pair_history),
    }


def get_pairwise_corr_history(values):
    pair_history = {}

    for window in [20, 60, 120]:
        corr = values.rolling(window).corr()

        pairs = {}

        for i, column_a in enumerate(values.columns):
            for column_b in values.columns[i + 1:]:
                pair = f"{column_a} / {column_b}"

                pairs[pair] = corr[column_b].xs(
                    column_a,
                    level=1
                )

        pair_history[window] = pairs

    return pair_history


def get_average_corr_history(pair_history):
    average_history = {}

    for window, pairs in pair_history.items():
        average_history[window] = pd.DataFrame(pairs).mean(axis=1)

    return average_history
