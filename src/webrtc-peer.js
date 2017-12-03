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

    this.localVideoStream = null;
    this.remoteVideoStream = null;

    // PeerConnection event handlers:
    this._onPeerConnectionAddStream = this._onPeerConnectionAddStream.bind(this);
    this._onPeerConnectionIceCandidate = this._onPeerConnectionIceCandidate.bind(this);
    this._onPeerConnectionSignalingStateChange = this._onPeerConnectionSignalingStateChange.bind(this);

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
    this.pc.onicecandidate = this._onPeerConnectionIceCandidate;
    this.pc.onsignalingstatechange = this._onPeerConnectionSignalingStateChange;
  }

  _onPeerConnectionAddStream(event) {
    this.remoteVideoStream = event.stream;
    localEvents.remoteVideoReady.dispatch({
      connId: this.connId,
      peerId: this.socket.id,
      stream: this.remoteVideoStream
    });
  }

  _onPeerConnectionIceCandidate(event) {
    const socketEvent = {
      data: {
        connId: this.connId,
        candidate: event.candidate
      }
    };
    this.socket.emit(socketEvents.outbound.ICE_CANDIDATE, socketEvent);
  }

  _onPeerConnectionSignalingStateChange() {
    if (this.pc) {
      switch(this.pc.signalingState) {
        case 'closed':
          localEvents.connectionEnded.dispatch();
          break;
        case 'failed':
          this.stop();
          break;
      }
    }
  }

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

  _onRemotePeerJoined() {
    this._sdpExchange();
  }

  _onRemoteSdp(socketEvent) {
    const data = socketEvent.data || {};

    if (data.sdp) {
      const remoteDesc = new RTCSessionDescription(data.sdp);
      // If peerConnection exists, this is the offeror receiving the remote
      // offer from the other peer. Otherwise, this is the offeree and needs to
      // initialize its pc.
      if (this.pc) {
        return this.pc.setRemoteDescription(remoteDesc)
          .then(this._processQueuedIceCandidates);
      }
      return this.start(remoteDesc)
        .then(this._processQueuedIceCandidates);
    }
  }

  _onRemoteStop() {
    this.stop();
  }

  _processLocalSdp(sdp) {
    return this.pc.setLocalDescription(sdp)
      .then(() => {
        const socketEvent = {
          data: {
            connId: this.connId,
            sdp: this.pc.localDescription }
        };
        this.socket.emit(socketEvents.outbound.SDP, socketEvent);
      });
  }

  _processQueuedIceCandidates() {
    this.remoteIceCandidatesUnprocessed.forEach(remoteCandidate => {
      this.pc.addIceCandidate(remoteCandidate);
    });
  }

  _sdpExchange(remoteSdp) {
    this.pc.addStream(this.localVideoStream);
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
      .then(stream => {
        this.localVideoStream = stream;
        localEvents.localVideoReady.dispatch({
          connId: this.connId,
          peerId: this.socket.id,
          stream: this.localVideoStream
        });

        // If start called through onRemoteSdp both peers are connected, make local
        // one send its sdp file
        if (remoteSdp) {
          return this._sdpExchange(remoteSdp);
        }
      });
  }

  /**
  * Stops the webrtc connection.
  */
  stop() {
    if (this.localVideoStream &&
      typeof this.localVideoStream.getTracks === 'function') {
      this.localVideoStream.getTracks().forEach(track => track.stop());
    }
    if (this.pc && typeof this.pc.close === 'function') {
      this.pc.close();
      //delete this.pc;
    }
    localEvents.connectionEnded.dispatch();
  }

}

module.exports = WebrtcPeer;