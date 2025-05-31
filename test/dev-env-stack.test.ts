import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { DevEnvStack } from '../lib/dev-env-stack';

test('Stack synthesizes successfully', () => {
  const app = new App();
  const stack = new DevEnvStack(app, 'TestStack');
  const template = Template.fromStack(stack);
  expect(template).toBeDefined();
});
