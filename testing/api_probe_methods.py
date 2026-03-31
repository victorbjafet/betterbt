import json
from pathlib import Path
from urllib.parse import quote

import requests

BASE = 'https://ridebt.org/index.php?option=com_ajax&module=bt_map&format=json&Itemid=101'
OUTDIR = Path('testing/api_probe')
OUTDIR.mkdir(parents=True, exist_ok=True)

METHODS = [
    'getBuses',
    'getRoutes',
    'getRoutePatterns',
    'getPatternPoints',
    'getNextDeparturesForStop',
    'getActiveAlerts',
]

PATTERNS = ['CAS to Orange', 'PRG', 'CRC OB', 'HXP FR']
STOP_CODES = ['1143', '1303', '1204']


def hit(url: str, out_file: Path) -> dict:
    resp = requests.post(url, timeout=45)
    out_file.write_text(resp.text, encoding='utf-8')
    payload = {'status': resp.status_code, 'ok': False, 'summary': '', 'data_len': None}

    try:
        body = resp.json()
    except Exception:
        payload['summary'] = resp.text[:220].replace('\n', ' ')
        return payload

    payload['ok'] = bool(body.get('success')) if isinstance(body, dict) else False
    data = body.get('data') if isinstance(body, dict) else None
    if isinstance(data, list):
        payload['data_len'] = len(data)
        payload['summary'] = f'list({len(data)})'
    elif isinstance(data, dict):
        payload['data_len'] = len(data)
        payload['summary'] = f'dict({len(data)})'
    else:
        payload['summary'] = str(type(data).__name__)

    return payload


def main() -> None:
    report = {'base': BASE, 'methods': {}, 'pattern_points': {}, 'next_departures': {}}

    for method in METHODS:
        url = f'{BASE}&method={method}'
        out = OUTDIR / f'{method}.json'
        report['methods'][method] = hit(url, out)

    for pattern in PATTERNS:
        url = f'{BASE}&method=getPatternPoints&patternName={quote(pattern)}'
        key = pattern.replace(' ', '_')
        out = OUTDIR / f'getPatternPoints_{key}.json'
        result = hit(url, out)

        try:
            payload = json.loads(out.read_text(encoding='utf-8'))
            data = payload.get('data') if isinstance(payload, dict) else None
            if isinstance(data, list) and data:
                first = data[0]
                result['sample'] = {
                    'patternPointName': first.get('patternPointName'),
                    'latitude': first.get('latitude'),
                    'longitude': first.get('longitude'),
                    'isBusStop': first.get('isBusStop'),
                    'stopCode': first.get('stopCode'),
                }
        except Exception:
            pass

        report['pattern_points'][pattern] = result

    for stop_code in STOP_CODES:
        url = f'{BASE}&method=getNextDeparturesForStop&stopCode={quote(stop_code)}&numOfTrips=3'
        out = OUTDIR / f'getNextDeparturesForStop_{stop_code}.json'
        result = hit(url, out)
        report['next_departures'][stop_code] = result

    report_path = OUTDIR / 'api_probe_report.json'
    report_path.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f'Wrote {report_path}')
    print(json.dumps(report, indent=2)[:4000])


if __name__ == '__main__':
    main()
