import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as iam from 'aws-cdk-lib/aws-iam';

interface LambdaStackProps extends cdk.StackProps {
  table: dynamodb.Table;
  gsiName: string;
}

export class LambdaStack extends cdk.Stack {
  public readonly driverLambda: lambda.Function;
  public readonly trackerLambda: lambda.Function;
  public readonly plotLambda: lambda.Function;
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
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
        LAST_N_SECONDS: '10',
      },
      timeout: cdk.Duration.seconds(30),
    });

    this.driverLambda = new lambda.Function(this, 'DriverLambda', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset('lambda/driver'),
      environment: {
        BUCKET_NAME: this.bucket.bucketName,
        TABLE_NAME: props.table.tableName,
        PLOTTING_URL_PARAM: '/assignment3/plotting-url',
        SLEEP_SECONDS: '1',
        PLOTTING_DELAY_SECONDS: '2',
        WAIT_TIMEOUT_SECONDS: '30',
        POLL_INTERVAL_SECONDS: '1',
      },
      timeout: cdk.Duration.seconds(60),
    });

    this.bucket.grantReadWrite(this.driverLambda);
    this.bucket.grantReadWrite(this.trackerLambda);
    this.bucket.grantReadWrite(this.plotLambda);

    props.table.grantReadWriteData(this.driverLambda);
    props.table.grantReadWriteData(this.trackerLambda);
    props.table.grantReadWriteData(this.plotLambda);

    this.driverLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:parameter/assignment3/plotting-url`,
        ],
      })
    );

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