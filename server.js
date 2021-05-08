const app = require("express")();
const cors = require("cors");
const port = process.env.PORT || 4002;
const index = require("./routes/index");
const { Player, Room } = require("./utils/classes.js");
const aUtils = require("./utils/aUtils.js");

app.use(cors());
app.use(index);

const options = {
  cors: {
    origins: ["http://127.0.0.1:4002", "https://chattercat.netlify.app/"],
    methods: ["GET", "POST"],
  },
};
const httpServer = require("http").createServer(app);
const io = require("socket.io")(httpServer, options);

httpServer.listen(port, () => console.log(`Listening on port ${port}`));

const rooms = [];
const players = [];

io.on("connection", (socket) => {
  console.log(
    `ø connection <${socket.id.slice(
      0,
      4
    )}> at ${new Date().toUTCString().slice(17, -4)}.`
  );

  socket.on("Dev destroy all", function () {
    console.log(`ø DESTROY <${socket.id.slice(0, 4)}>`);

    [rooms, players].forEach((arr) => {
      while (arr.length) {
        arr.pop();
      }
    });
  });

  socket.on("Dev query", function (data) {
    console.log(`ø Dev query <${socket.id.slice(0, 4)}>`);
    console.log("players", players);
    socket.emit("Dev queried", {
      rooms: rooms,
      players: players,
    });
  });

  socket.on("Load player", function (data) {
    console.log(`ø Load player <${socket.id.slice(0, 4)}>`, data);

    if (!data.playerName) {
      console.log("Load player sees that !data.playerName");
      data.playerName = `Player${Math.floor(Math.random() * 100)}`;
    }

    console.log("And just so you know, current players arr is:", players);

    let putativePlayerName = aUtils.alphanumerise(data.playerName);

    if (!putativePlayerName) {
      console.log("G74");
      return;
    }

    let player = data.truePlayerName
      ? players.find((playe) => playe.truePlayerName === data.truePlayerName)
      : null;

    if (player) {
      console.log(
        `>Using extant player ${player.playerName}${player.truePlayerName}`
      );
      io.in(player.socketId).disconnectSockets();
      player.socketId = socket.id;
    } else {
      let putativeTruePlayerName = `_${aUtils.randomString(16)}`;

      console.log(
        `>Creating new player ${putativePlayerName}${putativeTruePlayerName}`
      );

      player = new Player(
        putativeTruePlayerName,
        socket.id,
        putativePlayerName
      );
      players.push(player);
    }

    console.log(
      "€ Player loaded. I created a player and am about to send it:",
      player
    );
    socket.emit("Player loaded", { player });
  });

  socket.on("Update player data", function (data) {
    console.log(`ø Update player data <${socket.id.slice(0, 4)}>`, data);

    if (!data.player) {
      console.log("L31 You want to update player with nothing?");
      return;
    }

    let player = players.find((playe) => playe.socketId === socket.id);
    if (!player) {
      console.log(`L32 no player found.`);
      return;
    }

    console.log("Updating player data", data.player);
    Object.keys(data.player).forEach((k) => {
      let v = data.player[k];
      player[k] = v;
    });

    console.log("players arr after I updated player", players);
    socket.emit("Player loaded", { player });
  });

  socket.on("disconnecting", (data) => {});

  socket.on("disconnect", (data) => {
    console.log(
      `ø disconnect <${socket.id.slice(
        0,
        4
      )}> disconnected at ${new Date().toUTCString().slice(17, -4)}.`
    );
    let player = players.find((playe) => playe.socketId === socket.id);
    if (!player) {
      console.log(`B11 no player found.`);
      return;
    }

    makePlayerLeaveRoom(io, socket, player, data.roomName);

    //If this player's most recent room has been deleted, then delete this player.
    let mostRecentRoom = rooms.find(
      (roo) => roo.roomName === player.mostRecentRoom
    );
    console.log(
      "players arr was",
      players.map((playe) => playe.playerName)
    );
    if (!mostRecentRoom) {
      aUtils.deleteFromArray(players, { socketId: player.socketId });
    }
    console.log(
      "players arr now",
      players.map((playe) => playe.playerName)
    );
  });

  socket.on("Chat message", function (data) {
    console.log(`ø Chat message <${socket.id.slice(0, 4)}>`);
    let roomName = roomNameBySocket(socket);

    if (!roomName) {
      console.log("T27 None such room.");
      return;
    }

    let room = rooms.find((roo) => roo.roomName === roomName);

    if (!room) {
      console.log("T28 No such room to emit chat message to.");
      return;
    }

    let player = players.find((playe) => playe.socketId === socket.id);
    if (!player) {
      console.log(`T29 no player found.`);
      return;
    }
    data.sender = player.trim();

    io.in(room.roomName).emit("Chat message", data);
  });

  socket.on("Create room", function (data) {
    let putativeRoomName = aUtils.alphanumerise(data.roomName);

    console.log(
      `ø Create room. <${socket.id.slice(
        0,
        4
      )}> We'll create room "${putativeRoomName}".`
    );

    if (!putativeRoomName) {
      console.log("€ Room not created");
      socket.emit("Room not created", {
        msg: `Please supply a room name.`,
      });
      return;
    }

    if (
      aUtils.bannedRoomNames.includes(putativeRoomName) ||
      rooms.find((room) => room.roomName === putativeRoomName)
    ) {
      console.log("€ Room not created");
      socket.emit("Room not created", {
        msg: `Room ${putativeRoomName} already exists.`,
      });
      return;
    }

    let player = players.find((playe) => playe.socketId === socket.id);
    if (!player) {
      console.log(`T30 no player found.`);
      socket.emit("You should refresh");
      return;
    }

    let room = new Room(putativeRoomName, data.roomPassword);
    rooms.push(room);

    makePlayerEnterRoom(socket, player, data, room, true);
  });

  socket.on("Request entry", function (data) {
    console.log(`ø Request entry <${socket.id.slice(0, 4)}>`, data);
    let player = players.find((playe) => playe.socketId === socket.id);
    if (!player) {
      console.log(`C11 no player found, € You should refresh`);
      socket.emit("You should refresh");
      return;
    }

    makePlayerEnterRoom(socket, player, data);
  });

  socket.on("Request room data", function (data) {
    console.log(`ø Request room data <${socket.id.slice(0, 4)}>`, data);
    let room = rooms.find((roo) => roo.roomName === data.roomName);

    if (!room) {
      console.log("M45 No room found.");
      return;
    }

    if (!room.players.find((roomPlayer) => roomPlayer.socketId === socket.id)) {
      console.log(
        `${socket.id.slice(0, 4)} requested room data for ${
          room.roomName
        } but she isn't in this room.`
      );
      return;
    }

    socket.emit("Room data", { room: room.trim() });
  });

  socket.on("Leave room", function (data) {
    console.log(`ø Leave room <${socket.id.slice(0, 4)}>`, data);
    let player = players.find((playe) => playe.socketId === socket.id);
    if (!player) {
      console.log(`W11 No player found.`);
      return;
    }
    makePlayerLeaveRoom(io, socket, player, data.roomName);
  });

  socket.on("Give stars", function (data) {
    console.log(`ø Give stars <${socket.id.slice(0, 4)}>`, data);
    let roomName = roomNameBySocket(socket);

    if (!roomName) {
      console.log("U30 None such.");
      return;
    }

    let room = rooms.find((roo) => roo.roomName === roomName);

    if (!room) {
      console.log("U31 None such.");
      return;
    }

    let playerToStar = room.players.find(
      (roomPlayer) => roomPlayer.playerName === data.playerNameToStar
    );

    if (playerToStar) {
      playerToStar.stars += data.starIncrement;

      updatePlayersWithRoomData(roomName);
    }
  });

  socket.on("Update room password", function (data) {
    let room = rooms.find((roo) => roo.roomName === data.roomName);

    if (!room) {
      console.log(`K21 No such room ${data.roomName}.`);
      return;
    }

    let isThisPlayerInTheRoom = room.players.find(
      (playe) => playe.socketId === socket.id
    );

    if (!isThisPlayerInTheRoom) {
      console.log(
        `K22 How can this player <${socket.id.slice(
          0,
          4
        )}> be asking to change ${
          room.roomName
        }'s password, when they don't appear to be in the room?`
      );
      return;
    }

    room.roomPassword = data.roomPassword;

    io.in(data.roomName).emit("Room password updated", {
      roomPassword: data.roomPassword,
      roomName: data.roomName,
    });
  });

  socket.on("Boot player", function (data) {
    console.log(
      `ø Boot player <${socket.id.slice(0, 4)}> we'll boot ${data.playerName}`
    );
    let player = players.find((playe) => playe.playerName === data.playerName);
    makePlayerLeaveRoom(io, socket, player, data.roomName);
  });

  socket.on("I was booted", function (data) {
    console.log(`ø I was booted <${socket.id.slice(0, 4)}>`);
    socket.leave(data.roomName);
  });

  function roomsBySocket() {
    return [...io.sockets.adapter.rooms.entries()];
  }

  function roomNameBySocket(socket) {
    let roomNameObj = roomsBySocket().find(
      (subArr) => subArr[0] !== socket.id && subArr[1].has(socket.id)
    );
    return roomNameObj ? roomNameObj[0] : null;
  }
});

