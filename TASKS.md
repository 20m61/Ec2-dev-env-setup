# Pending Tasks for EC2 Dev Environment Setup

This document lists follow-up tasks and improvements identified after reviewing the current implementation and architecture.

## Current Status
- Two-stack CDK design (`S3BucketStack` and `DevEnvStack`) is implemented.
- EC2 user-data downloads `.env` from S3 and installs development tools.
- CI/CD pipelines (GitHub Actions) run linting, formatting and tests.
- Documentation covers setup steps, security tips and cleanup instructions.

## Outstanding Tasks
1. **UserData reliability**
   - Investigate cases where the second part of the multipart `user-data` does not run.
   - Add clear log output at the beginning of the second part for easier verification.
2. **CI/CD automated checks**
   - Integrate `tools/ssm_check.sh` into CI to automatically validate EC2 setup.
   - Verify `.env` content and S3 bucket permissions within the pipeline.
3. **Security operations**
   - Document and implement credential rotation for `.env` secrets.
   - Enable bucket encryption and versioning; restrict access to minimum required.
4. **Documentation enhancements**
   - Expand troubleshooting section with CloudFormation rollback steps and SSM usage tips.
   - Provide Q&A style tips for common issues.
5. **Operational scripts**
   - Automate generation of `ec2-connection-info.csv` and SSH config as part of deployment.
   - Consider scripted cleanup for old key pairs and temporary files.

These tasks are derived from `ARCHITECTURE.md` and the existing README.
