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

  describe('_onPeerConnectionSignalingStateChange()', () => {
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

  describe('_onRemoteIceCandidate()', () => {
    before(() => {
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
      const RTCIceCandidateSpy = sinonSandbox.spy(RTCIceCandidate, 'constructor');

      // Act
      webrtcPeer._onRemoteIceCandidate({});

      // Assert
      expect(RTCIceCandidateSpy).to.have.callCount(0);
      expect(webrtcPeer.remoteIceCandidatesUnprocessed).to.be.empty;
    });
  });

  describe('_onRemotePeerJoined()', () => {
    it('should do the sdp exchange', () => {
      const webrtcPeer = new WebrtcPeer({ socket: socketMock });
      const sdpExchangeStub = sinonSandbox.stub(webrtcPeer, '_sdpExchange')
        .callsFake(() => {});
      webrtcPeer._onRemotePeerJoined();
      expect(sdpExchangeStub).to.have.been.calledOnce;
    });
  });

  describe('_onRemoteSdp()', () => {
    before(() => {
      const testRTCSessionDescription = function() {
        this.id = 'test-session-description';
      };
      global.RTCSessionDescription = testRTCSessionDescription;
    });

    it('should set the remote sdp if there is an RTC peer connection started', done => {
      // Arrange
      const webrtcPeer = new WebrtcPeer({ socket: socketMock });
      webrtcPeer.pc = {
        setRemoteDescription: () => Promise.resolve()
      };
      const sdp = 'test-remote-sdp';
      const socketEvent = {
        data: { sdp }
      };
      const setRemoteDescriptionSpy = sinonSandbox.spy(webrtcPeer.pc, 'setRemoteDescription');
      sinonSandbox.stub(webrtcPeer, '_processQueuedIceCandidates')
        .callsFake(() => {
          // Assert
          expect(setRemoteDescriptionSpy).to.have.been.calledOnce;
          done();
        });

      // Act
      webrtcPeer._onRemoteSdp(socketEvent);
    });

    it('should start the RTC peer connection if it is not started yet', done => {
      // Arrange
      const webrtcPeer = new WebrtcPeer({ socket: socketMock });
      webrtcPeer.pc = undefined;
      const sdp = 'test-remote-sdp';
      const socketEvent = {
        data: { sdp }
      };
      const startStub = sinonSandbox.stub(webrtcPeer, 'start')
        .callsFake(() => Promise.resolve());
      sinonSandbox.stub(webrtcPeer, '_processQueuedIceCandidates')
        .callsFake(() => {
          // Assert
          expect(startStub).to.have.been.calledOnce;
          done();
        });

      // Act
      webrtcPeer._onRemoteSdp(socketEvent);
    });

    it('should do nothing if no sdp is received', () => {
      // Arrange
      const webrtcPeer = new WebrtcPeer({ socket: socketMock });
      const RTCSessionDescriptionSpy = sinonSandbox.spy(RTCSessionDescription, 'constructor');

      // Act
      webrtcPeer._onRemoteSdp({});

      // Assert
      expect(RTCSessionDescriptionSpy).to.have.callCount(0);
    });
  });

  describe('_onRemoteStop()', () => {
    it('should stop locally', () => {
      const webrtcPeer = new WebrtcPeer({ socket: socketMock });
      const stopStub = sinonSandbox.stub(webrtcPeer, 'stop')
        .callsFake(() => {});
      webrtcPeer._onRemoteStop();
      expect(stopStub).to.have.been.calledOnce;
    });
  });

  describe('_processLocalSdp()', () => {
    it('should set the local sdp and send it to the remote peer through the socket', done => {
      // Arrange
      const props = {
        connId: 'test-connection-id',
        socket: socketMock
      };
      const sdp = 'test-local-sdp';
      const webrtcPeer = new WebrtcPeer(props);
      webrtcPeer.pc = {
        setLocalDescription: (sdp) => {
          webrtcPeer.pc.localDescription = sdp;
          return Promise.resolve();
        }
      };
      sinonSandbox.stub(webrtcPeer.socket, 'emit')
        .callsFake((eventName, event) => {
          // Assert
          expect(eventName).to.equal(socketEvents.outbound.SDP);
          expect(event.data.connId).to.equal(props.connId);
          expect(event.data.sdp).to.equal(sdp);
          done();
        });

      // Act
      webrtcPeer._processLocalSdp(sdp);
    });
  });

  describe('_processQueuedIceCandidates()', () => {
    it('should add the unprocessed ice candidates to the RTC connection', () => {
      // Arrange
      const webrtcPeer = new WebrtcPeer({ socket: socketMock });
      const unprocessedCandidates = ['test-ice-candidate-1', 'test-ice-candidate-2'];
      webrtcPeer.remoteIceCandidatesUnprocessed = unprocessedCandidates;
      webrtcPeer.pc = {
        addIceCandidate: () => {}
      };
      const addIceCandidateSpy = sinonSandbox.spy(webrtcPeer.pc, 'addIceCandidate');

      // Act
      webrtcPeer._processQueuedIceCandidates();

      // Assert
      expect(addIceCandidateSpy).to.have.callCount(unprocessedCandidates.length);
      unprocessedCandidates.forEach(candidate => {
        expect(addIceCandidateSpy).to.have.been.calledWith(candidate);
      });
    });
  });

  describe('_sdpExchange()', () => {
    it('should create an sdp answer if a remote sdp is received', done => {
      // Arrange
      const remoteSdp = 'test-remote-sdp';
      const webrtcPeer = new WebrtcPeer({ socket: socketMock });
      webrtcPeer.localVideoStream = 'test-local-video-stream';
      webrtcPeer.pc = {
        addStream: () => {},
        createAnswer: () => Promise.resolve()
      };
      const addStreamSpy = sinonSandbox.spy(webrtcPeer.pc, 'addStream');
      const createAnswerSpy = sinonSandbox.spy(webrtcPeer.pc, 'createAnswer');
      sinonSandbox.stub(webrtcPeer, '_processLocalSdp')
        .callsFake(() => {
          // Assert
          expect(addStreamSpy).to.have.been.calledWith(webrtcPeer.localVideoStream);
          expect(createAnswerSpy).to.have.been.calledOnce;
          done();
        })


      // Act
      webrtcPeer._sdpExchange(remoteSdp);
    });

    it('should create an sdp offer if no remote sdp is received', done => {
      // Arrange
      const webrtcPeer = new WebrtcPeer({ socket: socketMock });
      webrtcPeer.localVideoStream = 'test-local-video-stream';
      webrtcPeer.pc = {
        addStream: () => {},
        createOffer: () => Promise.resolve()
      };
      const addStreamSpy = sinonSandbox.spy(webrtcPeer.pc, 'addStream');
      const createOfferSpy = sinonSandbox.spy(webrtcPeer.pc, 'createOffer');
      sinonSandbox.stub(webrtcPeer, '_processLocalSdp')
        .callsFake(() => {
          // Assert
          expect(addStreamSpy).to.have.been.calledWith(webrtcPeer.localVideoStream);
          expect(createOfferSpy).to.have.been.calledOnce;
          done();
        })


      // Act
      webrtcPeer._sdpExchange();
    });
  });

  describe('start()', () => {
    let testStream = 'test-stream-from-user-media';
    before(() => {
      global.navigator = {
        mediaDevices: {
          getUserMedia: () => Promise.resolve(testStream)
        }
      };
    });

    it('should start the peer connection and dispatch a local localVideoReady event ' +
      'with the local stream', done => {
      // Arrange
      const props = {
        connId: 'test-connection-id',
        socket: socketMock
      };
      const webrtcPeer = new WebrtcPeer(props);
      const createStub = sinonSandbox.stub(webrtcPeer, '_createPeerConnection')
        .callsFake(() => {});
      sinonSandbox.stub(localEvents.localVideoReady, 'dispatch')
        .callsFake((event) => {
          // Assert
          expect(createStub).to.have.been.calledOnce;
          expect(event.connId).to.equal(props.connId);
          expect(event.peerId).to.equal(webrtcPeer.socket.id);
          expect(event.stream).to.equal(testStream);
          done();
        });

      // Act
      webrtcPeer.start();
    });

    it('should set the remote sdp and do sdp exhcnage if received', done => {
      // Arrange
      const props = {
        connId: 'test-connection-id',
        socket: socketMock
      };
      const remoteSdp = 'test-remote-sdp';
      const webrtcPeer = new WebrtcPeer(props);
      const createStub = sinonSandbox.stub(webrtcPeer, '_createPeerConnection')
        .callsFake(() => {});
      webrtcPeer.pc = {
        setRemoteDescription: () => Promise.resolve()
      };
      const setRemoteDescriptionSpy = sinonSandbox.spy(webrtcPeer.pc, 'setRemoteDescription');
      const dispatchStub = sinonSandbox.stub(localEvents.localVideoReady, 'dispatch')
        .callsFake(() => {});
      sinonSandbox.stub(webrtcPeer, '_sdpExchange')
        .callsFake((actualRemoteSdp) => {
          // Assert
          expect(createStub).to.have.been.calledOnce;
          expect(setRemoteDescriptionSpy).to.have.been.calledWith(remoteSdp);
          expect(dispatchStub).to.have.been.calledOnce;
          expect(actualRemoteSdp).to.equal(remoteSdp);
          done();
        })

      // Act
      webrtcPeer.start(remoteSdp);
    });

    it('should dispatch a local getUserMediaError event if getting the local stream fails', done => {
      // Arrange
      const props = {
        connId: 'test-connection-id',
        socket: socketMock
      };
      const testError = 'test-error-in-getUserMedia';
      const webrtcPeer = new WebrtcPeer(props);
      sinonSandbox.stub(webrtcPeer, '_createPeerConnection')
        .callsFake(() => {});
      sinonSandbox.stub(navigator.mediaDevices, 'getUserMedia')
        .callsFake(() => Promise.reject(testError));
      sinonSandbox.stub(localEvents.getUserMediaError, 'dispatch')
        .callsFake((event) => {
          // Assert
          expect(event.connId).to.equal(props.connId);
          expect(event.peerId).to.equal(webrtcPeer.socket.id);
          expect(event.error).to.equal(testError);
          done();
        });

      // Act
      webrtcPeer.start();
    });
  });

  describe('stop()', () => {
    it('should dispatch a local connectionEnded event', () => {
      // Arrange
      const webrtcPeer = new WebrtcPeer({ socket: socketMock });
      const dispatchStub = sinonSandbox.stub(localEvents.connectionEnded, 'dispatch');

      // Act
      webrtcPeer.stop();

      // Assert
      expect(dispatchStub).to.have.been.calledOnce;
    });

    it('should stop every track of the local video stream', () => {
      // Arrange
      const webrtcPeer = new WebrtcPeer({ socket: socketMock });
      const track = { stop: () => {} };
      const tracks = [track, track, track];
      webrtcPeer.localVideoStream = {
        getTracks: () => (tracks)
      };
      const stopSpy = sinonSandbox.spy(track, 'stop');

      // Act
      webrtcPeer.stop();

      // Assert
      expect(stopSpy).to.have.callCount(tracks.length);
    });

    it('should close the peer connection', () => {
      // Arrange
      const webrtcPeer = new WebrtcPeer({ socket: socketMock });
      webrtcPeer.pc = { close: () => {} };
      const closeSpy = sinonSandbox.spy(webrtcPeer.pc, 'close');

      // Act
      webrtcPeer.stop();

      // Assert
      expect(closeSpy).to.have.been.calledOnce;
    });
  });
});
