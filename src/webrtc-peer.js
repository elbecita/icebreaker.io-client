'use strict';

require('webrtc-adapter');
const socketEvents = require('./events/socket-events');
const localEvents = require('./events/local-events');

class WebrtcPeer {
  constructor(_props) {
    const props = _props || {};
    this.configuration = props.configuration;
    this.mediaConstraints = props.mediaConstraints || {
      audio: true,
      video: true
    };
    this.socket = props.socket;
    this.connId = props.connId;
    this.pc = null;
    this.remoteIceCandidatesUnprocessed = [];

    this.localStream = null;
    this.remoteStream = null;

    // PeerConnection event handlers:
    this._onPeerConnectionAddStream = this._onPeerConnectionAddStream.bind(this);
    this._onPeerConnectionLocalIceCandidate = this._onPeerConnectionLocalIceCandidate.bind(this);
    this._onPeerConnectionIceConnectionStateChange =
      this._onPeerConnectionIceConnectionStateChange.bind(this);

    // Socket event handlers:
    this._onRemoteIceCandidate = this._onRemoteIceCandidate.bind(this);
    this._onRemotePeerJoined = this._onRemotePeerJoined.bind(this);
    this._onRemoteSdp = this._onRemoteSdp.bind(this);
    this._onRemoteStop = this._onRemoteStop.bind(this);

    this._bindSocketEventHandlers = this._bindSocketEventHandlers.bind(this);
    this._createPeerConnection = this._createPeerConnection.bind(this);
    this._processLocalSdp = this._processLocalSdp.bind(this);
    this._processQueuedIceCandidates = this._processQueuedIceCandidates.bind(this);
    this._sdpExchange = this._sdpExchange.bind(this);
    this.start = this.start.bind(this);

    this._bindSocketEventHandlers();
  }

  _bindSocketEventHandlers() {
    this.socket.on(socketEvents.inbound.REMOTE_ICE_CANDIDATE, this._onRemoteIceCandidate);
    this.socket.on(socketEvents.inbound.REMOTE_PEER_JOINED, this._onRemotePeerJoined);
    this.socket.on(socketEvents.inbound.REMOTE_SDP, this._onRemoteSdp);
    this.socket.on(socketEvents.inbound.REMOTE_STOP, this._onRemoteStop);
  }

  _createPeerConnection() {
    this.pc = new RTCPeerConnection(this.configuration);

    // Bind events
    this.pc.onaddstream = this._onPeerConnectionAddStream;
    this.pc.onicecandidate = this._onPeerConnectionLocalIceCandidate;
    this.pc.oniceconnectionstatechange = this._onPeerConnectionIceConnectionStateChange;
  }

  /**
  * pc.onaddstream: fired when the remote stream is set.
  * Sends a local event so the client knows there is a remote stream.
  */
  _onPeerConnectionAddStream(event) {
    this.remoteStream = event.stream;
    localEvents.remoteStreamReady.dispatch({
      connId: this.connId,
      peerId: this.socket.id,
      stream: this.remoteStream
    });
  }

  /**
  * pc.onicecandidate: fired when a local ice candidate is discovered.
  * Sends the local candidate to the signaling server so it can be passed to the
  * remote peer.
  */
  _onPeerConnectionLocalIceCandidate(event) {
    const socketEvent = {
      data: {
        connId: this.connId,
        candidate: event.candidate
      }
    };
    this.socket.emit(socketEvents.outbound.ICE_CANDIDATE, socketEvent);
  }

  /**
  * pc.oniceconnectionstatechange: fired when the ice connection state changes.
  *  - if closed: means the connection ended. Sends a local event so the client knows.
  *  - if failed: means the connection could not be completed. Stops.
  */
  _onPeerConnectionIceConnectionStateChange() {
    if (this.pc) {
      switch (this.pc.signalingState) {
        case 'closed':
          localEvents.connectionEnded.dispatch();
          break;
        case 'failed':
          // TODO: send a local event and let the client decide what to do.
          this.stop();
          break;
        default:
          break;
      }
    }
  }

