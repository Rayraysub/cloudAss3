import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';

interface ApiStackProps extends cdk.StackProps {
  plotLambda: lambda.Function;
}

export class ApiStack extends cdk.Stack {
  public readonly plotUrl: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const api = new apigateway.RestApi(this, 'AssignmentApi');

    const plotResource = api.root.addResource('plot');
    plotResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(props.plotLambda)
    );

    this.plotUrl = `${api.url}plot`;

    new cdk.CfnOutput(this, 'PlotApiUrl', {
      value: this.plotUrl,
    });
  }
}