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
        d ? d.toString().replaceAll("\r", "\n") : ""
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
function newDate(date) {
    let d;
    try {
        d = new Date(date);
    } catch {
        return {};
    }
    return {
        h: d.getHours(),
        m: d.getMinutes(),
        s: d.getSeconds(),
        ms: d.getMilliseconds(),

        uH: d.getUTCHours(),
        uM: d.getUTCMinutes(),
        uS: d.getUTCSeconds(),
        uMs: d.getUTCMilliseconds(),

        d: d.getDate(),
        day: d.getDay(),
        y: d.getFullYear(),
        mo: d.getMonth(),

        uD: d.getUTCDate(),
        uDay: d.getUTCDay(),
        uY: d.getUTCFullYear(),
        uMo: d.getUTCMonth()
    }
}
function format(date) {
    function pad(n) {
        return n.toString().padStart(2, "0");
    }
    return `${date.y}-${pad(date.mo + 1)}-${pad(date.d)} ${pad(date.h)}:${pad(date.m)}`;
}
return { epochNow, sleep, newDate, format }
})();
String.prototype.toNumber=function(){return Number(this)}; Object.prototype.entries=function(){return Object.entries(this)}; Object.prototype.keys=function(){return Object.keys(this)}; Object.prototype.values=function(){return Object.values(this)};
let perf = time.epochNow()
let a = ((0) | 0)
let b = ((1) | 0)
let c = ((0) | 0)
let count = ((0) | 0)
while (count < 10) {
c = ((a + b) | 0)
a = ((b) | 0)
b = ((c) | 0)
io.println(c)
count += ((1) | 0)
}
io.println("took: " + ( time.epochNow() - perf ) + "ms")})()