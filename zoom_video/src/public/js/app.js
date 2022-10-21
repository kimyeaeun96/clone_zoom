const socket = io();

const myFace = document.getElementById("myFace");
const muteBtn = document.getElementById("mute");
const cameraBtn = document.getElementById("camera");
const camerasSelect = document.getElementById("cameras");
const call = document.getElementById("call");

call.hidden = true;

let myStream;
let muted = false;
let cameraOff = false;
let roomName;
let myPeerConnection;
let myDataChannel;

/* call */
/* 내장 카메라 id 불러옴 */
async function getCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === "videoinput");
    const currentCamera = myStream.getVideoTracks()[0];
    cameras.forEach((camera) => {
      const option = document.createElement("option");
      option.value = camera.deviceId;
      option.innerText = camera.label;
      /* stream의 현재 카메라와 paint할 떄의 카메라 옵션을 가져오고 label 비교 */
      if (currentCamera.lable == camera.label) {
        option.selected = true;
      }
      camerasSelect.appendChild(option);
    });
  } catch (e) {
    console.log(e);
  }
}
/* 화면에 카메라 불러옴 */
async function getMedia(deviceId) {
  /* deviceId 없을 때 실행 (cameras 만들기 전)*/
  const initialConstraints = {
    audio: true,
    video: { facingMode: "user" },
  };
  /* 다른 id로 새로운 stream 만듦*/
  const cameraConstraints = {
    audio: true,
    video: { deviceId: { exact: deviceId } },
  };
  try {
    myStream = await navigator.mediaDevices.getUserMedia(
      deviceId ? cameraConstraints : initialConstraints
    );
    myFace.srcObject = myStream;
    /* 처음 getMedia()할때만 실행됨*/
    if (!deviceId) {
      await getCameras();
    }
  } catch (e) {
    console.log(e);
  }
}

// getMedia();

/* 음소거 */
function handleMuteClick() {
  myStream
    .getAudioTracks()
    .forEach((track) => (track.enabled = !track.enabled));
  if (!muted) {
    muteBtn.innerText = "Unmute";
    muted = true;
  } else {
    muteBtn.innerText = "Mute";
    muted = false;
  }
}

/* 카메라 on off */
function handleCameraClick() {
  myStream
    .getVideoTracks()
    .forEach((track) => (track.enabled = !track.enabled));
  if (cameraOff) {
    cameraBtn.innerText = "Turn Camera Off";
    cameraOff = false;
  } else {
    cameraBtn.innerText = "Turn Camera On";
    cameraOff = true;
  }
}
async function handleCameraChange() {
  await getMedia(camerasSelect.value);
  if (myPeerConnection) {
    const videoTrack = myStream.getVideoTracks()[0]; // my stream
    const videoSender = myPeerConnection
      .getSenders() // Sender: peer로 보내진 media stream track을 컨트롤 함
      .find((sender) => sender.track.kind === "video");
    videoSender.replaceTrack(videoTrack); // videotrack을 새로 받는다.
  }
}

muteBtn.addEventListener("click", handleMuteClick);
cameraBtn.addEventListener("click", handleCameraClick);
camerasSelect.addEventListener("input", handleCameraChange);

/* welcomeForm : room */
const welcome = document.getElementById("welcome");
const welcomeForm = welcome.querySelector("form");

async function initCall() {
  welcome.hidden = true;
  call.hidden = false;
  await getMedia();
  makeConnection();
}

async function handleWelcomeSubmit(event) {
  event.preventDefault();
  const input = welcomeForm.querySelector("input");
  /* 방 입장 */
  await initCall(); // 미디어를 불러오는 속도가 websocket 속도보다 느림. 미디어를 먼저 가져온다.
  socket.emit("join_room", input.value);
  roomName = input.value;
  input.value = "";
}

welcomeForm.addEventListener("submit", handleWelcomeSubmit);

// socket code

// B가 들어오면 A에서 welcome 이벤트 실행
socket.on("welcome", async () => {
  myDataChannel = myPeerConnection.createDataChannel("chat");
  myDataChannel.addEventListener("message", (event) => console.log(event.data));
  console.log("made data channel");
  /* peer A : make offer*/
  const offer = await myPeerConnection.createOffer();
  myPeerConnection.setLocalDescription(offer); //setLocalDescription: Peer A에게 description을 알려줌
  console.log("Sent the offer");
  socket.emit("offer", offer, roomName);
});
/* Peer B : answer */
socket.on("offer", async (offer) => {
  myPeerConnection.addEventListener("datachannel", (event) => {
    myDataChannel = event.channel;
    myDataChannel.addEventListener("message", (event) =>
      console.log(event.data)
    );
  });
  console.log("received the offer");
  myPeerConnection.setRemoteDescription(offer); // B가 접속하고 offer받지만 너무 빠르게 이뤄져서 mypeerconnection 실행 아직 안됨
  const answer = await myPeerConnection.createAnswer(); // answer를 만들고
  myPeerConnection.setLocalDescription(answer); // A에게 answer를 보낸다
  socket.emit("answer", answer, roomName);
  console.log("sent the answer");
});
/* A는 B가 보낸 answer 받는다. */
socket.on("answer", (answer) => {
  console.log("received the answer");
  myPeerConnection.setRemoteDescription(answer);
});

/* candidate를 받으면 내 브라우저에 저장 */
socket.on("ice", (ice) => {
  console.log("received candidate");
  myPeerConnection.addIceCandidate(ice);
});

// RTC code
function makeConnection() {
  // 양쪽 브라우저에 peer to peer connection을 만든다
  myPeerConnection = new RTCPeerConnection({
    iceServers: [
      // stun 서버: 컴퓨터가 공용 ip를 찾을 수 있게 함.
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
          "stun:stun2.l.google.com:19302",
          "stun:stun3.l.google.com:19302",
          "stun:stun4.l.google.com:19302",
        ],
      },
    ],
  });
  myPeerConnection.addEventListener("icecandidate", handleIce);
  myPeerConnection.addEventListener("addstream", handleAddStream);
  // 양쪽 브라우저로부터 미디어 데이터를 받고 peer 연결에 track 추가
  myStream
    .getTracks()
    .forEach((track) => myPeerConnection.addTrack(track, myStream));
}

/* Peer A, B는 서로 candidate를 주고받는다 */
function handleIce(data) {
  console.log("sent candidate");
  socket.emit("ice", data.candidate, roomName);
}

/* peer 간의 stream */
function handleAddStream(data) {
  const peerFace = document.getElementById("peerFace");
  peerFace.srcObject = data.stream;
}

// data channel
