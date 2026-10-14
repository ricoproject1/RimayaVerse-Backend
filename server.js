const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

// ==== HTTP SERVER (untuk health check Railway) ====
const server = http.createServer((req, res) => {
  // Endpoint /health untuk UptimeRobot & Railway health check
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      clients: wss.clients.size,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }));
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

// ==== WEBSOCKET SERVER (attach ke HTTP server) ====
const wss = new WebSocket.Server({ server });

function broadcast(data, sender = null) {
  const json = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client !== sender) {
      client.send(json);
    }
  });
}

wss.on('connection', (ws) => {
  console.log('Client connected. Total:', wss.clients.size);

  ws.username = null;
  ws.isAlive = true;

  // Heartbeat: tandai client masih hidup
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log("Received:", data.type);

      if (data.type === "join") {
        ws.username = data.username;
        broadcast({
          type: "system",
          text: `${ws.username} joined the chat`
        });
        return;
      }

      if (data.type === "chat") {
        broadcast({
          type: "chat",
          id: data.id,
          username: data.username,
          text: data.text,
          timestamp: data.timestamp,
          createdAt: data.createdAt,
          replyTo: data.replyTo
        }, ws);
        return;
      }
    } catch (err) {
      console.error("Error parsing message:", err);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected. Total:', wss.clients.size);
    if (ws.username) {
      broadcast({
        type: "system",
        text: `${ws.username} left the chat`
      });
    }
  });
});

// ==== HEARTBEAT INTERVAL (deteksi koneksi mati) ====
const interval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000); // tiap 30 detik

wss.on('close', () => clearInterval(interval));

// ==== START ====
server.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP + WS server running on port ${PORT}`);
});
