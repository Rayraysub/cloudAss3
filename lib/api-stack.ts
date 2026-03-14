import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ssm from 'aws-cdk-lib/aws-ssm';

interface ApiStackProps extends cdk.StackProps {
  plotLambda: lambda.Function;
}

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const api = new apigateway.RestApi(this, 'AssignmentApi');

    const plotResource = api.root.addResource('plot');
    plotResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(props.plotLambda)
    );

    const plotUrl = `${api.url}plot`;

    new ssm.StringParameter(this, 'PlottingUrlParameter', {
      parameterName: '/assignment3/plotting-url',
      stringValue: plotUrl,
    });

    new cdk.CfnOutput(this, 'PlotApiUrl', {
      value: plotUrl,
    });
  }
}