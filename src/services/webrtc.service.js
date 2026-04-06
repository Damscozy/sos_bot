const { AccessToken } = require('livekit-server-sdk');

class WebRTCService {
  constructor() {
    this.apiKey = process.env.LIVEKIT_API_KEY;
    this.apiSecret = process.env.LIVEKIT_API_SECRET;
  }

  /**
   * Generates a secure, time-bound token for an emergency room.
   * @param {string} roomName Unique room ID (usually the SOS Event ID)
   * @param {string} identity Identifier for the user (Broadcaster or Responder)
   * @param {boolean} isBroadcaster If true, enables video/audio publishing
   */
  async generateToken(roomName, identity, isBroadcaster = false) {
    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: identity,
      ttl: '1h', // 1 hour expiration for the token
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: isBroadcaster,
      canSubscribe: true,
      canPublishData: true,
    });

    return at.toJwt();
  }

  /**
   * Constructs the full redirect/meeting URL for the responder.
   */
  generateMeetingLink(roomName, token) {
    const baseUrl = process.env.EMERGENCY_APP_URL || 'https://sos-portal.io';
    return `${baseUrl}/emergency/${roomName}?token=${token}`;
  }
}

module.exports = new WebRTCService();
