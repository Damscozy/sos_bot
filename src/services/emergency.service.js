const webrtc = require('./webrtc.service');
const twilio = require('twilio');
const pool = require('../models/db'); // PostgreSQL pool
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

class EmergencyService {
  constructor() {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_ACCOUNT_SID.startsWith('AC')) {
      this.client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    } else {
      console.error('Twilio credentials missing or invalid. Voice fallback disabled.');
    }
    this.evolutionUrl = process.env.EVOLUTION_API_URL;
    this.evolutionApiKey = process.env.EVOLUTION_API_KEY;
    this.instance = process.env.EVOLUTION_INSTANCE_NAME;
  }

  /**
   * Initializes the SOS sequence: persists to DB, triggers calls, and returns the meeting link.
   * @param {string} phone
   * @param {object} location { lat, lng }
   */
  async triggerSOS(phone, location) {
    // 1. Persist the SOS Event
    const event = await this.saveEvent(phone, location);

    // 2. Generate specialized room name and token for the sender
    const roomName = `sos_${event.id}`;
    const token = await webrtc.generateToken(roomName, phone, true); // Sender is the broadcaster
    const meetingLink = webrtc.generateMeetingLink(roomName, token);

    // 3. (Async) Notify nearby responders [ST_DWithin logic]
    this.notifyResponders(event.id, location);

    // 4. (Async) Trigger automated outbound calls to emergency contacts
    this.triggerEmergencyCalls(phone, location, event.id);

    return { 
      eventId: event.id, 
      meetingLink 
    };
  }

  async saveEvent(phone, location) {
    const res = await pool.query(
      'INSERT INTO emergency_events (sender_phone, location) VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)) RETURNING id',
      [phone, location.lng, location.lat]
    );
    return res.rows[0];
  }

  async notifyResponders(eventId, location) {
    // Find responders within a 10km radius but exclude those within 100m (safe-zone or test group)
    const responders = await pool.query(`
      SELECT id, phone_number 
      FROM responders 
      WHERE ST_DWithin(last_location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 10000)
      AND NOT ST_DWithin(last_location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 100)
    `, [location.lng, location.lat]);

    // Push notifications here (e.g., via FCM or Twilio SMS)
    console.log(`Notifying ${responders.rows.length} nearby responders...`);
  }

  async triggerEmergencyCalls(phone, location, eventId) {
    if (!this.client) {
      console.warn('Skipping Twilio voice calls: Client not initialized.');
      return;
    }

    const contacts = await pool.query('SELECT phone FROM emergency_contacts WHERE user_phone = $1', [phone]);

    for (const contact of contacts.rows) {
      await this.client.calls.create({
        url: `${process.env.APP_URL}/api/v1/voice/emergency-message?eventId=${eventId}`,
        to: contact.phone,
        from: process.env.TWILIO_PHONE_NUMBER
      });
    }
  }

  /**
   * Sends a WhatsApp message via Evolution API.
   * @param {string} phone 
   * @param {string} text 
   */
  async sendMessage(phone, text) {
    const url = `${this.evolutionUrl}/message/sendText/${this.instance}`;
    const payload = {
      number: phone,
      options: {
        delay: 1200,
        presence: "composing",
        linkPreview: true
      },
      textMessage: {
        text: text
      }
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.evolutionApiKey
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        console.error('Evolution API Error:', data);
        throw new Error(`Failed to send WhatsApp message: ${response.statusText}`);
      }
      return data;
    } catch (error) {
      console.error('Emergency Message Delivery Failure:', error);
    }
  }
}

module.exports = new EmergencyService();
