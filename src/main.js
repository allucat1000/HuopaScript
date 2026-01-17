import { parse } from "./parser.js";
import { compile } from "./compiler.js";

const path = Deno.args?.[0] ?? "main.hsc";
const save = Deno.args?.[1] ?? path.replace(".hsc", ".js");

const code = await Deno.readTextFile(path);

const perf = performance.now();

function colorizeJSON(obj) {
  const json = JSON.stringify(obj, null, 2);
  return json
    // keys: cyan
    .replace(/"(\w+)"(?=:)/g, "\x1b[36m$1\x1b[0m")
    // string vals: green
    .replace(/: "(.*?)"/g, ': \x1b[32m"$1"\x1b[0m')
    // numbers: yellow
    .replace(/: (\d+)/g, ': \x1b[33m$1\x1b[0m')
    // booleans: magenta
    .replace(/: (true|false)/g, ': \x1b[35m$1\x1b[0m')
    // null: gray
    .replace(/: null/g, ': \x1b[90mnull\x1b[0m');
}

const a = parse(code);

const pTime = performance.now();

console.log("\x1b[32m%s\x1b[0m", "AST:\n")
console.log(colorizeJSON(a.ast)
);

function parseErrors(e) {
  let r = "";
  for (const o of e) {
    r += "  " + o.error + "\n";
  }
  return r;
}

console.log("\x1b[35m%s\x1b[0m", `\nparsing time: ${pTime - perf}ms\n`);

const c = await compile(a.ast);
console.log("\x1b[35m%s\x1b[0m", `compile time: ${performance.now() - pTime}ms\n`)
//console.log("\x1b[32m%s\x1b[0m", "Compiled code: \n")
console.log("\x1b[31m%s\x1b[0m", `Parser Errors:
${a.errors.join("\n")}
Compiler Errors:
${parseErrors(c.errors)}
`);
if (c.errors.length === 0 && a.errors.length === 0) {
  await Deno.writeTextFile(save, c.code)
}