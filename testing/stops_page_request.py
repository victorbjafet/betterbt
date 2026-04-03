import requests


URL = "https://ridebt.org/index.php/routes-schedules?route=SME&routeView=trips"

HEADERS = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "max-age=0",
    "upgrade-insecure-requests": "1",
}


def main() -> None:
    response = requests.get(URL, headers=HEADERS, timeout=20)
    response.raise_for_status()
    print(f"status={response.status_code} bytes={len(response.text)}")


if __name__ == "__main__":
    main()