  /**
  * It adds to the peer connection the remote ICE candidate received from the signaling server.
  */
  _onRemoteIceCandidate(socketEvent) {
    const data = socketEvent.data || {};

    if (data.candidate) {
      const remoteCandidate = new RTCIceCandidate(data.candidate);
      // ICE candidates can't be added without setting the remote description
      if (!this.pc || !this.pc.remoteDescription.type) {
        this.remoteIceCandidatesUnprocessed.push(data.candidate);
      } else {
        this.pc.addIceCandidate(remoteCandidate);
      }
    }
  }

  /**
  * Starts the SDP exchange when the signaling server alerts that a remote peer has joined.
  */
  _onRemotePeerJoined() {
    this._sdpExchange();
  }

  /**
  * Remote SDP file received.
  *  - if it's the peer who initiaited the connection, they need to set the sdp (their peer
  *    connection is already initialized).
  *  - if it's the offeree, they need to start their peer connection.
  */
  _onRemoteSdp(socketEvent) {
    const data = socketEvent.data || {};

    if (data.sdp) {
      const remoteDesc = new RTCSessionDescription(data.sdp);
      if (this.pc) {
        this.pc.setRemoteDescription(remoteDesc)
          .then(this._processQueuedIceCandidates);
      } else {
        this.start(remoteDesc)
          .then(this._processQueuedIceCandidates);
      }
    }
  }

  /**
  * The signaling server sent a message informing that the other peer closed their connection.
  * Stop.
  */
  _onRemoteStop() {
    this.stop();
  }

  /**
  * Sets the local SDP and sends it to the signaling server so it can be passed to the remote peer.
  */
  _processLocalSdp(sdp) {
    return this.pc.setLocalDescription(sdp)
      .then(() => {
        const socketEvent = {
          data: {
            connId: this.connId,
            sdp: this.pc.localDescription
          }
        };
        this.socket.emit(socketEvents.outbound.SDP, socketEvent);
      });
  }

  /**
  * Adds all the ice candidates that were queued because the remote description was
  * not yet set.
  */
  _processQueuedIceCandidates() {
    this.remoteIceCandidatesUnprocessed.forEach((remoteCandidate) => {
      this.pc.addIceCandidate(remoteCandidate);
    });
  }

  /**
  * Sets the local stream.
  *   If initiator of the connection: creates an SDP offer.
  *   Else: creates an SDP answer.
  * Process the local SDP.
  */
  _sdpExchange(remoteSdp) {
    this.pc.addStream(this.localStream);
    let sdpExchangeTask;
    if (remoteSdp) {
      sdpExchangeTask = this.pc.createAnswer();
    } else {
      sdpExchangeTask = this.pc.createOffer();
    }
    sdpExchangeTask
      .then(this._processLocalSdp);
  }

  /**
  * Starts a webrtc connection.
  * @param {string} [remoteSdp] If this is the offeree peer, a remoteSdp should be provided (the
  * offer from the the initiator) and must be set in the peer connection and sent as sdp answer
  * to the signaling server so it can be passed to the remote peer.
  */
  start(remoteSdp) {
    this._createPeerConnection();
    let setRemoteDescriptionTask = Promise.resolve();

    // If start called through onRemoteSdp, remote sdp file needs to be set.
    if (remoteSdp) {
      setRemoteDescriptionTask = this.pc.setRemoteDescription(remoteSdp);
    }

    return setRemoteDescriptionTask
      .then(() => navigator.mediaDevices.getUserMedia(this.mediaConstraints))
      .then((stream) => {
        this.localStream = stream;
        localEvents.localStreamReady.dispatch({
          connId: this.connId,
          peerId: this.socket.id,
          stream: this.localStream
        });

        // If start called through onRemoteSdp both peers are connected, make local
        // one send its sdp file
        if (remoteSdp) {
          return this._sdpExchange(remoteSdp);
        }

        return Promise.resolve();
      },
      (getUserMediaError) => {
        localEvents.getUserMediaError.dispatch({
          connId: this.connId,
          peerId: this.socket.id,
          error: getUserMediaError
        });
      });
  }

  /**
  * Stops the webrtc connection.
  */
  stop() {
    if (this.localStream &&
      typeof this.localStream.getTracks === 'function') {
      this.localStream.getTracks().forEach(track => track.stop());
    }
    if (this.pc && typeof this.pc.close === 'function') {
      this.pc.close();
    }
    localEvents.connectionEnded.dispatch();
  }

}

module.exports = WebrtcPeer;
