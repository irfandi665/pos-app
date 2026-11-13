'use strict';

let sseClients = [];

function addSseClient(res) {
  const clientId = Date.now() + Math.random();
  sseClients.push({ id: clientId, res });
  return clientId;
}

function removeSseClient(clientId) {
  sseClients = sseClients.filter((client) => client.id !== clientId);
}

function broadcastSse(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((client) => {
    try {
      client.res.write(payload);
    } catch (_error) {
      // Client disconnected; the close handler removes it from the list.
    }
  });
}

module.exports = {
  addSseClient,
  removeSseClient,
  broadcastSse
};
