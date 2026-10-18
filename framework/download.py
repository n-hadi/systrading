import pandas as pd
import yfinance as yf
import os

def download_update_data(tickers):
    
    os.makedirs("historical_data", exist_ok=True)

    for ticker in tickers:

        path = f"historical_data/{ticker}.csv"

        if os.path.exists(path):

            df = pd.read_csv(path)

            df["Date"] = pd.to_datetime(df["Date"])

            last_date = df["Date"].iloc[-1]

            new_data = yf.download(
                ticker,
                start=last_date,
                auto_adjust=False
            )

            new_data.columns = new_data.columns.droplevel(1)
            new_data = new_data.reset_index()
            new_data = new_data.rename(columns={new_data.columns[0]: "Date"})
            new_data["Date"] = pd.to_datetime(new_data["Date"])

            df = pd.concat([df, new_data])
            df = df.drop_duplicates("Date")
            df = df.sort_values("Date")

        else:

            df = yf.download(
                ticker,
                period="10y",
                auto_adjust=False
            )

            df.columns = df.columns.droplevel(1)
            df = df.reset_index()
            df = df.rename(columns={df.columns[0]: "Date"})
            df["Date"] = pd.to_datetime(df["Date"])

        df.to_csv(path, index=False)