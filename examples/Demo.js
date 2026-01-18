(async() => {
// Embedded imports
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
return { print, println, read, clear }
})();
const time = (() => {
function epochNow() { 
    return performance.now();
};

async function sleep(time) { 
    await new Promise((r) => setTimeout(r, time));
};
return { epochNow, sleep }
})();
const keyboard = (() => {
let escapeKey = 3;

let keyBuffer = [];
let byteBuffer = [];

(async () => {
    const buffer = new Uint8Array(1);
    const decoder = new TextDecoder();
    
    while (true) {
        const d = await Deno.stdin.read(buffer);
        if (d === null) break;
        if (buffer[0] === escapeKey) {
            Deno.stdin.setRaw(false);
            console.log("");
            Deno.exit(0);
        }
        
        if (buffer[0] === 27) {
            const seqBuf = new Uint8Array(2);
            const read = await Deno.stdin.read(seqBuf);
            
            if (read && seqBuf[0] === 91) {
                if (seqBuf[1] === 65) keyBuffer.push(1001);
                else if (seqBuf[1] === 66) keyBuffer.push(1002);
                else if (seqBuf[1] === 67) keyBuffer.push(1003);
                else if (seqBuf[1] === 68) keyBuffer.push(1004);
                else keyBuffer.push(buffer[0]);
            } else {
                keyBuffer.push(buffer[0]);
            }
        } 
        else if (buffer[0] >= 194 && buffer[0] <= 244) {
            byteBuffer.push(buffer[0]);
            
            let bytesToRead = 0;
            if (buffer[0] >= 194 && buffer[0] <= 223) bytesToRead = 1;
            else if (buffer[0] >= 224 && buffer[0] <= 239) bytesToRead = 2;
            else if (buffer[0] >= 240 && buffer[0] <= 244) bytesToRead = 3;
            
            for (let i = 0; i < bytesToRead; i++) {
                await Deno.stdin.read(buffer);
                byteBuffer.push(buffer[0]);
            }
            
            const decoded = decoder.decode(new Uint8Array(byteBuffer));
            for (const char of decoded) {
                keyBuffer.push(-char.charCodeAt(0));
            }
            byteBuffer = [];
        }
        else {
            keyBuffer.push(buffer[0]);
        }
    }
})();

function enableRaw() {
    Deno.stdin.setRaw(true);
}

function disableRaw() {
    Deno.stdin.setRaw(false);
}

function clearBuffer() {
    keyBuffer = [];
}

function getChar() { 
    return keyBuffer.shift() || 0;
}

function setQuitChar(key) {
    escapeKey = key;
}

function charToKey(char) {
    if (char < 0) return String.fromCharCode(-char);
    
    if (char === 1001) return "";
    if (char === 1002) return "";
    if (char === 1003) return "";
    if (char === 1004) return "";
    
    if (char === 13 || char === 10) return "\n";
    if (char === 27) return "";
    
    if (char >= 32 && char <= 126) return String.fromCharCode(char);
    
    return "";
}
return { enableRaw, disableRaw, getChar, charToKey, setQuitChar, clearBuffer }
})();
const process = (() => {
function exit(code) { 
    Deno.exit(code);
};
return { exit }
})();
const fetch = (() => {
async function get(url) { 
    const r = await globalThis.fetch(url);
    if (r.ok) {
        return { text: await r.text(), ok: true, status: r.status };
    } else {
        console.error(`NetworkError: Failed to fetch '${url}'`);
        return { ok: false, status: r.status };
    }
};
async function post(url, headers, body) {
    const r = await globalThis.fetch(url, {
        method: "POST",
        headers: headers,
        body
    });
    if (r.ok) {
        return { text: await r.text(), ok: true, status: r.status };
    } else {
        console.error(`NetworkError: Failed to fetch '${url}'`);
        return { ok: false, status: r.status };
    }
}
return { get, post }
})();
const json = (() => {
function stringify(data) {
    return JSON.stringify(data);
}
function parse(data) {
    try {
        return JSON.parse(data);
    } catch (err) {
        console.error(`SyntaxError: ${err.message}`);
        return {};
    }
}
return { stringify, parse }
})();
String.prototype.toNumber=function(){return Number(this)}; Object.prototype.entries=function(){return Object.entries(this)}; Object.prototype.keys=function(){return Object.keys(this)}; Object.prototype.values=function(){return Object.values(this)};
function numbers() { 
let bleh = "2"
let grah = bleh.toNumber()
let frr = ((1) | 0)
let yum = frr.toString()
io.println("string to number: " + ( grah + 1 ))
io.println("int to string: " + ( yum + "a" ))
let perf = time.epochNow()
let a = ((2147483649) | 0)
let b = (((-1) | 0) >>> 0)
io.println("32bit signed overflow: " + a)
io.println("32bit unsigned underflow: " + b)
let c = 0.1 + 0.2
io.println("floating point accuracy issue: " + c)
io.println("performance: " + ( time.epochNow() - perf ) + "ms")
}
async function text() { 
keyboard.enableRaw()
let text = ""
let lastChar = ((0) | 0)
while (lastChar != 13) {
let char = ((keyboard.getChar()) | 0)
let s = keyboard.charToKey(char)
if (char != 0) {
io.clear()
if (char == 127) {
text = text.slice(0, -1)
}
lastChar = ((char) | 0)
text += s
io.print(text)
}
await time.sleep(10)
}
keyboard.disableRaw()
}
async function fetching() { 
let data = await fetch.get("https://example.com")
let page = data.text
io.println("example.com html: " + page)
}
function objects() { 
let obj = { "hi": "epic" }
const val = obj.hi
io.println("object value: " + val)
let arr = ["blehh"]
let arrVal = arr[0]
io.println("array value: " + arrVal)
arr = ["hi"]
arrVal = arr[0]
io.println("arr reassignment: " + arrVal)
let arrayString = "[\"1\"]"
arr = json.parse(arrayString)
io.println("array loaded from string (stringified for log): " + json.stringify(arr))
let nestedobj = { "hello": { "hi": "yay" } }
io.println("nested object: " + json.stringify(nestedobj))
io.println("nested object value: " + nestedobj.hello.hi)
arr.push("hi")
io.println("array with new item 'hi': " + json.stringify(arr))
io.println("object entries: " + obj.entries())
}
function fib() { 
let a = ((0) | 0)
let b = ((1) | 0)
let c = ((0) | 0)
let count = ((0) | 0)
while (count < 10) {
c = ((a + b) | 0)
a = ((b) | 0)
b = ((c) | 0)
count += ((1) | 0)
}
io.println("fib 10x res: " + c)
}
numbers()
fib()
objects()
await fetching()
await time.sleep(3000)
await text()
process.exit(0)})()