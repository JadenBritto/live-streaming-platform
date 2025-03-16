const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve the index.html file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Store active events and their participants
const activeEvents = {};

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // Join an event
  socket.on('joinEvent', ({ eventId, username }) => {
    // Create event room if it doesn't exist
    if (!activeEvents[eventId]) {
      activeEvents[eventId] = {
        participants: {},
        messages: []
      };
    }
    
    // Add user to event participants
    activeEvents[eventId].participants[socket.id] = {
      id: socket.id,
      username,
      joinedAt: new Date()
    };
    
    // Join the socket room for this event
    socket.join(eventId);
    
    // Notify all participants about the new user
    io.to(eventId).emit('userJoined', {
      eventId,
      user: activeEvents[eventId].participants[socket.id],
      participants: Object.values(activeEvents[eventId].participants),
      messages: activeEvents[eventId].messages
    });
    
    console.log(`User ${username} joined event ${eventId}`);
  });
  
  // Leave an event
  socket.on('leaveEvent', ({ eventId }) => {
    if (activeEvents[eventId] && activeEvents[eventId].participants[socket.id]) {
      const username = activeEvents[eventId].participants[socket.id].username;
      
      // Remove user from participants
      delete activeEvents[eventId].participants[socket.id];
      
      // Leave the socket room
      socket.leave(eventId);
      
      // Notify remaining participants
      io.to(eventId).emit('userLeft', {
        eventId,
        userId: socket.id,
        username,
        participants: Object.values(activeEvents[eventId].participants)
      });
      
      console.log(`User ${username} left event ${eventId}`);
      
      // Clean up empty events
      if (Object.keys(activeEvents[eventId].participants).length === 0) {
        delete activeEvents[eventId];
        console.log(`Event ${eventId} removed as it has no participants`);
      }
    }
  });
  
  // Send message in an event
  socket.on('sendMessage', ({ eventId, message }) => {
    if (activeEvents[eventId] && activeEvents[eventId].participants[socket.id]) {
      const username = activeEvents[eventId].participants[socket.id].username;
      
      // Create message object with timestamp
      const messageObj = {
        id: Date.now().toString(),
        userId: socket.id,
        username,
        content: message,
        timestamp: new Date()
      };
      
      // Store message in event history
      activeEvents[eventId].messages.push(messageObj);
      
      // Limit stored messages (optional)
      if (activeEvents[eventId].messages.length > 100) {
        activeEvents[eventId].messages.shift();
      }
      
      // Broadcast message to all participants
      io.to(eventId).emit('newMessage', {
        eventId,
        message: messageObj
      });
      
      console.log(`Message from ${username} in event ${eventId}: ${message}`);
    }
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    // Find and leave all events the user was part of
    Object.keys(activeEvents).forEach(eventId => {
      if (activeEvents[eventId].participants[socket.id]) {
        const username = activeEvents[eventId].participants[socket.id].username;
        
        // Remove user from participants
        delete activeEvents[eventId].participants[socket.id];
        
        // Notify remaining participants
        io.to(eventId).emit('userLeft', {
          eventId,
          userId: socket.id,
          username,
          participants: Object.values(activeEvents[eventId].participants)
        });
        
        console.log(`User ${username} disconnected from event ${eventId}`);
        
        // Clean up empty events
        if (Object.keys(activeEvents[eventId].participants).length === 0) {
          delete activeEvents[eventId];
          console.log(`Event ${eventId} removed as it has no participants`);
        }
      }
    });
  });
  
  // Get active events list
  socket.on('getActiveEvents', (callback) => {
    const eventsList = Object.keys(activeEvents).map(eventId => ({
      id: eventId,
      participantCount: Object.keys(activeEvents[eventId].participants).length
    }));
    
    callback(eventsList);
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});