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
return { print, println, read, clear};
})();
String.prototype.toNumber=function(){return Number(this)}
io.println("Hello World!")})()