function isSocketActive(io, socketId) {
  // console.log("---------------");
  // console.log(`Looking for socketId ${socketId}.`);
  const activeSocketIds = [...io.of("/").adapter.sids.entries()].map(
    (subArr) => subArr[0]
  );
  // console.log("activeSocketIds", activeSocketIds);
  // console.log("/--------------");
  return activeSocketIds.includes(socketId);
}

function updatePlayersWithRoomData(roomName, room) {
  if (!roomName) {
    console.log("L51");
    return;
  }

  if (!room) {
    room = rooms.find((roo) => roo.roomName === roomName);
  }

  io.in(roomName).emit("Room data", { room: room.trim() });
}

function makePlayerEnterRoom(socket, player, sentData, room, isRoomboss) {
  let { roomName, roomPassword } = sentData;

  console.log(
    `<${socket.id.slice(0, 4)}> ${player.playerName}${
      player.truePlayerName
    } wants to enter room "${roomName}".`
  );

  if (!room) {
    room = rooms.find((room) => room.roomName === roomName);
  }

  if (!room) {
    console.log("€ Entry denied. Room not found.");
    socket.emit("Entry denied", { msg: `Room ${roomName} not found.` });
    return;
  }

  if (room.roomPassword && room.roomPassword !== roomPassword) {
    console.log("€ Entry denied. Password incorrect.");
    socket.emit("Entry denied", {
      msg: `Password ${roomPassword} for ${roomName} was incorrect.`, //omega Adjust this msg to be less revealing.
    });
    return;
  }

  if (
    room.players.find((roomPlayer) => roomPlayer.socketId === player.socketId)
  ) {
    console.log(
      `€ Entry denied. ${player.playerName}${player.truePlayerName} already in ${room.roomName}.`
    );
    socket.emit("Entry denied", {
      msg: `I believe you are already in room ${room.roomName}. Perhaps in another tab?`,
    });
    return;
  }

  if (player.mostRecentRoom !== room.roomName) {
    console.log(
      `Wiping player stats for ${player.playerName}${player.truePlayerName} as they are entering a new room, ie not re-entering.`
    );
    resetPlayerGameStats(player);
  }

  aUtils.suffixPlayerNameIfNecessary(room, player);
  player.isRoomboss = isRoomboss;

  room.players.push(player);
  socket.join(room.roomName);

  player.mostRecentRoom = room.roomName;

  socket.emit("Entry granted", {
    room: room.trim(),
    player,
  });

  socket.to(room.roomName).emit("Player entered your room", {
    player: player.trim(),
    room: room.trim(),
  });

  console.log(
    `<${socket.id.slice(0, 4)}> ${player.playerName}${
      player.truePlayerName
    } entered room ${room.roomName}.`
  );
}

