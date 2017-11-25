'use strict';

const signals = require('signals');

let events;
events = events || {};

if (typeof events !== 'undefined') {
  events = {
    remoteVideoReady: new signals.Signal(),
    localVideoReady: new signals.Signal(),
    connectionEnded: new signals.Signal()
  };
}

module.exports = events;