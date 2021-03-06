'use strict';

const io = require('socket.io-client');
const WebrtcPeer = require('./webrtc-peer');
const socketEvents = require('./events/socket-events');
const localEvents = require('./events/local-events');

class _Client {
  constructor(uri, opts) {
    this.socket = io(uri, opts);
    this.id = null;
    this.connId = null;
    this.webrtcPeer = null;
    this.events = localEvents;

    // Binding
    this._initWebrtcConnection - this._initWebrtcConnection.bind(this);
    this._dispose = this._dispose.bind(this);
    this._onConnect = this._onConnect.bind(this);
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);

    this.socket.on('connect', this._onConnect);
  }

  _initWebrtcConnection(connId, startPeerConnection, startProps) {
    const webrtcPeerProps = {
      connId,
      socket: this.socket,
      configuration: startProps.configuration,
      mediaConstraints: startProps.mediaConstraints
    };
    this.webrtcPeer = new WebrtcPeer(webrtcPeerProps);
    // If this is the offeror, start the peer connection:
    if (startPeerConnection) {
      this.webrtcPeer.start();
    }

    this.events.connectionEnded.addOnce(this._dispose);
  }

  _dispose() {
    if (this.socket) {
      this.socket.disconnect();
      delete this.socket;
    }
  }

  _onConnect(){
    this.id = this.socket.id;
  }

  start(_props) {
    const props = _props || {};
    return new Promise((resolve, reject) => {
      const event = {
        data: { connId: props.connId }
      };
      this.socket.emit(socketEvents.outbound.START, event,
        response => {
          if (response.success) {
            this.connId = response.data.connId;
            this._initWebrtcConnection(response.data.connId, response.data.isNew, props);
            return resolve(response.data.connId);
          }
          return reject(response.data.error);
        });
    });
  }

  stop() {
    if (this.webrtcPeer) {
      this.webrtcPeer.stop();
    }
    this._dispose();
  }
}

// This allows calling signalingServer without the 'new'
const Client = (uri, opts) => {
  return new _Client(uri, opts);
}

module.exports = Client;