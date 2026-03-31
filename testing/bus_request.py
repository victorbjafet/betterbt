import json

import requests


url = (
    "https://ridebt.org/index.php?option=com_ajax&module=bt_map&method=getBuses"
    "&format=json&Itemid=101&method=getBuses"
)

# body was null in the original fetch call, so we send no body data.
response = requests.post(url, timeout=20)
response.raise_for_status()

try:
    parsed = response.json()
    print(json.dumps(parsed, indent=2))
except ValueError:
    print("Response was not valid JSON. Raw response text:")
    print(response.text)