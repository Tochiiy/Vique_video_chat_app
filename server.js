import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
app.use(cors()); // Allow cross-origin requests
const port = process.env.PORT || 5000;
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Store connected users: { "username": { username, id: socketID } }
const allusers = {};

const __dirname = dirname(fileURLToPath(import.meta.url));

// Serve all static files (HTML, CSS, JS, Images) from the "public" folder
app.use(express.static(join(__dirname, "public")));

// Root route now serves index.html directly from the public folder
app.get("/", (req, res) => {
  res.status(200).sendFile(join(__dirname, "public", "index.html"));
});

io.on("connection", (socket) => {
  console.log("A user connected: " + socket.id);

  // When a user provides their name and joins the network
  socket.on("join_user", (username) => {
    console.log("User joined: " + username);
    socket.username = username; // Store on socket for easy cleanup
    allusers[username] = { username, id: socket.id };

    // Tell everyone who is currently online
    io.emit("joined", allusers);
  });

  // Handle user leaving the page
  socket.on("disconnect", () => {
    console.log("A user disconnected: " + socket.id);
    if (socket.username) {
        delete allusers[socket.username];
        io.emit("joined", allusers);
    }
  });

  socket.on("start_call", (user) => {
    console.log("Starting call with: " + user);
  });

  // 1. Relaying the Offer (Call Invitation)
  socket.on("offer", ({ from, to, offer }) => {
    console.log(from, to, "Relaying Offer to: " + offer);
    const toUser = allusers[to];
    if (toUser) {
      io.to(toUser.id).emit("offer", { from, to, offer });
    }
  });

  // 2. Relaying the Answer (Accepting Call)
  socket.on("answer", ({ from, to, answer }) => {
    console.log(from, to, "Relaying Answer to: " + to);
    const toUser = allusers[to];
    if (toUser) {
      io.to(toUser.id).emit("answer", { from, to, answer });
    }
  });

  // 3. Relaying ICE Candidates (Connecting the Direct Video Path)
  socket.on("ice_candidate", ({ from, to, candidate }) => {
    console.log(from, to, "Relaying ICE Candidate to: " + to);
    const toUser = allusers[to];
    if (toUser) {
      io.to(toUser.id).emit("ice_candidate", { from, to, candidate });
    }
  });

  // 4. Handle End Call signal
  socket.on("end_call", ({ to }) => {
    console.log("End call relay from: " + socket.id + " to user: " + to);
    const toUser = allusers[to];
    if (toUser) {
      io.to(toUser.id).emit("end_call");
    }
  });

  // 5. Chat Messaging Logic
  socket.on("chat_message", ({ to, message, from }) => {
    console.log(`Message from ${from} to ${to}: ${message}`);
    const toUser = allusers[to];
    if (toUser) {
      io.to(toUser.id).emit("chat_message", { from, message });
    }
  });
});

server.listen(port, () => {
  console.log("Server is running on port " + port);
});