function resetPlayerGameStats(player) {
  Object.keys(player.gameStatProperties).forEach((gameStatKey) => {
    let gameStatDefaultValue = player.gameStatProperties[gameStatKey];
    player[gameStatKey] = gameStatDefaultValue;
  });
}

function makePlayerLeaveRoom(io, socket, leavingPlayer, roomName) {
  console.log("\n");
  console.log("* * *");
  console.log("\n");
  console.log(
    `<${socket.id.slice(0, 4)}> Leave room for ${leavingPlayer.playerName}${
      leavingPlayer.truePlayerName
    }`
  );
  let room;

  if (true) {
    if (!leavingPlayer) {
      console.log(`makePlayerLeaveRoom sees that leavingPlayer is undefined.`);
      return;
    }

    room = rooms.find((roo) => roo.roomName === roomName);

    if (!room) {
      room = rooms.find((roo) =>
        roo.players.find(
          (rooPlayer) => rooPlayer.socketId === leavingPlayer.socketId
        )
      );
    }

    if (!room) {
      console.log(
        `<${socket.id.slice(
          0,
          4
        )}> to leave room ${roomName} but no such room exists.`
      );
      return;
    }

    if (
      !room.players.find(
        (roomPlayer) => roomPlayer.socketId === leavingPlayer.socketId
      )
    ) {
      console.log(
        `<${socket.id.slice(0, 4)}> not even in ${room ? room.roomName : room}`
      );
      return;
    }
  }

  console.log(
    `<${socket.id.slice(0, 4)}> ${leavingPlayer.playerName}${
      leavingPlayer.truePlayerName
    } is leaving room ${room.roomName}`
  );

  if (room.players.length === 1) {
    console.log("\n");
    console.log(
      "Rooms array was",
      rooms.map((roo) => roo.roomName)
    );

    console.log("Delete this Room as its only player has left.");
    aUtils.deleteFromArray(rooms, { roomName: room.roomName });

    console.log(
      "Rooms array now",
      rooms.map((roo) => roo.roomName)
    );

    console.log(
      "I deleted the room, so now I'm looking at the players whose most recent room was that one."
    );

    players.forEach((playe) => {
      if (playe.mostRecentRoom === room.roomName) {
        if (!isSocketActive(io, playe.socketId)) {
          console.log(
            `Deleting player ${playe.playerName}${playe.truePlayerName} as they're inactive.`
          );
          aUtils.deleteFromArray(players, {
            truePlayerName: playe.truePlayerName,
          });
        } else {
          console.log(
            `Wiping player stats for ${playe.playerName}${playe.truePlayerName} as they're still active.`
          );
          console.log("This player was:", playe);
          resetPlayerGameStats(playe);
          console.log("This player now:", playe);
        }
      }
    });
    console.log("\n");
    return;
  }

  room.players = room.players.filter(
    (roomPlayer) => roomPlayer.socketId !== leavingPlayer.socketId
  );

  if (leavingPlayer.isRoomboss) {
    let newRoomboss =
      room.players[Math.floor(Math.random() * room.players.length)];

    newRoomboss.isRoomboss = true;

    socket.to(newRoomboss.socketId).emit("Player loaded", {
      player: newRoomboss,
      msg: "You are now the roomboss.",
    });
  }

  if (socket.id === leavingPlayer.socketId) {
    socket.leave(room.roomName);
    socket.to(room.roomName).emit("Player left your room", {
      player: leavingPlayer,
      room: room.trim(),
    });
  } else {
    console.log(
      `€ You're booted ${leavingPlayer.playerName}${leavingPlayer.truePlayerName}`
    );
    socket.to(leavingPlayer.socketId).emit("You're booted", {
      msg: `You've been booted from ${room.roomName}.`,
      roomName: room.roomName,
    });
    io.in(room.roomName)
      .except(leavingPlayer.socketId)
      .emit("Player left your room", {
        player: leavingPlayer,
        room: room.trim(),
        isBoot: true,
      });
  }

  console.log("\n");
  console.log("* *");
  console.log("\n");
}
