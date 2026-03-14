import json
import os
from datetime import datetime, timedelta, timezone

import boto3
from boto3.dynamodb.conditions import Key


BUCKET_NAME = os.environ["BUCKET_NAME"]
TABLE_NAME = os.environ["TABLE_NAME"]
TABLE_GSI_NAME = os.environ["TABLE_GSI_NAME"]
LAST_N_SECONDS = int(os.environ.get("LAST_N_SECONDS", "10"))
PLOT_KEY = "plot"


def _utc_iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _query_recent_items(table):
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=LAST_N_SECONDS)

    response = table.query(
        KeyConditionExpression=Key("bucketName").eq(BUCKET_NAME)
        & Key("timestamp").between(_utc_iso(cutoff), _utc_iso(now))
    )
    items = response.get("Items", [])

    while "LastEvaluatedKey" in response:
        response = table.query(
            KeyConditionExpression=Key("bucketName").eq(BUCKET_NAME)
            & Key("timestamp").between(_utc_iso(cutoff), _utc_iso(now)),
            ExclusiveStartKey=response["LastEvaluatedKey"],
        )
        items.extend(response.get("Items", []))

    items.sort(key=lambda item: item["timestamp"])
    return items


def _query_global_max_size(table):
    response = table.query(
        IndexName=TABLE_GSI_NAME,
        KeyConditionExpression=Key("globalKey").eq("ALL"),
        ScanIndexForward=False,
        Limit=1,
    )
    items = response.get("Items", [])
    if not items:
        return 0
    return int(items[0].get("totalSize", 0))


def _build_svg(points, max_size):
    width = 960
    height = 420
    pad_left = 70
    pad_right = 20
    pad_top = 30
    pad_bottom = 45

    plot_width = width - pad_left - pad_right
    plot_height = height - pad_top - pad_bottom

    y_max = max([p[1] for p in points], default=0)
    y_limit = max(40, y_max, max_size)

    def to_xy(index, size):
        x = pad_left if len(points) <= 1 else pad_left + (index * plot_width) / (len(points) - 1)
        y = pad_top + plot_height - (size / y_limit) * plot_height
        return x, y

    path = ""
    circles = []
    for i, point in enumerate(points):
        x, y = to_xy(i, point[1])
        path += f"{'M' if i == 0 else 'L'}{x:.1f},{y:.1f} "
        circles.append(f"<circle cx='{x:.1f}' cy='{y:.1f}' r='4' fill='#2563eb'/>")

    if max_size > 0:
        max_y = pad_top + plot_height - (max_size / y_limit) * plot_height
        max_line = (
            f"<line x1='{pad_left}' y1='{max_y:.1f}' x2='{width - pad_right}' y2='{max_y:.1f}' "
            "stroke='#dc2626' stroke-dasharray='6 4' stroke-width='2'/>"
        )
    else:
        max_line = ""

    labels = ""
    if points:
        first_label = points[0][0][11:23]
        last_label = points[-1][0][11:23]
        labels = (
            f"<text x='{pad_left}' y='{height - 22}' font-size='11' font-family='Arial'>{first_label}</text>"
            f"<text x='{width - pad_right - 90}' y='{height - 22}' font-size='11' font-family='Arial'>{last_label}</text>"
        )

    return f"""<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}'>
<rect x='0' y='0' width='{width}' height='{height}' fill='white'/>
<text x='{pad_left}' y='20' font-size='16' font-family='Arial'>S3 Bucket Size Change - {BUCKET_NAME}</text>
<line x1='{pad_left}' y1='{pad_top}' x2='{pad_left}' y2='{height - pad_bottom}' stroke='black'/>
<line x1='{pad_left}' y1='{height - pad_bottom}' x2='{width - pad_right}' y2='{height - pad_bottom}' stroke='black'/>
{max_line}
<path d='{path}' fill='none' stroke='#2563eb' stroke-width='2'/>
{''.join(circles)}
<text x='{width - 240}' y='20' font-size='12' font-family='Arial' fill='#dc2626'>Max Size Ever: {max_size} bytes</text>
<text x='{pad_left}' y='{height - 10}' font-size='12' font-family='Arial'>Recent updates (last {LAST_N_SECONDS}s)</text>
{labels}
</svg>"""


def lambda_handler(_event, _context):
    dynamodb = boto3.resource("dynamodb")
    s3 = boto3.client("s3")
    table = dynamodb.Table(TABLE_NAME)

    items = _query_recent_items(table)
    points = [(item["timestamp"], int(item.get("totalSize", 0))) for item in items]
    max_size = _query_global_max_size(table)

    svg = _build_svg(points, max_size)
    s3.put_object(
        Bucket=BUCKET_NAME,
        Key=PLOT_KEY,
        Body=svg.encode("utf-8"),
        ContentType="image/svg+xml",
    )

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(
            {
                "message": "Plot saved",
                "bucket": BUCKET_NAME,
                "key": PLOT_KEY,
                "points": len(points),
                "maxSizeEver": max_size,
            }
        ),
    }