'use strict';

const io = require('socket.io-client');
const events = require('./events/events');

class _Client {
  constructor(uri, opts) {
    this.socket = io(uri, opts);

    // Binding
    this._onConnect = this._onConnect.bind(this);

    this.socket.on('connect', this._onConnect);
  }

  _onConnect(){
    console.log('>>>>> socket client connected, socket id: ', this.socket.id);
  }

  start(connId) {
    return new Promise((resolve, reject) => {
      const event = {
        data: { connId }
      };
      this.socket.emit(events.outbound.START, event,
        response => {
          if (response.success) {
            return resolve(response.data.connId);
          }
          return reject(response.data.error);
        });
    });
  }

  stop(connId) {
    return new Promise((resolve, reject) => {
      const event = {
        data: { connId }
      };
      this.socket.emit(events.outbound.STOP, event,
        response => {
          if (response.success) {
            return resolve();
          }
          return reject(response.data.error);
        });
    });
  }
}

// This allows calling signalingServer without the 'new'
const Client = (uri, opts) => {
  return new _Client(uri, opts);
}

module.exports = Client;