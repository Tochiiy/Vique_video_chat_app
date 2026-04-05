/**
 * Vique Video Call — Client Side Logic
 * Handled via Socket.io and WebRTC
 */

const socket = io();

// ── UI Selectors ──────────────────────────────
const createUserbtn = document.getElementById("create_user");
const username = document.getElementById("username");
const allUserHtml = document.getElementById("A_Users");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const endCallBtn = document.getElementById("end_call_btn");

// ── Welcome Modal Logic ──────────────────────
const welcomeModal = document.getElementById("welcome_modal");
const closeModalBtn = document.getElementById("close_modal");

// When user clicks "Get Started", we fade out the modal
if (closeModalBtn) {
    closeModalBtn.addEventListener("click", () => {
        welcomeModal.style.opacity = "0";
        setTimeout(() => {
            welcomeModal.style.display = "none";
            startVideoCall(); // Initialize camera immediately
        }, 450);
    });
}

// ── State Variables ──────────────────────────
let localStream;
let remoteStream;
let otherUser; // Stores the username of the person we are currently calling

/**
 * PeerConnection Singleton
 * Ensures only one WebRTC connection is active at a time.
 */
const PeerConnection = (function () {
  let peerConnection;

  const createPeerConnection = () => {
    const config = {
      iceServers: [{ urls: "stun:stun1.l.google.com:19302" }],
    };

    peerConnection = new RTCPeerConnection(config);

    // Attach local camera tracks to the connection
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
      });
    }

    // When remote video tracks arrive, display them
    peerConnection.ontrack = (event) => {
      remoteVideo.srcObject = event.streams[0]; 
    };

    // Send local path info (ICE) to the other user via signaling server
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice_candidate", {
            from: username.value, 
            to: otherUser, 
            candidate: event.candidate
        });
      }
    };

    return peerConnection;
  };

  return {
    getInstance: () => {
      if (!peerConnection) peerConnection = createPeerConnection();
      return peerConnection;
    },
  };
})();

/**
 * Start Call (Sender side)
 * Initiates the WebRTC Offer/Answer handshake.
 */
const startcall = async (user) => {
  otherUser = user;
  console.log("Initiating call with: ", user); 
  
  const peerC = PeerConnection.getInstance();
  const offer = await peerC.createOffer();
  await peerC.setLocalDescription(offer);
  
  // Send offer to the server to relay it to the target user
  socket.emit("offer", {
      from: username.value, 
      to: user, 
      offer: peerC.localDescription
  });
};

/**
 * Initialize Local Media (Camera/Mic)
 */
const startVideoCall = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localStream = stream;
    localVideo.srcObject = stream;

    // Add tracks to existing connection if one exists
    const peerC = PeerConnection.getInstance();
    if (peerC && stream) {
      stream.getTracks().forEach((track) => {
        peerC.addTrack(track, stream);
      });
    }
  } catch (error) {
    console.log("Media Error: ", error);
    alert("Camera access denied or not found.");
  }
};

// ── Signaling Listeners ──────────────────────

// Receive network paths from the other person
socket.on("ice_candidate", async ({from, to, candidate}) => {
  const peerC = PeerConnection.getInstance();
  await peerC.addIceCandidate(new RTCIceCandidate(candidate));
});

// Receive a call invitation (Offer)
socket.on("offer", async ({ from, to, offer }) => {
  document.getElementById("remote_user_name").textContent = from; 
  endCallBtn.classList.remove("d-none"); 
  otherUser = from; 
  
  const peerC = PeerConnection.getInstance();
  await peerC.setRemoteDescription(offer);
  
  const answer = await peerC.createAnswer();
  await peerC.setLocalDescription(answer);
  
  // Send acceptance (Answer) back
  socket.emit("answer", {from: username.value, to: from, answer: peerC.localDescription});
});

// Receiver accepted our call
socket.on("answer", async ({from, to, answer}) => {
  document.getElementById("remote_user_name").textContent = from; 
  endCallBtn.classList.remove("d-none"); 
  otherUser = from; 
  
  const peerC = PeerConnection.getInstance();
  await peerC.setRemoteDescription(answer);
});

// ── Contact List & User Join ──────────────────

createUserbtn.addEventListener("click", () => {
  if (username.value === "") return alert("Username required");
  
  document.querySelector(".username_input").style.display = "none";
  document.getElementById("display_username").textContent = username.value; // ✅ Dynamically update modal name
  socket.emit("join_user", username.value);
});

// Update the contact list when users join/leave
socket.on("joined", (allusers) => {
    allUserHtml.innerHTML = "";
    
    // Add Support Static Link
    const supportLi = document.createElement("li");
    supportLi.innerHTML = `Customer Support <button class="call_btn" onclick="alert('Connecting...')">📞</button>`;
    allUserHtml.appendChild(supportLi);

    for (const user in allusers) {
        if (user === username.value) continue;
        
        const li = document.createElement("li");
        li.textContent = user;
        
        const btn = document.createElement("button");
        btn.classList.add("call_btn");
        btn.textContent = "📞";
        btn.onclick = () => startcall(user);
        
        li.appendChild(btn);
        allUserHtml.appendChild(li);
    }
});

// ── Chat Functionality ───────────────────────
const chatInput = document.getElementById("chat_input");
const chatSend = document.getElementById("chat_send");
const chatMessages = document.getElementById("chat_messages");

const appendMessage = (data, type) => {
  const msgDiv = document.createElement("div");
  msgDiv.classList.add("message", type);
  msgDiv.textContent = data.message;
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
};

const sendMessage = () => {
    const message = chatInput.value.trim();
    if (message !== "" && otherUser) {
        socket.emit("chat_message", { to: otherUser, message, from: username.value });
        appendMessage({ message }, "sent");
        chatInput.value = "";
    }
};

chatSend.addEventListener("click", sendMessage);
chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });

socket.on("chat_message", (data) => appendMessage(data, "received"));

// ── Disconnect & End Call ───────────────────
const endCall = () => {
  const peerC = PeerConnection.getInstance();
  if (peerC) peerC.close();
  
  if (otherUser) socket.emit("end_call", { to: otherUser });
  location.reload(); 
};

endCallBtn.addEventListener("click", endCall);
socket.on("end_call", () => {
  alert("The other user has ended the call.");
  location.reload();
});
