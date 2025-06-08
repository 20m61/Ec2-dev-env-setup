# Pending Tasks for EC2 Dev Environment Setup

This document lists follow-up tasks and improvements identified after reviewing the current implementation and architecture.

## Current Status
- Two-stack CDK design (`S3BucketStack` and `DevEnvStack`) is implemented.
- EC2 user-data downloads `.env` from S3 and installs development tools.
- CI/CD pipelines (GitHub Actions) run linting, formatting and tests.
- Documentation covers setup steps, security tips and cleanup instructions.

## Outstanding Tasks
1. **UserData reliability**
   - Gather `cloud-init-output.log` and `env_setup_script.log` from existing instances to confirm part two execution.
   - Add a log marker like `=== PART2 STARTED ===` at the start of the second script section and verify its presence via SSM.
   - Review OS and CDK version differences; adjust the multipart layout or use a fallback systemd unit if necessary.
2. **CI/CD automated checks**
   - Add a post-deploy job in GitHub Actions that runs `tools/ssm_check.sh` using the stack outputs.
   - Parse the script output and fail the workflow if Tailscale, Docker or code-server are missing.
   - Confirm `.env` variables and check S3 bucket encryption/versioning from the pipeline. Upload the logs as artifacts.
3. **Security operations**
   - Document a credential rotation procedure for both AWS keys and GitHub tokens, updating `.env` and re-uploading to S3.
   - Enable SSE-KMS encryption and versioning on the S3 bucket and restrict access to the EC2 instance role only.
4. **Documentation enhancements**
   - Add troubleshooting for SSM session errors and CloudFormation rollback recovery steps.
   - Expand the FAQ with guidance on locating user-data logs and common Tailscale/Docker issues.
5. **Operational scripts**
   - Create `gen-connection-info.sh` to output `ec2-connection-info.csv` and SSH config from stack outputs.
   - Provide a `cleanup-old-keys.sh` script to remove outdated key pairs and temporary files.
   - Schedule these utilities from GitHub Actions or manual scripts.

These tasks are derived from `ARCHITECTURE.md` and the existing README.
