import json
import os
from datetime import datetime, timezone

import boto3


TABLE_NAME = os.environ["TABLE_NAME"]
EXCLUDED_KEYS = {"plot"}


def _utc_timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _bucket_stats(bucket_name: str) -> tuple[int, int]:
    s3 = boto3.client("s3")
    paginator = s3.get_paginator("list_objects_v2")

    total_size = 0
    object_count = 0
    for page in paginator.paginate(Bucket=bucket_name):
        for obj in page.get("Contents", []):
            if obj.get("Key") in EXCLUDED_KEYS:
                continue
            total_size += int(obj.get("Size", 0))
            object_count += 1

    return total_size, object_count


def lambda_handler(event, _context):
    records = event.get("Records", [])
    if not records:
        return {"statusCode": 400, "body": json.dumps({"message": "No S3 records"})}

    bucket_name = records[0]["s3"]["bucket"]["name"]
    total_size, object_count = _bucket_stats(bucket_name)
    timestamp = _utc_timestamp()

    table = boto3.resource("dynamodb").Table(TABLE_NAME)
    table.put_item(
        Item={
            "bucketName": bucket_name,
            "timestamp": timestamp,
            "totalSize": total_size,
            "objectCount": object_count,
            "globalKey": "ALL",
        }
    )

    return {
        "statusCode": 200,
        "body": json.dumps(
            {
                "bucketName": bucket_name,
                "timestamp": timestamp,
                "totalSize": total_size,
                "objectCount": object_count,
            }
        ),
    }