'use strict';

const signals = require('signals');

const localEvents = {
  connectionEnded: new signals.Signal(),
  getUserMediaError: new signals.Signal(),
  localVideoReady: new signals.Signal(),
  remoteVideoReady: new signals.Signal()
};

module.exports = localEvents;