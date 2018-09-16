module.exports = {
  "extends": "airbnb",
  "plugins": [
      "import"
  ],
  "rules": {
    "strict": 0,
    "comma-dangle": 0,
    "spaced-comment": 0,
    "no-underscore-dangle": 0,
    "linebreak-style": 0
  },
  "globals": {
    "describe": 1,
    "it": 1,
    "before": 1,
    "beforeEach": 1,
    "after": 1,
    "afterEach": 1,
    "require": 1,
    "navigator": 1,
    "RTCIceCandidate": 1,
    "RTCPeerConnection": 1,
    "RTCSessionDescription": 1
  }
};