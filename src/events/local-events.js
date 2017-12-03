'use strict';

const signals = require('signals');

const localEvents = {
  connectionEnded: new signals.Signal(),
  getUserMediaError: new signals.Signal(),
  localStreamReady: new signals.Signal(),
  remoteStreamReady: new signals.Signal()
};

module.exports = localEvents;