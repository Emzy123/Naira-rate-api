// src/server.ts
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer);

  const onlineUsers = new Map<string, string>();

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("join", (userId: string) => {
      onlineUsers.set(userId, socket.id);
      console.log("User joined:", userId);
      io.emit("online-users", Array.from(onlineUsers.keys()));
    });

    socket.on(
      "private-message",
      (data: { from: string; to: string; message: string }) => {
        const recipientSocketId = onlineUsers.get(data.to);

        if (recipientSocketId) {
          io.to(recipientSocketId).emit("private-message", data);
        }
      },
    );

    socket.on("disconnect", () => {
      for (const [userId, socketId] of onlineUsers.entries()) {
        if (socketId === socket.id) {
          onlineUsers.delete(userId);
          break;
        }
      }

      io.emit("online-users", Array.from(onlineUsers.keys()));
      console.log("Client disconnected:", socket.id);
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
