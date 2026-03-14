import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

interface DriverStackProps extends cdk.StackProps {
  bucket: s3.Bucket;
  table: dynamodb.Table;
  plottingUrl: string;
}

export class DriverStack extends cdk.Stack {
  public readonly driverLambda: lambda.Function;

  constructor(scope: Construct, id: string, props: DriverStackProps) {
    super(scope, id, props);

    this.driverLambda = new lambda.Function(this, 'DriverLambda', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset('lambda/driver'),
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        TABLE_NAME: props.table.tableName,
        PLOTTING_URL: props.plottingUrl,
        SLEEP_SECONDS: '1',
        PLOTTING_DELAY_SECONDS: '2',
        WAIT_TIMEOUT_SECONDS: '30',
        POLL_INTERVAL_SECONDS: '1',
      },
      timeout: cdk.Duration.seconds(60),
    });

    props.bucket.grantReadWrite(this.driverLambda);
    props.table.grantReadWriteData(this.driverLambda);
  }
}