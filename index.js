require('dotenv').config();
const fastify = require('fastify')({ logger: true });

// Register Route Groups
fastify.register(require('./src/api/v1/whatsapp'), { prefix: '/api/v1' });

// Global Health Check
fastify.get('/health', async (request, reply) => {
  return { status: 'healthy', timestamp: new Date().toISOString() };
});

// Error Handler
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);
  reply.status(500).send({ 
    error: 'Emergency Service Fault', 
    message: 'An internal error occurred while processing the SOS. Responding via fallback channels.' 
  });
});

const start = async () => {
  try {
    const port = process.env.PORT || 3000;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`vibronA aerta running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
