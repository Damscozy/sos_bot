const emergency = require('../../services/emergency.service');

module.exports = async function (fastify, opts) {
  /**
   * Evolution API Webhook Handler.
   * Processes new messages and triggers SOS workflows.
   */
  fastify.post('/webhook/whatsapp', async (request, reply) => {
    const payload = request.body;
    
    // 1. Validate Evolution API Event
    if (payload.event !== 'messages.upsert') {
      return reply.status(200).send({ status: 'ignored', event: payload.event });
    }

    const messageData = payload.data;
    const remoteJid = messageData.key.remoteJid;
    const from = remoteJid.split('@')[0]; // Extract phone number

    // 2. Identify Message Content
    let bodyText = '';
    let location = null;

    if (messageData.message) {
      // Direct text
      if (messageData.message.conversation) {
        bodyText = messageData.message.conversation.trim().toUpperCase();
      } 
      // Extended text (e.g. from a mention or reply)
      else if (messageData.message.extendedTextMessage) {
        bodyText = messageData.message.extendedTextMessage.text.trim().toUpperCase();
      }
      // Native WhatsApp Location Message
      else if (messageData.message.locationMessage) {
        location = {
          lat: messageData.message.locationMessage.degreesLatitude,
          lng: messageData.message.locationMessage.degreesLongitude
        };
      }
    }

    fastify.log.info(`Processing message from ${from}: ${bodyText || 'LOCATION'}`);

    // 3. Logic: Trigger SOS
    if (bodyText === 'SOS' || location) {
      if (location) {
        // SOS with location (either via map pin or previous text)
        const { meetingLink } = await emergency.triggerSOS(from, location);
        
        await emergency.sendMessage(from, `🚨 EMERGENCY SOS TRIGGERED! \n\nHelp is being dispatched. Access live video stream here: ${meetingLink}`);
      } else {
        // User just typed "SOS", ask for location
        await emergency.sendMessage(from, "SOS Received. Please share your current location (map pin) via WhatsApp immediately for dispatch.");
      }
    }

    return reply.status(200).send({ status: 'success' });
  });
};
