'use strict';

const events = {
  outbound: {
    ICE_CANDIDATE: 'icebreaker.candidate',
    SDP: 'icebreaker.sdp',
    START: 'icebreaker.start',
    STOP: 'icebreaker.stop'
  }
};

module.exports = events;