'use strict';

const signals = require('signals');

let localEvents;
localEvents = localEvents || {};

if (typeof localEvents !== 'undefined') {
  localEvents = {
    remoteVideoReady: new signals.Signal(),
    localVideoReady: new signals.Signal(),
    connectionEnded: new signals.Signal()
  };
}

module.exports = localEvents;