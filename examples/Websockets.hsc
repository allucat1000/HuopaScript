import "websocket";
import "process";
import "io";

websocket.connect("wss://chats.mistium.com");

websocket.onmessage = (object data) => {
	io.println(data);
}

