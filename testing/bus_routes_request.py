import json
from pathlib import Path

import requests


BASE_URL = "https://ridebt.org/index.php?option=com_ajax&module=bt_map&format=json&Itemid=189"
OUTPUT_DIR = Path(__file__).parent


def fetch_and_write(method: str, output_filename: str) -> None:
    url = f"{BASE_URL}&method={method}"

    # body was null in the original fetch call, so we send no body data.
    response = requests.post(url, timeout=20)
    response.raise_for_status()

    try:
        parsed = response.json()
    except ValueError:
        print(f"Response for {method} was not valid JSON. Raw response text:")
        print(response.text)
        return

    output_path = OUTPUT_DIR / output_filename
    output_path.write_text(json.dumps(parsed, indent=2), encoding="utf-8")
    print(f"Saved {method} response to {output_path}")


if __name__ == "__main__":
    fetch_and_write("getRoutes", "bus_routes_response.json")
    fetch_and_write("getRoutePatterns", "bus_route_patterns_response.json")