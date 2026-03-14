#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { StorageStack } from '../lib/storage-stack';
import { ProcessingStack } from '../lib/processing-stack';
import { ApiStack } from '../lib/api-stack';
import { DriverStack } from '../lib/driver-stack';

const app = new cdk.App();

const storageStack = new StorageStack(app, 'StorageStackV2');

const processingStack = new ProcessingStack(app, 'ProcessingStackV2', {
  table: storageStack.table,
  gsiName: storageStack.gsiName,
});

const apiStack = new ApiStack(app, 'ApiStackV2', {
  plotLambda: processingStack.plotLambda,
});

new DriverStack(app, 'DriverStackV2', {
  bucket: processingStack.bucket,
  table: storageStack.table,
  plottingUrl: apiStack.plotUrl,
});