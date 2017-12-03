'use strict';

const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const expect = chai.expect;
chai.use(sinonChai);

const localEvents = require('../src/events/local-events');
const socketEvents = require('../src/events/socket-events');
const WebrtcPeer = require('../src/webrtc-peer');

const socketMock = {
  id: 'icebreaker.io-client-test-socket-id',
  disconnect: () => {},
  emit: () => {},
  on: () => {}
};

describe('WebrtcPeer tests', () => {
  let sinonSandbox;
  beforeEach(() => {
    sinonSandbox = sinon.sandbox.create();
  });
  afterEach(() => {
    sinonSandbox.restore();
  });

  describe('constructor()', () => {
    it('should initialize the peer with the provided options', () => {
      // Arrange
      const props = {
        configuration: 'test-configuration',
        mediaConstraints: 'test-media-constraints',
        socket: socketMock,
        connId: 'test-connId'
      };

      // Act
      const webrtcPeer = new WebrtcPeer(props);

      // Assert
      expect(webrtcPeer.configuration).to.equal(props.configuration);
      expect(webrtcPeer.mediaConstraints).to.equal(props.mediaConstraints);
      expect(webrtcPeer.socket.id).to.equal(props.socket.id);
      expect(webrtcPeer.connId).to.equal(props.connId);
      expect(webrtcPeer.pc).to.be.null;
      expect(webrtcPeer.remoteIceCandidatesUnprocessed).to.be.empty;
      expect(webrtcPeer.localVideoStream).to.be.null;
      expect(webrtcPeer.remoteVideoStream).to.be.null;
    });

    it('should initialize the peer with default mediaConstraints if none provided', () => {
      // Arrange
      const props = {
        configuration: 'test-configuration',
        socket: socketMock,
        connId: 'test-connId'
      };

      // Act
      const webrtcPeer = new WebrtcPeer(props);

      // Assert
      expect(webrtcPeer.mediaConstraints.audio).to.be.true;
      expect(webrtcPeer.mediaConstraints.video).to.be.true;
    });
  });

  describe('_bindSocketEventHandlers()', () => {
    it('should bind all socket events', () => {
      // Arrange
      const props = {
        socket: socketMock,
        connId: 'test-connId'
      };
      const webrtcPeer = new WebrtcPeer(props);
      const onSpy = sinonSandbox.spy(webrtcPeer.socket, 'on');

      // Act
      webrtcPeer._bindSocketEventHandlers();

      // Assert
      expect(onSpy).to.have.been.calledWith(socketEvents.inbound.REMOTE_ICE_CANDIDATE);
      expect(onSpy).to.have.been.calledWith(socketEvents.inbound.REMOTE_PEER_JOINED);
      expect(onSpy).to.have.been.calledWith(socketEvents.inbound.REMOTE_SDP);
      expect(onSpy).to.have.been.calledWith(socketEvents.inbound.REMOTE_STOP);
    });
  });

  describe('_createPeerConnection()', () => {
    it('should create the RTC peer connection', () => {
      // Arrange
      const testRTCPeerConnection = function() {
        this.onaddstream = null;
        this.onicecandidate = null;
        this.onsignalingstatechange = null;
      };
      global.RTCPeerConnection = testRTCPeerConnection;
      const webrtcPeer = new WebrtcPeer({ socket: socketMock });

      // Act
      webrtcPeer._createPeerConnection();

      // Assert
      expect(webrtcPeer.pc).to.be.instanceOf(testRTCPeerConnection);
      expect(webrtcPeer.pc.onaddstream).to.be.a('function');
      expect(webrtcPeer.pc.onicecandidate).to.be.a('function');
      expect(webrtcPeer.pc.onsignalingstatechange).to.be.a('function');
    })
  });

  describe('_onPeerConnectionAddStream()', () => {
    it('should dispatch a local remoteVideoReady event with the received stream', done => {
      // Arrange
      const props = {
        socket: socketMock,
        connId: 'test-connId'
      };
      const pcEvent = {
        stream: 'test-remote-video-stream'
      };
      const webrtcPeer = new WebrtcPeer(props);
      sinonSandbox.stub(localEvents.remoteVideoReady, 'dispatch')
        .callsFake(localEvent => {
          // Assert
          expect(localEvent.connId).to.equal(props.connId);
          expect(localEvent.peerId).to.equal(props.socket.id);
          expect(localEvent.stream).to.equal(pcEvent.stream);
          expect(webrtcPeer.remoteVideoStream).to.equal(pcEvent.stream);
          done();
        });

      // Act
      webrtcPeer._onPeerConnectionAddStream(pcEvent);
    });
  });

  describe('_onPeerConnectionIceCandidate()', () => {
    it('should emit a socket event with the received ice candidate', done => {
      // Arrange
      const props = {
        socket: socketMock,
        connId: 'test-connId'
      };
      const pcEvent = {
        candidate: 'test-ice-candidate'
      };
      const webrtcPeer = new WebrtcPeer(props);
      sinonSandbox.stub(webrtcPeer.socket, 'emit')
        .callsFake((eventName, event) => {
          // Assert
          expect(eventName).to.equal(socketEvents.outbound.ICE_CANDIDATE);
          expect(event.data.connId).to.equal(props.connId);
          expect(event.data.candidate).to.equal(pcEvent.candidate);
          done();
        });

      // Act
      webrtcPeer._onPeerConnectionIceCandidate(pcEvent);
    });
  });

  describe('_onPeerConnectionSignalingStateChange', () => {
    it('should dispatch a local connectionEnded event if the signalingState of the peer ' +
      'connection is closed', () => {
      // Arrange
      const webrtcPeer = new WebrtcPeer({ socket: socketMock });
      webrtcPeer.pc = { signalingState: 'closed' };
      const dispatchStub = sinonSandbox.stub(localEvents.connectionEnded, 'dispatch')
        .callsFake(() => {});

      // Act
      webrtcPeer._onPeerConnectionSignalingStateChange();

      // Assert
      expect(dispatchStub).to.have.been.calledOnce;
    });

    it('should dispatch stop the RTC peer connection if the signalingState of the peer ' +
      'connection is failed', () => {
      // Arrange
      const webrtcPeer = new WebrtcPeer({ socket: socketMock });
      webrtcPeer.pc = { signalingState: 'failed' };
      const stopStub = sinonSandbox.stub(webrtcPeer, 'stop')
        .callsFake(() => {});

      // Act
      webrtcPeer._onPeerConnectionSignalingStateChange();

      // Assert
      expect(stopStub).to.have.been.calledOnce;
    });
  });

  describe('_onRemoteIceCandidate', () => {
    before(() => {
      // Arrange
      const testRTCIceCandidate = function() {
        this.id = 'test-ice-candidate';
      };
      global.RTCIceCandidate = testRTCIceCandidate;
    });

    it('should save the ice candidate in the unprocessed queue if the RTC peer ' +
      'connection has not been initialized', () => {
      // Arrange
      const webrtcPeer = new WebrtcPeer({ socket: socketMock });
      webrtcPeer.pc = undefined;
      const iceCandidate = 'test-ice-candidate';
      const socketEvent = {
        data: { candidate: iceCandidate }
      };

      // Act
      webrtcPeer._onRemoteIceCandidate(socketEvent);

      // Assert
      expect(webrtcPeer.remoteIceCandidatesUnprocessed[0]).to.equal(iceCandidate);
    });

    it('should save the ice candidate in the unprocessed queue if the remote ' +
      'sdp has not been set in the peer connection', () => {
      // Arrange
      const webrtcPeer = new WebrtcPeer({ socket: socketMock });
      webrtcPeer.pc = { remoteDescription: {} };
      const iceCandidate = 'test-ice-candidate';
      const socketEvent = {
        data: { candidate: iceCandidate }
      };

      // Act
      webrtcPeer._onRemoteIceCandidate(socketEvent);

      // Assert
      expect(webrtcPeer.remoteIceCandidatesUnprocessed[0]).to.equal(iceCandidate);
    });

    it('should add the ice candidate to the peer connection if the remote sdp ' +
      'has been already set', () => {
      // Arrange
      const webrtcPeer = new WebrtcPeer({ socket: socketMock });
      const iceCandidate = 'test-ice-candidate';
      const socketEvent = {
        data: { candidate: iceCandidate }
      };
      webrtcPeer.pc = {
        remoteDescription: {
          type: 'type-exists'
        },
        addIceCandidate: () => {}
      };
      const addSpy = sinonSandbox.spy(webrtcPeer.pc, 'addIceCandidate');

      // Act
      webrtcPeer._onRemoteIceCandidate(socketEvent);

      // Assert
      expect(addSpy).to.have.been.calledOnce;
    });

    it('should do nothing if no candidate is received', () => {
      // Arrange
      const webrtcPeer = new WebrtcPeer({ socket: socketMock });
      webrtcPeer.pc = {
        remoteDescription: {
          type: 'type-exists'
        },
        addIceCandidate: () => {}
      };
      const addSpy = sinonSandbox.spy(webrtcPeer.pc, 'addIceCandidate');

      // Act
      webrtcPeer._onRemoteIceCandidate({});

      // Assert
      expect(addSpy).to.have.callCount(0);
      expect(webrtcPeer.remoteIceCandidatesUnprocessed).to.be.empty;
    });
  });
});
