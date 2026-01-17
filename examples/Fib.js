(async() => {
// Embedded imports
const io = (() => {
function print(...data) { 
    const nD = [];
    for (const d of data) {
        nD.push(d.toString().replaceAll("\\n", "\n"));
    }
    console.log(...nD);
};
function read(p) {
    const d = prompt(p);
    return d;
}
function clear() {
    console.clear();
}
return { print, read, clear };
})();
let a = ((0) | 0)
let b = ((1) | 0)
let c = ((0) | 0)
let count = ((0) | 0)
function fib() { 
if (count == 10) {
return 
}
c = ((a + b) | 0)
a = ((b) | 0)
b = ((c) | 0)
io.print(c)
count += ((1) | 0)
fib()
}
fib()})()