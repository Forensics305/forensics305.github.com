# AWS ICE Server Config Infrastructure

Deploys a Lambda + API Gateway endpoint that vends short-lived AWS KVS TURN credentials to the Forensics305 frontend.

## Prerequisites

- [AWS CLI](https://aws.amazon.com/cli/) configured (`aws configure`)
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- An S3 bucket in your account for SAM deployment artifacts (or let SAM create one)

## Deploy

```bash
cd infrastructure

# Install Lambda dependencies
cd lambda && npm install && cd ..

# Build + deploy (follow the interactive prompts the first time)
sam build
sam deploy --guided
```

When prompted, choose:
- **Stack name**: `forensics305-ice`
- **Region**: any region close to your users (e.g. `us-east-1`)
- **Confirm changes before deploy**: `Y`
- **Allow SAM CLI IAM role creation**: `Y`
- **Save arguments to samconfig.toml**: `Y`

After deployment completes, SAM prints the `IceConfigUrl` output. Copy that URL.

## Wire up the frontend

Open `app.js` and replace the placeholder:

```js
const ICE_CONFIG_URL = 'https://YOUR_API_GATEWAY_URL/ice-config';
```

…with the URL from the SAM output:

```js
const ICE_CONFIG_URL = 'https://<id>.execute-api.<region>.amazonaws.com/ice-config';
```

## Costs

| Resource | Free tier | After free tier |
|---|---|---|
| Lambda invocations | 1 M / month | ~$0.20 / 1 M |
| API Gateway HTTP API calls | 1 M / month | ~$1 / 1 M |
| KVS Signaling (TURN relay) | — | ~$0.03 / 1 000 mins relayed |

For a small game with occasional players the cost is effectively zero.

## Tear down

```bash
sam delete --stack-name forensics305-ice
```
