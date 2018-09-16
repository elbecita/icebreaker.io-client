'use strict';

const socketEvents = {
  outbound: {
    ICE_CANDIDATE: 'icebreaker.io.candidate',
    SDP: 'icebreaker.io.sdp',
    START: 'icebreaker.io.start'
  },
  inbound: {
    REMOTE_ICE_CANDIDATE: 'icebreaker.io.remoteCandidate',
    REMOTE_PEER_JOINED: 'icebreaker.io.remotePeerJoined',
    REMOTE_SDP: 'icebreaker.io.remoteSdp',
    REMOTE_STOP: 'icebreaker.io.remoteStop'
  }
};

module.exports = socketEvents;
