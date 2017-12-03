
# icebreaker.io-client

icebreaker.io enables peer-to-peer real-time communications, using WebRTC technology. It is built on top of [socket.io](https://github.com/socketio/socket.io), and it basically allows two peers to resolve how to connect over the internet and start an RTCPeerConnection. It consists in:

- a [Node.js signaling server](https://github.com/elbecita/icebreaker.io-client)
- a Javascript client library (this repository) for the browser


## Installation

```bash
npm install icebreaker.io-client --save
```

## How to use

icebreaker.io-client uses the same interface as [socket.io-client](https://github.com/socketio/socket.io-client), since it is built on top of it. As an example, below you can find how to initialize it using ES6 import:

```js
import client from 'icebreaker.io-client';
const webrtcClient = client('https://localhost:8443', {
	path: '/socket'
});
```
Once the client has been initialized, the webrtc connection can be started as showed below:

```js
// These are events you can subscribe to:
webrtcClient.events.connectionEnded.addOnce(yourConnectionEndedHandler);
webrtcClient.events.getUserMediaError.addOnce(yourGetUserMediaErrorHandler);
webrtcClient.events.localStreamReady.addOnce(yourLocalStreamReadyHandler);
webrtcClient.events.remoteStreamReady.addOnce(yourRemoteStreamHandler);

// All the properties are optional
const webrtcProps = {
  connId: 'my-test-connection',
  mediaConstraints: {
    audio: true,
    video: true
  },
  configuration: {
    iceServers: [
      { url: 'stun:stun.l.google.com:19302' }
    ]
  }
};
webrtcClient.start(webrtcProps).then(connId => {
  console.log('>>>>> The connection id is: ', connId);
});
```

The same code can be used for the two peers. If a peer is joining a connection that exists and that has another peer already in, the WebRTC connection between the two will be established. The remote stream can be accessed through the `remoteStreamReady` event.

### Demo project
You can find a fully working demo project that uses both server and client icebreaker.io libraries [here](https://github.com/elbecita/icebreaker.io-demo). It is a very basic video-chat application.

## Tests

```
npm run test
```
This command runs the `gulp` task `test`, which runs the unit tests in the `tests` directory.


## License

[GPLv3](LICENSE)
