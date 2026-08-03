"""Run every data generator in sequence, refreshing all CSVs.

    python _generate_all.py

Every generator pulls history from (and including) 2020-01-01. Note that only
days.csv and the weather files actually have a 2020-01-01 row: eurron.csv and
commodities.csv start at the first *market* day of 2020 (Jan 2 for Yahoo, Jan 3
for BNR) because exchanges and the central bank were closed on New Year's Day.

Each script runs in its own process, so a failure in one (e.g. a CSV left open
in Excel) is reported but does not stop the others.
"""

import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent

SCRIPTS = [
    "days_generate.py",
    "weather_generate.py",
    "eurron_generate.py",
    "commodities_generate.py",
]


def main() -> None:
    results = []
    for script in SCRIPTS:
        print(f"\n{'=' * 60}\n  Running {script}\n{'=' * 60}")
        start = time.perf_counter()
        completed = subprocess.run([sys.executable, str(HERE / script)], cwd=HERE)
        elapsed = time.perf_counter() - start
        results.append((script, completed.returncode == 0, elapsed))

    print(f"\n{'=' * 60}\n  Summary\n{'=' * 60}")
    for script, ok, elapsed in results:
        print(f"  {'OK  ' if ok else 'FAIL'}  {script:26} {elapsed:6.1f}s")

    if not all(ok for _, ok, _ in results):
        sys.exit(1)


if __name__ == "__main__":
    main()
