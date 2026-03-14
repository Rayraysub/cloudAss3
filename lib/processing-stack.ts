import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';

interface ProcessingStackProps extends cdk.StackProps {
  table: dynamodb.Table;
  gsiName: string;
}

export class ProcessingStack extends cdk.Stack {
  public readonly trackerLambda: lambda.Function;
  public readonly plotLambda: lambda.Function;
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: ProcessingStackProps) {
    super(scope, id, props);

    this.bucket = new s3.Bucket(this, 'TestBucket');

    this.trackerLambda = new lambda.Function(this, 'TrackerLambda', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset('lambda/tracker'),
      environment: {
        BUCKET_NAME: this.bucket.bucketName,
        TABLE_NAME: props.table.tableName,
      },
      timeout: cdk.Duration.seconds(30),
    });

    this.plotLambda = new lambda.Function(this, 'PlotLambda', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset('lambda/plot'),
      environment: {
        BUCKET_NAME: this.bucket.bucketName,
        TABLE_NAME: props.table.tableName,
        TABLE_GSI_NAME: props.gsiName,
        LAST_N_SECONDS: '60',
      },
      timeout: cdk.Duration.seconds(30),
    });

    this.bucket.grantReadWrite(this.trackerLambda);
    this.bucket.grantReadWrite(this.plotLambda);

    props.table.grantReadWriteData(this.trackerLambda);
    props.table.grantReadWriteData(this.plotLambda);

    this.bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(this.trackerLambda)
    );

    this.bucket.addEventNotification(
      s3.EventType.OBJECT_REMOVED,
      new s3n.LambdaDestination(this.trackerLambda)
    );
  }
}