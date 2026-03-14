import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class StorageStack extends cdk.Stack {
  public readonly table: dynamodb.Table;
  public readonly gsiName = 'GlobalMaxTotalSizeIndex';

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.table = new dynamodb.Table(this, 'S3ObjectSizeHistoryTable', {
      partitionKey: {
        name: 'bucketName',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    this.table.addGlobalSecondaryIndex({
      indexName: this.gsiName,
      partitionKey: {
        name: 'globalKey',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'totalSize',
        type: dynamodb.AttributeType.NUMBER,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });
  }
}