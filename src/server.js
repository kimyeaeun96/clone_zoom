import http from "http";
// import WebSocket from "ws";
import { Server } from "socket.io";
import express from "express";
import { count } from "console";
import { instrument } from "@socket.io/admin-ui";
const app = express();

app.set("view engine", "pug"); // pug로 view engine 설정
app.set("views", __dirname + "/views"); // express에 template이 어디 있는지 지정
app.use("/public", express.static(__dirname + "/public")); // public url 생성, 유저에게 파일 공유
app.get("/", (_, res) => res.render("home")); // home.pug를 render 하는 route handler 생성
app.get("/*", (_, res) => res.redirect("/"));

const handleListen = () => console.log(`Listening on http://localhost:3000`);

// express는 http만 지원함. ws를 위한 함수를 새로 작성해야함. node.js에 이미 http 모듈 설치되어있어 따로 인스톨 ㄴ
// createServer() 하려면 requestListener() 경로가 필요함.
const httpServer = http.createServer(app);
const wsServer = new Server(httpServer, {
  cors: {
    origin: ["https://admin.socket.io"],
    credentials: true,
  },
}); // http 위에 socket 서버
instrument(wsServer, {
  auth: false,
});

function publicRooms() {
  const {
    sockets: {
      adapter: { sids, rooms },
    },
  } = wsServer; // wsServer.sockets.adapter
  const publicRooms = [];
  rooms.forEach((_, key) => {
    if (sids.get(key) === undefined) {
      publicRooms.push(key);
    }
  });
  return publicRooms; // public 개인/공개방, sids개인방, 퍼블릭룸에서 sids를 없앤거임.
}

function countRoom(roomName) {
  return wsServer.sockets.adapter.rooms.get(roomName)?.size;
}

wsServer.on("connection", (socket) => {
  socket["nickname"] = "Anon";
  socket.onAny((event) => {
    // socket.onAny(): socket에 있는 모든 event를 봄.
    console.log(wsServer.sockets.adapter);
    console.log(`socket event: ${event}`);
  });
  // 방 입장 알림
  socket.on("enter_room", (roomName, done) => {
    // console.log(`socket.id is: `, socket.id);
    // console.log(socket.rooms); // socket.rooms: 클라이언트가 어느 방에 있는지
    socket.join(roomName); // socket과 room 연결
    done();
    socket.to(roomName).emit("welcome", socket.nickname, countRoom(roomName)); // 하나의 방에만 노티스 전달
    wsServer.sockets.emit("room_change", publicRooms()); // 모든 방에 전달 브로드캐스트
  });
  // 방 퇴장 중간
  socket.on("disconnecting", () => {
    socket.rooms.forEach((room) =>
      socket.to(room).emit("bye", socket.nickname, countRoom(room) - 1)
    );
  });
  // 방 퇴장
  socket.on("disconnect", () => {
    wsServer.sockets.emit("room_change", publicRooms()); // 모든 방에 전달
  });
  // 메세지
  socket.on("new_message", (msg, room, done) => {
    socket.to(room).emit("new_message", `${socket.nickname}: ${msg}`);
    done();
  });
  // 닉네임
  socket.on("nickname", (nickname) => {
    socket["nickname"] = nickname;
  });
});

/*
function onSocketClose() {
  console.log("disconnected to browser");
}
const wss = new WebSocket.Server({ server }); // http, ws 서버 모두 사용 가능. http서버 안돌릴거면 ws만 해도 돼서 이과정이 필수는 아님.
const sockets = [];

// 여기서 socket: 브라우저와의 연결
wss.on("connection", (socket) => {
  sockets.push(socket);
  socket["nickname"] = "Anon"; // socket에 nickname 프로퍼티를 줌. Anon
  console.log("Connected to browser");
  socket.on("close", onSocketClose);
  socket.on("message", (msg) => {
    // JSON.stringify() : JSON Object -> string
    const message = JSON.parse(msg);
    switch (message.type) {
      case "new_message":
        sockets.forEach((aSocket) =>
          aSocket.send(`${socket.nickname}: ${message.payload}`)
        );
      case "nickname":
        socket["nickname"] = message.payload; // 익명이면 Anon, 설정 하면 닉네임
    }
  });
}); // on -> socket(백엔드에 연결된 사람의 정보) 가져옴
*/

httpServer.listen(3000, handleListen); // app.listen(3000, handleListen)
/*
http : stateless. req가 있어야만 res 서버-서버 / 서버 - 클라 간의 소통 가능
ws : ws connection이 되면 계속 연결 유지. 서버 - 서버 / 서버 - 클라 간의 소통 가능

socket: 연결된 브라우저와 contact(연락)라인
*/
