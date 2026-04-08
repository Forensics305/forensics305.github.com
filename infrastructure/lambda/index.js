'use strict';

const {
  KinesisVideoClient,
  GetSignalingChannelEndpointCommand,
} = require('@aws-sdk/client-kinesis-video');

const {
  KinesisVideoSignalingClient,
  GetIceServerConfigCommand,
} = require('@aws-sdk/client-kinesis-video-signaling');

const CHANNEL_ARN = process.env.CHANNEL_ARN;
const REGION      = process.env.AWS_REGION;

const kvClient = new KinesisVideoClient({ region: REGION });

exports.handler = async () => {
  // Get the HTTPS endpoint for the signaling channel.
  const epRes = await kvClient.send(new GetSignalingChannelEndpointCommand({
    ChannelARN: CHANNEL_ARN,
    SingleMasterChannelEndpointConfiguration: {
      Protocols: ['HTTPS'],
      Role: 'VIEWER',
    },
  }));

  const httpsEndpoint = epRes.ResourceEndpointList
    .find(ep => ep.Protocol === 'HTTPS')?.ResourceEndpoint;

  if (!httpsEndpoint) {
    throw new Error('No HTTPS endpoint returned for KVS channel');
  }

  // Fetch fresh ICE server credentials from that endpoint.
  const sigClient = new KinesisVideoSignalingClient({
    region: REGION,
    endpoint: httpsEndpoint,
  });

  const iceRes = await sigClient.send(new GetIceServerConfigCommand({
    ChannelARN: CHANNEL_ARN,
  }));

  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    ...iceRes.IceServerList.map(s => ({
      urls: s.Uris,
      username: s.Username,
      credential: s.Password,
    })),
  ];

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify({ iceServers }),
  };
};
