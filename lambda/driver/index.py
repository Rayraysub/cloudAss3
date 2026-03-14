import json
import os
import time
import urllib.request

import boto3
from boto3.dynamodb.conditions import Key


BUCKET_NAME = os.environ["BUCKET_NAME"]
PLOTTING_URL_PARAM = os.environ["PLOTTING_URL_PARAM"]
TABLE_NAME = os.environ["TABLE_NAME"]
SLEEP_SECONDS = int(os.environ.get("SLEEP_SECONDS", "1"))
PLOTTING_DELAY_SECONDS = int(os.environ.get("PLOTTING_DELAY_SECONDS", "2"))
WAIT_TIMEOUT_SECONDS = int(os.environ.get("WAIT_TIMEOUT_SECONDS", "30"))
POLL_INTERVAL_SECONDS = float(os.environ.get("POLL_INTERVAL_SECONDS", "1"))


def _clear_bucket(s3_client):
    paginator = s3_client.get_paginator("list_objects_v2")
    deleted = 0
    for page in paginator.paginate(Bucket=BUCKET_NAME):
        for obj in page.get("Contents", []):
            s3_client.delete_object(Bucket=BUCKET_NAME, Key=obj["Key"])
            deleted += 1
    return deleted


def _latest_bucket_size(table):
    response = table.query(
        KeyConditionExpression=Key("bucketName").eq(BUCKET_NAME),
        ScanIndexForward=False,
        Limit=1,
    )
    items = response.get("Items", [])
    if not items:
        return None
    return int(items[0].get("totalSize", 0))


def _wait_for_expected_size(table, expected_size):
    deadline = time.time() + WAIT_TIMEOUT_SECONDS
    while time.time() < deadline:
        latest_size = _latest_bucket_size(table)
        if latest_size == expected_size:
            return True
        time.sleep(POLL_INTERVAL_SECONDS)
    return False


def lambda_handler(_event, _context):
    s3 = boto3.client("s3")
    ssm = boto3.client("ssm")
    table = boto3.resource("dynamodb").Table(TABLE_NAME)
    steps = []

    deleted = _clear_bucket(s3)
    steps.append(f"Cleared bucket, deleted {deleted} object(s)")
    if deleted > 0:
        if _wait_for_expected_size(table, 0):
            steps.append("Observed DynamoDB size=0 after cleanup")
        else:
            steps.append("Timed out waiting for DynamoDB size=0 after cleanup")
    else:
        time.sleep(SLEEP_SECONDS)

    first_body = b"Empty Assignment 1"
    s3.put_object(Bucket=BUCKET_NAME, Key="assignment1.txt", Body=first_body)
    first_size = len(first_body)
    if _wait_for_expected_size(table, first_size):
        steps.append(f"Created assignment1.txt ({first_size} bytes)")
    else:
        steps.append(f"Timed out waiting for assignment1.txt create ({first_size} bytes)")

    second_body = b"Empty Assignment 2222222222"
    s3.put_object(Bucket=BUCKET_NAME, Key="assignment1.txt", Body=second_body)
    second_size = len(second_body)
    if _wait_for_expected_size(table, second_size):
        steps.append(f"Updated assignment1.txt ({second_size} bytes)")
    else:
        steps.append(f"Timed out waiting for assignment1.txt update ({second_size} bytes)")

    s3.delete_object(Bucket=BUCKET_NAME, Key="assignment1.txt")
    if _wait_for_expected_size(table, 0):
        steps.append("Deleted assignment1.txt (0 bytes)")
    else:
        steps.append("Timed out waiting for assignment1.txt delete (0 bytes)")

    final_body = b"33"
    s3.put_object(Bucket=BUCKET_NAME, Key="assignment2.txt", Body=final_body)
    final_size = len(final_body)
    if _wait_for_expected_size(table, final_size):
        steps.append(f"Created assignment2.txt ({final_size} bytes)")
    else:
        steps.append(f"Timed out waiting for assignment2.txt create ({final_size} bytes)")

    time.sleep(PLOTTING_DELAY_SECONDS)

    plot_result = None
    try:
        plotting_url = ssm.get_parameter(Name=PLOTTING_URL_PARAM)["Parameter"]["Value"]
        request = urllib.request.Request(plotting_url, method="GET")
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = response.read().decode("utf-8")
            plot_result = {"status": response.status, "responseBody": payload}
        steps.append("Called plotting API")
    except Exception as exc:
        steps.append(f"Plotting API call failed: {exc}")

    return {
        "statusCode": 200,
        "body": json.dumps(
            {
                "bucket": BUCKET_NAME,
                "steps": steps,
                "plotting": plot_result,
            }
        ),
    }