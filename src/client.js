'use strict';

const io = require('socket.io-client');

class _Client {
  constructor(uri, opts) {
    this.socket = io(uri, opts);

    // Binding
    this.onConnect = this.onConnect.bind(this);

    this.socket.on('connect', this.onConnect);
  }

  onConnect(){
    console.log('>>>>> socket client connected, socket id: ', this.socket.id);
  }
}

// This allows calling signalingServer without the 'new'
const Client = (uri, opts) => {
  return new _Client(uri, opts);
}

module.exports = Client;