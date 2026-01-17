(async() => {
// Embedded imports
const websocket = (() => {
let _onmessage = () => {};
let ws;
function connect(url) {
    if (ws) {
        console.error(`WebSocket: websocket already exists`);
        return false;
    }
    try {
        ws = new WebSocket(url);

        ws.onmessage = (event) => {
            _onmessage(event?.data);
        };
    } catch {
        return false;
    }
    return true;
}
function disconnect() {
    if (!ws) {
        console.error(`WebSocket: websocket not found`);
        return false;
    }
    ws.close();
    ws = null;
    return true;
}
function send(data) {
    if (!ws) {
        console.error(`WebSocket: websocket not found`);
        return false;
    }
    ws.send(data);
    return true;
}
const api = { connect, disconnect, send };

Object.defineProperty(api, "onmessage", {
    get() {
        return _onmessage;
    },
    set(fn) {
        _onmessage = fn;
    }
});
return api;
})();
const process = (() => {
function exit(code) { 
    Deno.exit(code);
};
return { exit};
})();
const io = (() => {
function print(...data) {
    const output = data.map(d => 
        d.toString().replaceAll("\r", "\n")
    ).join(" ");
    Deno.stdout.writeSync(new TextEncoder().encode(output));
}

function println(...data) {
    const output = data.map(d => 
        d.toString().replaceAll("\r", "\n")
    ).join(" ");
    Deno.stdout.writeSync(new TextEncoder().encode(output + "\n"));
}

function read(p) {
    const d = prompt(p);
    return d;
}


function clear() {
    Deno.stdout.writeSync(new TextEncoder().encode("\x1b[2J\x1b[3J\x1b[H"));
}
return { print, println, read, clear};
})();
String.prototype.toNumber=function(){return Number(this)}
websocket.connect("wss://chats.mistium.com")
websocket.onmessage= (data) => { 
io.println(data)
}})()