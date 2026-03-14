#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { StorageStack } from '../lib/storage-stack';
import { LambdaStack } from '../lib/lambda-stack';
import { ApiStack } from '../lib/api-stack';

const app = new cdk.App();

const storageStack = new StorageStack(app, 'StorageStackV2');

const lambdaStack = new LambdaStack(app, 'LambdaStackV2', {
  table: storageStack.table,
  gsiName: storageStack.gsiName,
});

new ApiStack(app, 'ApiStackV2', {
  plotLambda: lambdaStack.plotLambda,
});