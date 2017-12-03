'use strict';

const proxyquire = require('proxyquire');
const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const expect = chai.expect;
chai.use(sinonChai);

const socketMock = {
  id: 'icebreaker.io-client-test-socket-id',
  disconnect: () => {},
  emit: () => {},
  on: () => {}
};
const ioMock = (uri, opts) => {
  socketMock.uri = uri;
  socketMock.opts = opts;
  return socketMock;
};

const Client = proxyquire('../src/client', {
  'socket.io-client': ioMock
});
const localEvents = require('../src/events/local-events');
const socketEvents = require('../src/events/socket-events');
const WebrtcPeer = require('../src/webrtc-peer');

describe('Client tests', () => {
  let sinonSandbox;
  beforeEach(() => {
    sinonSandbox = sinon.sandbox.create();
  });
  afterEach(() => {
    sinonSandbox.restore();
  });

  describe('constructor()', () => {
    it('shoud initialize the client', () => {
      // Arrange
      const uri = 'https://test-uri';
      const opts = { path: 'test-path' };
      const onSpy = sinonSandbox.spy(socketMock, 'on');

      // Act
      const client = Client(uri, opts);

      // Assert
      expect(client.socket.id).to.equal(socketMock.id);
      expect(client.id).to.be.null;
      expect(client.connId).to.be.null;
      expect(client.webrtcPeer).to.be.null;
      expect(client.events).to.equal(localEvents);
      expect(socketMock.opts.path).to.equal(opts.path);
      expect(onSpy).to.have.been.calledWith('connect', client._onConnect);
    });
  });

  describe('_initWebrtcConnection()', () => {
    it('should initialize the webrtc peer', done => {
      // Arrange
      const connId = 'test-connection-id';
      const props = {
        configuration: 'test-configuration',
        mediaConstraints: 'test-media-constraints'
      };
      sinonSandbox.stub(WebrtcPeer.prototype, 'constructor')
        .callsFake((webrtcPeerProps) => {
          // Assert
          expect(webrtcPeerProps.connId).to.equal(connId);
          expect(webrtcPeerProps.configuration).to.equal(props.configuration);
          expect(webrtcPeerProps.mediaConstraints).to.equal(props.mediaConstraints);
        });
      const client = Client();
      sinonSandbox.stub(client.events.connectionEnded, 'addOnce')
        .callsFake((disposeMethod) => {
          // Assert
          expect(disposeMethod).to.equal(client._dispose);
          done();
        });

      // Act
      client._initWebrtcConnection(connId, false, props);
    });

    it('should start the webrtc peer if flag received', done => {
      // Arrange
      const connId = 'test-connection-id';
      const props = {
        configuration: 'test-configuration',
        mediaConstraints: 'test-media-constraints'
      };
      sinonSandbox.stub(WebrtcPeer.prototype, 'constructor')
        .callsFake(() => {});
      const startSpy = sinonSandbox.stub(WebrtcPeer.prototype, 'start')
        .callsFake(() => {});
      const client = Client();
      sinonSandbox.stub(client.events.connectionEnded, 'addOnce')
        .callsFake(() => {
          // Assert
          expect(startSpy).to.have.been.calledOnce;
          done();
        });

      // Act
      client._initWebrtcConnection(connId, true, props);
    });
  });

  describe('_disose()', () => {
    it('should disconnect and delete the socket', () => {
      const client = Client();
      const disconnectSpy = sinonSandbox.spy(client.socket, 'disconnect');
      client._dispose();
      expect(disconnectSpy).to.have.been.calledOnce;
      expect(client.socket).to.be.undefined;
    });
  });

  describe('_onConnect()', () => {
    it('should save socket id in a separate property', () => {
      const client = Client();
      client._onConnect();
      expect(client.id).to.equal(socketMock.id);
    });
  });

  describe('start()', () => {
    it('should start the connection if success response from server', () => {
      // Arrange
      const client = Client();
      const connId = 'test-connection-id';
      sinonSandbox.stub(client.socket, 'emit')
        .callsFake((eventName, event, cb) => {
          expect(eventName).to.equal(socketEvents.outbound.START);
          expect(event.data.connId).to.equal(connId);
          const response = {
            success: true,
            data: { connId }
          };
          cb(response);
        });
      const initWebrtcStub = sinonSandbox.stub(client, '_initWebrtcConnection')
        .callsFake(() => {});

      // Act
      return client.start({ connId }).then(actualConnId => {
        // Assert
        expect(actualConnId).to.equal(connId);
        expect(initWebrtcStub).to.have.been.calledOnce;
      });
    });

    it('should not start the connection if failure response from server', done => {
      // Arrange
      const client = Client();
      const connId = 'test-connection-id';
      const testError = 'test-error';
      sinonSandbox.stub(client.socket, 'emit')
        .callsFake((eventName, event, cb) => {
          expect(eventName).to.equal(socketEvents.outbound.START);
          expect(event.data.connId).to.equal(connId);
          const response = {
            success: false,
            data: {
              error: testError
            }
          };
          cb(response);
        });
      const initWebrtcStub = sinonSandbox.stub(client, '_initWebrtcConnection')
        .callsFake(() => {});

      // Act
      client.start({ connId }).catch(error => {
        // Assert
        expect(error).to.equal(testError);
        expect(initWebrtcStub).to.have.callCount(0);
        done();
      });
    });
  });

  describe('stop()', () => {
    it('should stop the webrtcPeer if it exists', () => {
      // Arrange
      const client = Client();
      const webrtcPeer = {
        stop: () => {}
      };
      client.webrtcPeer = webrtcPeer;
      const stopSpy = sinonSandbox.spy(client.webrtcPeer, 'stop');
      const disposeStub = sinonSandbox.stub(client, '_dispose').callsFake(() => {});

      // Act
      client.stop();

      // Assert
      expect(stopSpy).to.have.been.calledOnce;
      expect(disposeStub).to.have.been.calledOnce;
    });

    it('should not stop the webrtcPeer if it  does not exist', () => {
      // Arrange
      const client = Client();
      const disposeStub = sinonSandbox.stub(client, '_dispose').callsFake(() => {});

      // Act
      client.stop();

      // Assert
      expect(disposeStub).to.have.been.calledOnce;
    });
  });
});
