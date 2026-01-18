let home;
let homeWin;

let homeDir;

let imports = [];

Object.defineProperty(Error.prototype, "lineNumber", {
    configurable: true,
    enumerable: false,
    get: function () {
        if (!this.stack) return undefined;

        const match = this.stack.match(/:(\d+):\d+\)?$/m);
        return match ? Number(match[1]) : undefined;
    }
});

export async function compile(ast) {
    const errors = [];
    const defined = [];
    const currentScope = [];
    imports = [];
    let r = await compileLevel(ast, currentScope, defined, errors, 1, { toplevel: true });
    r = embedImports(imports) + r.trim() + "})()";
    if (errors.length > 0) 
        return { code: "", errors }

    try {
        new Function(r);
    } catch (e) {
        //console.log(r);
        errors.push({ line: e.lineNumber, error: `OutputCheckError: ${e.name}: ${e.message}`});
        return { code: "", errors }
    }
    
    return { code: r, errors: [] };
}

function embedImports(imports) {
    let out = "";

    for (const imp of imports) {
        const props = imp.properties?.map(p => p.propName).join(", ") || "";
        out += `
const ${imp.module} = (() => {
${imp.code.trim()}
return ${imp.customReturn ? imp.customReturn : ("{ " + imp.functions.map(f => f.name).join(", ") + (props ? ", " + props : "") + " }")}
})();`;
    }

    return `(async() => {
// Embedded imports
${out.trim()}
String.prototype.toNumber=function(){return Number(this)}; Object.prototype.entries=function(){return Object.entries(this)}; Object.prototype.keys=function(){return Object.keys(this)}; Object.prototype.values=function(){return Object.values(this)};
`;
}

const unaryOps = [
    "!"
];

const operatorTypes = {
    "+": {
        number: "number",
        string: "string"
    },
    "-": {
        number: "number"
    },
    "+=": {
        number: "number",
        string: "string"
    },
    "<": {
        number: "bool"
    },
    ">": {
        number: "bool"
    },
    "<=": {
        number: "bool"
    },
    ">=": {
        number: "bool"
    },
    "==": {
        number: "bool",
        string: "bool",
        boolean: "bool"
    },
    "!=": {
        number: "bool",
        string: "bool",
        boolean: "bool"
    },
    "||": {
        boolean: "bool",
        string: "bool",
        number: "bool"
    },
    "&&": {
        boolean: "bool",
        string: "bool",
        number: "bool"
    },
    "!": {
        string: "bool",
        number: "bool",
        boolean: "bool",
    }
};

function upsertSymbol(scope, symbol) {
    const i = scope.findIndex(e => e.name === symbol.name);
    if (i !== -1) {
        scope[i] = symbol;
    } else {
        scope.push(symbol);
    }
}

const propertyTypes = {
    string: {
        length: {
            type: "number",
            convert: "length",
            propType: "str"
        },
        slice: {
            type: "string",
            convert: "slice",
            propType: "func",
            params: ["int", "int"],
            variadic: true
        },
        trim: {
            type: "string",
            convert: "trim",
            propType: "func",
            params: [],
            variadic: false
        },
        toNumber: {
            type: "number",
            convert: "toNumber",
            propType: "func",
            params: [],
            variadic: false
        },
        split: {
            type: "array",
            convert: "split",
            propType: "func",
            params: ["string"],
            variadic: false
        }
    },
    number: {
        toString: {
            type: "string",
            convert: "toString",
            propType: "func",
            params: [],
            variadic: false
        }
    },
    object: {
        keys: {
            type: "array",
            convert: "keys",
            propType: "func",
            params: [],
            variadic: false
        },
        values: {
            type: "array",
            convert: "values",
            propType: "func",
            params: [],
            variadic: false
        },
        entries: {
            type: "array",
            convert: "entries",
            propType: "func",
            params: [],
            variadic: false
        }
    },
    array: {
        slice: {
            type: "array",
            convert: "slice",
            propType: "func",
            params: ["int", "int"],
            variadic: true
        },
        join: {
            type: "string",
            convert: "join",
            propType: "func",
            params: ["string"],
            variadic: false
        },
        push: {
            type: "void",
            convert: "push",
            propType: "func",
            params: ["any"],
            variadic: true
        }
    }
};

function resolveType(type) {
    const t = varTypes.find(e => e.name === type);
    return t?.type ?? type;
}


const varTypes = [
    // Ints
    { name: "int", type: "number" },
    { name: "uint", type: "number" },

    // Floats
    { name: "float", type: "number" },

    // Other
    { name: "string", type: "string" },
    { name: "void", type: "void" },
    { name: "bool", type: "boolean" },
    { name: "null", type: "void" },

    // Objects
    { name: "object", type: "object" },
    { name: "array", type: "array" }
];

function normalizeType(type) {
    if (!type || type.kind !== "type") return type;

    let name = type.name;
    if (["int", "uint", "float"].includes(name)) name = "number";

    let params = type.params?.map(normalizeType) ?? [];

    if ((name === "array" || name === "object") && params.length === 0) {
        params = [{ kind: "type", name: "any", params: [] }];
    }

    return { kind: "type", name, params };
}

function isAssignable(from, to) {
    from = normalizeType(from);
    to = normalizeType(to);

    if (from.kind === "union") {
        return from.types.some(t => isAssignable(t, to));
    }

    if (to.kind === "union") {
        return to.types.some(t => isAssignable(from, t));
    }

    if (to.name === "any") return true;
    if (from.name !== to.name) return false;

    if (to.params.length === 0) return true;
    if (from.params.length !== to.params.length) return false;

    for (let i = 0; i < to.params.length; i++) {
        const f = from.params[i];
        const t = to.params[i];

        if (f.name === "any") continue;

        if (!isAssignable(f, t)) {
            return false;
        }
    }
    return true;
}

function typeToString(t) {
    if (!t) return "unknown";
    if (t.kind === "union") {
        return t.types.map(typeToString).join(" | ");
    }
    if (typeof t === "string") return t;
    if (t.kind === "type") {
        if (!t.params.length) return t.name;
        return `${t.name}<${t.params.map(typeToString).join(", ")}>`;
    }
    return "unknown";
}

function getTokenType(tok, scopes, errors, line) {
    if (tok.type === "funcActivation") {
        const local = findSymbol(tok.name, [scopes]);
        if (local?.type === "func") return { kind: "type", name: "any", params: [] };
    }

    if (tok.type === "group") {
        const d = parseExpr(tok.data, scopes, [], 0);
        return { kind: "type", name: d.type, params: [] };
    }

    if (tok.type === "object" || tok.type === "array") {
        const obj = JSON.parse(tok.data);
        const valueTypes = Object.values(obj).map(v => typeof v);

        if (valueTypes.every(v => v === "string")) {
            return parseType(`${tok.type}<string>`, errors, line);
        }
        if (valueTypes.every(v => v === "number")) {
            return parseType(`${tok.type}<number>`, errors, line);
        }
        return parseType(`${tok.type}<any>`, errors, line);
    }

    if (tok.type === "variable") {
        const mod = imports.find(m => m.module === tok.value);
        const fn = mod?.functions.find(f => f.name === tok.property);
        const prop = mod?.properties?.find(p => p.name === tok.property);
        
        if (fn) {
            const r = fn.returnType;

            if (Array.isArray(r)) {
                return {
                    kind: "union",
                    types: r.map(t => parseType(t, errors, line))
                };
            }

            return parseType(r ?? "any", errors, line);
        }
        
        if (prop && tok.propType !== "func") {
            return parseType(prop.type ?? "any", errors, line);
        }
    
        const v = findSymbol(tok.value, [ scopes ]);
        const r = v ? baseType(v.declType ?? v.type) : null;
        if (tok.property) {
            if (v?.declType?.kind === "type" && (v.declType.name === "object" || v.declType.name === "array")) {
                return v.declType.params[0] ?? { kind: "type", name: "any", params: [] };
            }

            const propMap = propertyTypes[r];
            if (propMap && propMap[tok.property]) {
                return parseType(propMap[tok.property].type, [], 0);
            }

            return { kind: "type", name: "any", params: [] };
        }
        return r
    }

    if (tok.type === "uint" || tok.type === "int" || tok.type === "number") return { kind: "type", name: "number", params: [] };
    if (tok.type === "string") return { kind: "type", name: "string", params: [] };
    if (tok.type === "bool") return { kind: "type", name: "boolean", params: [] };
    if (tok.type === "null") return { kind: "type", name: "void", params: [] };

    return null;
}

function findSymbol(name, scopes) {
    for (let i = scopes.length - 1; i >= 0; i--) {
        const found = scopes[i].find(e => e.name === name);
        if (found) return found;
    }
    return null;
}

function typeCheckExpression(tokens, defined, expectedType, errors, line) {
    let currentType = null;

    if (tokens.length === 1 && tokens[0].type === "expr") {
        tokens = tokens[0].data;
    }

    for (let i = 0; i < tokens.length; i++) {
        
        const tok = tokens[i];

        if (tok.type === "funcActivation") {
            const t = getTokenType(tok, defined, errors, line);
            if (!t) {
                errors.push({
                    line,
                    error: `Unknown function '${tok.name}'`
                });
                return null;
            }
            currentType = typeof t === "string" ? parseType(t, errors, line) : t;
            continue;
        }

        if (tok.type !== "operator") {
            const t = getTokenType(tok, defined, errors, line);
            if (!t) {
                const name =
                    tok.type === "variable" ? tok.value :
                    tok.type === "funcActivation" ? tok.name :
                    "<unknown>";

                errors.push({
                    line,
                    error: `ReferenceError: ${tok.type} '${name}' not found`
                });
                return null;
            }

            currentType = typeof t === "string" ? parseType(t, errors, line) : t;
            continue;
        }

        if (unaryOps.includes(tok.value)) {
            let opCount = 1;
            while (
                tokens[i + opCount] &&
                unaryOps.includes(tokens[i + opCount].value)
            ) {
                opCount++;
            }

            const operandTok = tokens[i + opCount];
            if (!operandTok) {
                errors.push({
                    line,
                    error: `SyntaxError: Expected operand after unary operator '${tok.value}'`,
                });
                return null;
            }

            const operandType = getTokenType(operandTok, defined, errors, line);
            if (!operandType) {
                const name =
                    operandTok.type === "variable"
                        ? operandTok.value
                        : operandTok.type === "funcActivation"
                        ? operandTok.name
                        : "<unknown>";
                errors.push({
                    line,
                    error: `ReferenceError: ${operandTok.type} '${name}' not found`,
                });
                return null;
            }

            let current = baseType(operandType);
            for (let k = 0; k < opCount; k++) {
                const opRules = operatorTypes[tok.value];
                if (!opRules || !opRules[current]) {
                    errors.push({
                        line,
                        error: `Cannot apply '${tok.value}' to ${current}`,
                    });
                    return null;
                }
                current = baseType(opRules[current]);
            }

            currentType = current;

            i += opCount;
            continue;
        }


        const op = tok.value;
        const next = tokens[i + 1];
        if (!next) break;

        const rightType = getTokenType(next, defined, errors, line);
        const left = resolveType(baseType(currentType));
        const right = resolveType(baseType(rightType));
        const rules = operatorTypes[op];

        if (!rules || !rules[left]) {
            errors.push({ line, error: 
                `Cannot apply '${op}' to ${left} and ${right}`,
                
            });
            return null;
        }

        currentType = parseType(rules[left], errors, line);
        i++;
    }

    let actualTypeAst = typeof currentType === "string"
        ? parseType(currentType, errors, line)
        : currentType;
    
    if (!expectedType) {
        return actualTypeAst || { kind: "type", name: "any", params: [] };
    }

    const expectedTypeAst = expectedType.kind
        ? expectedType
        : parseType(expectedType.name, errors, line);


    if (actualTypeAst?.kind === "union") {
        const match = actualTypeAst.types.find(
            t => t.name === expectedTypeAst.name
        );

        if (match) {
            actualTypeAst = match;
        }
    }

    if (actualTypeAst.name === "any" && expectedTypeAst.name !== "any") {
        actualTypeAst = expectedTypeAst;
    }

    if (actualTypeAst.name === "object" && actualTypeAst.params.length === 1 && actualTypeAst.params[0].name === "any" &&  expectedTypeAst.name === "object" && expectedTypeAst.params.length === 1 ) {
        actualTypeAst = {
            kind: "type",
            name: "object",
            params: [expectedTypeAst.params[0]]
        };
    }

    if (actualTypeAst.name === "array" && actualTypeAst.params.length === 1 && actualTypeAst.params[0].name === "any" &&  expectedTypeAst.name === "array" && expectedTypeAst.params.length === 1 ) {
        actualTypeAst = {
            kind: "type",
            name: "array",
            params: [expectedTypeAst.params[0]]
        };
    }

    if (!isAssignable(actualTypeAst, expectedTypeAst)) {

        errors.push({
            line,
            error: `TypeError: Type '${typeToString(actualTypeAst)}' does not match '${typeToString(expectedTypeAst)}'`
        });
    }

    return actualTypeAst;
}

function compileExpr(tok) {
    switch (tok.type) {
        case "string":
            return JSON.stringify(tok.value);

        case "number":
        case "int":
            return String(tok.value);

        case "uint":
            return String(tok.value);

        case "bool":
            return tok.value ? "true" : "false";

        case "variable":
            if (tok.property) {
                if (tok.propType === "func" && tok.params !== undefined) {
                    const args = tok.params
                        .map(p => p.map(compileExpr).join(" "))
                        .join(", ");
                    return `${tok.value}.${tok.property}(${args})`;
                }
                return `${tok.value}.${tok.property}`;
            }
            return tok.value;

        case "operator":
            return tok.value;

        case "group": {
            const d = tok.data.map(compileExpr).join(" ");
            return `( ${d} )`;
        }

        case "object": {
            if (tok.data.startsWith("{")) {
                return tok.data;
            } else {
                return `{${tok.data}}`;
            }
        }

        case "array": {
            if (tok.data.startsWith("[")) {
                return tok.data;
            } else {
                return `[${tok.data}]`;
            }
        }

        case "funcActivation": {
            const args = tok.params
                .map(p => p.map(compileExpr).join(" "))
                .join(", ");

            if (tok.object)
                return `${tok.object}.${tok.name}(${args})`;

            return `${tok.name}(${args})`;
        }

        case "expr":
            return tok.data.map(compileExpr).join(" ");

        default:
            throw new Error(`compileExpr: unknown token ${tok.type}`);
    }
}

function parseType(typeStr, errors, line) {
    if (typeStr && typeof typeStr === "object") {
        if (typeStr.kind === "type" || typeStr.kind === "union") {
            return typeStr;
        }
    }

    if (typeof typeStr !== "string") {
        throw new Error(`InternalError: Invalid type value '${JSON.stringify(typeStr)}'`)
        errors.push({
            line,
            error: `InternalError: Invalid type value '${JSON.stringify(typeStr)}'`
        });
        return { kind: "type", name: "any", params: [] };
    }

    typeStr = typeStr.trim();

    let i = typeStr.indexOf("<");
    if (i === -1) {
        return { kind: "type", name: typeStr, params: [] };
    }

    const name = typeStr.slice(0, i).trim();
    const inner = typeStr.slice(i + 1, -1);

    let depth = 0;
    let cur = "";
    const params = [];

    for (const c of inner) {
        if (c === "<") depth++;
        if (c === ">") depth--;
        if (c === "," && depth === 0) {
            params.push(parseType(cur, errors, line));
            cur = "";
            continue;
        }
        cur += c;
    }

    if (cur.trim()) {
        params.push(parseType(cur, errors, line));
    }

    return {
        kind: "type",
        name,
        params
    };
}

function baseType(t) {
    if (!t) return "any";

    if (t.kind === "union") {
        return "any";
    }

    return typeof t === "string" ? t : t.name;
}

function parseExpr(tokens, scope, errors, line) {
    if (tokens.length === 1 && tokens[0].type === "expr") {
        tokens = tokens[0].data;
    }

    let currentType = null;
    let isAsync = false;

    for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];

        if (tok.type === "funcActivation") {
            const cur = findSymbol(tok.name, [scope]);
            const def = findSymbol(tok.name, [scope]);

            const fnDef = cur?.type === "func" ? cur : def?.type === "func" ? def : "";

            if (!fnDef) {
                errors.push({
                    line,
                    error: `ReferenceError: Function '${tok.name}' not found`
                });
                return null;
            }

            const expectedParams = fnDef.params ?? [];
            if (!fnDef.variadic && tok.params.length !== expectedParams.length) {
                errors.push({
                    line,
                    error: `TypeError: Expected ${expectedParams.length} arguments, got ${tok.params.length}`
                });
            }

            for (let p = 0; p < tok.params.length; p++) {
                const argTokens = tok.params[p];
                const parsed = parseExpr(argTokens, scope, errors, line);
                if (!parsed) return null;

                const expected = expectedParams[p]?.type ?? expectedParams[p];
                if (expected && baseType(parsed.type) !== baseType(expected)) {
                    errors.push({
                        line,
                        error: `TypeError: Expected '${expected}', got '${parsed.type}'`
                    });
                }

                isAsync ||= parsed.async;
            }

            if (fnDef.async) isAsync = true;

            currentType = baseType(fnDef.returnType ?? "any");
            continue;
        }

        if (tok.type === "variable") {
            const sym = findSymbol(tok.value, [scope]);
            const mod = imports.find(m => m.module === tok.value);
            const fn = mod?.functions.find(f => f.name === tok.property);
            const prop = mod?.properties?.find(p => p.name === tok.property);

            if (fn && tok.propType === "func") {
                const returnType = fn.returnType;
                if (Array.isArray(returnType)) {
                    currentType = {
                        kind: "union",
                        types: returnType.map(t => parseType(t, errors, line))
                    };
                } else {
                    currentType = parseType(returnType ?? "any", errors, line);
                }
                isAsync ||= fn.async;
                continue;
            }
            
            // Handle imported properties
            if (prop) {
                currentType = parseType(prop.type ?? "any", errors, line);
                continue;
            }
            
            if (!sym && !fn && !prop && !mod) {
                return null;
            }
            let symType = sym?.declType;
    
            if (tok.property) {
                if (symType?.kind === "type" && (symType.name === "object" || symType.name === "array") && symType.params?.length === 1) {
                    currentType = symType.params[0];
                    continue;
                }
                
                const baseT = baseType(symType);
                const propMap = propertyTypes[baseT];
                if (propMap && propMap[tok.property]) {
                    currentType = parseType(propMap[tok.property].type, errors, line);
                    continue;
                }
            }

            currentType = symType;
        }

        if (tok.type === "number" || tok.type === "int" || tok.type === "uint") {
            currentType = "number";
            continue;
        }

        if (tok.type === "string") {
            currentType = "string";
            continue;
        }

        if (tok.type === "bool") {
            currentType = "boolean";
            continue;
        }

        if (tok.type === "operator") {
            const next = tokens[i + 1];
            if (!next) break;

            if (unaryOps.includes(tok.value)) {
                const right = parseExpr([next], scope, errors, line);
                if (!right) return null;
                
                const rightType = baseType(right.type);
                const rules = operatorTypes[tok.value];
                
                if (rules && rules[rightType]) {
                    currentType = rules[rightType];
                    isAsync ||= right.async;
                    i++;
                    continue;
                }
                
                errors.push({
                    line,
                    error: `Cannot apply '${tok.value}' to ${rightType}`
                });
                return null;
            }

            const right = parseExpr([next], scope, errors, line);
            if (!right) { 
                return null;
            }

            const leftType = resolveType(baseType(currentType));
            const rightType = resolveType(baseType(right.type));
            const rules = operatorTypes[tok.value];

            if (!rules || !rules[leftType] && leftType !== "any" && rightType !== "any") {
                errors.push({
                    line,
                    error: `Cannot apply '${tok.value}' to ${leftType} and ${rightType}`
                });
                return null;
            }
            currentType = parseType(rules[leftType], errors, line);
            isAsync ||= right.async;
            i++;
        }

        if (tok.type === "group") {
            currentType = parseExpr(tok.data, scope, errors, line)?.type;
        }
    }

    return {
        type: currentType ?? { kind: "type", name: "void" },
        async: isAsync
    };
}

async function compileParams(line, errors, args, expectedParams, scope = [], anySize = false) {
    const out = [];

    if (!expectedParams) return out;

    args = args.flatMap(a => (Array.isArray(a) && a.length === 0 ? [] : [a]));

    if (args.length !== expectedParams.length && !anySize) {
        errors.push({
            line,
            error: `TypeError: Unexpected parameter amount inputted, requires '${expectedParams.length}', got '${args.length}'`
        });
        return out;
    }

    for (let i = 0; i < args.length; i++) {
        const argTokens = args[i];
        let expected = expectedParams[i];
        if (!expected && anySize) expected = expectedParams[0];

        let inputtedType;
        if (argTokens.length === 1 && argTokens[0].type === "variable" && argTokens[0].propType !== "func") {
            const sym = findSymbol(argTokens[0].value, [scope]);
            const mod = imports.find(m => m.module === argTokens[0].value);
            const fn = mod?.functions.find(f => f.name === argTokens[0].property);
            const prop = mod?.properties?.find(p => p.name === argTokens[0].property);
            
            if (!sym && !fn && !prop) {
                errors.push({ line, error: `ReferenceError: Variable '${argTokens[0].value}' not found` });
                continue;
            } else if (fn) {
                inputtedType = baseType(fn.returnType);
            } else if (prop) {
                inputtedType = baseType(prop.type);
            } else {
                inputtedType = baseType(sym.declType ?? sym.type);
            }
        } else {
            const parsed = await parseExpr(argTokens, scope, errors, line);
            inputtedType = baseType(parsed?.type);
        }

        const resolvedExpected = resolveType(typeof expected === "string"
            ? baseType(expected)
            : baseType(expected.type));

        if (resolvedExpected !== "any" && resolveType(inputtedType) !== resolvedExpected && inputtedType !== "any") {
            errors.push({
                line,
                error: `TypeError: Expected '${resolvedExpected}', got '${resolveType(inputtedType)}'`
            });
        }

        out.push(argTokens.map(compileExpr).join(" "));

    }

    return out;
}

async function compileLine(obj, currentScope, defined, line, errors, extra) {
    let res = "";
    switch (obj.type) {
        case "var": {
            if (!obj.modif) {
                if (obj.constant) 
                    res += "const ";
                else
                    res += "let ";
            }
            res += obj.name;
            if (!obj.op?.data) {
                res += ";";
                break;
            }
            const cur = currentScope.find(e => e.name === obj.name);
            const found = defined.find(e => e.name === obj.name);

            const mod = imports.find(m => m.module === obj.name);
            const modProp = mod?.properties?.find(p => p.name === obj.property);

            if (mod && obj.property && modProp) {
                const type = parseType(modProp.type ?? "any", errors, line);
                typeCheckExpression(obj.data, [ ...defined, ...currentScope ], type, errors, line);
                
                res += `.${obj.property}`;
                res += ` ${obj.op.data} `;
                
                if (obj.await) {
                    res += "await ";       
                }
                
                for (const p of obj.data) {
                    if (p?.type === "group") {
                        res += compileExpr(p);
                        continue;
                    }
                    if (p?.type === "object" || p?.type === "array") {
                        res += p.data;
                        break;
                    }
                    if (p?.type === "expr") {
                        res += await compileLine(p, currentScope, defined, line, errors, extra);
                        continue;
                    }
                    res += `${(p.type === "string" ? JSON.stringify(p.value) : p.value)} `;
                }
                res = res.trim();
                break;
            }

            if (cur && !obj.modif) {
                errors.push({ line, error: 
                    `SyntaxError: Identifier already declared in same scope`
                })
            }
            if (cur?.contant || found?.constant) {
                errors.push({ line, error: 
                    `SyntaxError: Cannot modify constant`
                })
            }
            const type = obj.declType ?? (found?.declType ?? cur?.declType);
            typeCheckExpression(obj.data, [ ...defined, ...currentScope ], type, errors, line);
            const resolvedType =
                obj.declType
                ?? found?.declType
                ?? cur?.declType;

            if (!resolvedType) {
                errors.push({
                    line,
                    error: `InternalError: Unable to resolve type for variable '${obj.name}'`
                });
                break;
            }

            if (resolvedType === "null") {
                errors.push({
                    line,
                    error: `TypeError: Cannot use 'null' as declaration type, use 'void' instead` 
                });
                break;
            }

            upsertSymbol(currentScope, {
                type: "var",
                name: obj.name,
                declType: parseType(resolvedType, errors, line),
                constant: !!obj.constant
            });

            upsertSymbol(defined, {
                type: "var",
                name: obj.name,
                declType: parseType(resolvedType, errors, line),
                constant: !!obj.constant
            });
            res += ` ${obj.op.data} `;
            if (type.name === "int")
                res += "((";

            if (type.name === "uint")
                res += "(((";
            
            if (obj.await) {
                res += "await ";       
            }
            if (
                obj.data.length === 1 &&
                (obj?.data[0]?.type === "expr" && obj.data[0].data.length === 1 && obj.data[0].data[0].type === "funcActivation") ||
                obj?.data[0]?.type === "funcActivation"
            ) {
                const f = obj.data[0].type === "expr" ? obj.data[0].data[0] : obj.data[0];
                res += await compileLine({ ...f, await: obj.data[0].await }, currentScope, defined, line, errors, extra);
            } else {
                for (const p of obj.data) {
                    let cur;
                    let found;
                    if (p?.type === "group") {
                        res += compileExpr(p);
                        continue;
                    }

                    if (p?.type === "object" || p?.type === "array") {
                        res += p.data;
                        break;
                    }
                    
                    if (p?.type === "expr") {
                        
                        res += await compileLine(p, currentScope, defined, line, errors, extra);
                        continue;
                    }
                    let add = "";
                    if (p?.type === "variable") {
                        cur = currentScope.find(e => e.name === p.value);
                        found = defined.find(e => e.name === p.value);
                        const mod = imports.find(m => m.module === p.value);
                        const fn = mod?.functions.find(f => f.name === p?.property);
                        const prop = mod?.properties?.find(pr => pr.name === p?.property);
                        
                        if (!cur && !found && !fn && !prop) {
                            errors.push({
                                line,
                                error: `ReferenceError: Variable '${p.value}' not found`
                            });
                        }
                        
                        if (prop && p.propType !== "func") {
                            add += `.${p.property}`;
                        } else if (cur && found && !fn &&p.property !== undefined && p.property !== null) {
                            if (/^\d+$/.test(p.property)) {
                                add += `[${p.property}]`;
                            } else {
                                add += `.${p.property}`;
                            }
                        }
                    }
                    if (p?.property) {
                        let prop;
                        const propMap = propertyTypes[resolveType(baseType(cur?.declType ?? found?.declType ?? null))] ?? [];
                        if (propMap[p.property]) {
                            const r = propMap[p.property]
                            prop = r.propType === "str" ? r.convert : null;
                        }
                        if (p.propType === "var" && prop) add += "." + prop;
                        if (p.propType === "func") {
                            const mod = imports.find(m => m.module === p.value);
                            const fn = mod?.functions.find(f => f.name === p.property);
                            const r = propMap[p.property];
                            if (fn) {
                                const compiledArgs = await compileParams( line, errors, p.params, fn.params, [ ...currentScope, ...defined ], fn.variadic ); 
                                add += `.${p.property}(${compiledArgs.join(", ")})`;
                            } else if (r?.propType === "func") {
                                const compiledArgs = await compileParams( line, errors, p.params ?? [], r.params ?? [], [ ...currentScope, ...defined ], r.variadic ); 
                                add += `(${compiledArgs.join(", ")})`;
                            } else {
                                errors.push({
                                    line,
                                    error: `TypeError: Cannot find function '${p.property}' on ${p.value}`
                                });
                            }
                        }
                    }
                    res += `${(p.type === "string" ? JSON.stringify(p.value) : p.value) + add} `;
                }
            }

            if (type.name === "int")
                res = res.trim() + ") | 0)";
            else if (type.name === "uint")
                res = res.trim() + ") | 0) >>> 0)";
            else
                res = res.trim()
            break;
        };

        case "expr": {
            for (const p of obj.data) {
                if (p.type === "funcActivation") {
                    const cur = currentScope.find((e) => e.type === "func" && e.name === p.name);
                    const def = defined.find((e) => e.type === "func" && e.name === p.name);
                    if (obj.await) { 
                        extra.async ||= true;
                        res += "await "; 
                    }
                    if (cur || def) { 
                        const compiledArgs = await compileParams(line, errors, p.params, cur?.params ?? def?.params, [ ...currentScope, ...defined ]); 
                        res += `${p.name}(${compiledArgs.join(", ")})`; 
                        continue;
                    } else { 
                        errors.push({ line, error: `ReferenceError: Function '${obj.data[0].name}' not found` }); 
                    }
                } else if (p.type === "variable") {
                    const cur = currentScope.find(e => e.name === p.value);
                    const found = defined.find(e => e.name === p.value);
                    const mod = imports.find(m => m.module === p.value);
                    const fn = mod?.functions.find(f => f.name === p.property);
                    const prop = mod?.properties?.find(pr => pr.name === p.property);
                    
                    if (!cur && !found && !fn && !prop) {
                        errors.push({
                            line,
                            error: `ReferenceError: Variable '${p.value}' not found`
                        });
                        res += `${p.value} `;
                        continue;
                    }
                    
                    // Handle imported function calls
                    if (fn && p.propType === "func") {
                        if (obj.await) {
                            extra.async ||= true;
                            res += "await ";       
                        }
                        const compiledArgs = await compileParams(line, errors, p.params ?? [], fn.params, [...currentScope, ...defined], fn.variadic); 
                        res += `${p.value}.${p.property}(${compiledArgs.join(", ")})`;
                        continue;
                    }
                    
                    // Handle imported properties
                    if (prop && p.propType !== "func") {
                        res += `${p.value}.${p.property}`;
                        continue;
                    }
                    
                    // Handle local variable methods
                    if (p.propType === "func") {
                        const varType = baseType(cur?.declType ?? found?.declType);
                        const propMap = propertyTypes[varType];
                        if (propMap && propMap[p.property]) {
                            const r = propMap[p.property];
                            if (r.propType === "func") {
                                const compiledArgs = await compileParams(line, errors, p.params ?? [], r.params ?? [], [...currentScope, ...defined], r.variadic);
                                res += `${p.value}.${p.property}(${compiledArgs.join(", ")}) `;
                                continue;
                            }
                        }
                    }
                    
                    // Handle local variable properties
                    let propAccess = "";
                    if (p.property && !p.propType) {
                        const varType = baseType(cur?.declType ?? found?.declType);
                        const propMap = propertyTypes[varType];
                        if (propMap && propMap[p.property]) {
                            const r = propMap[p.property];
                            propAccess = r.propType === "str" ? `.${r.convert}` : "";
                        }
                    }
                    res += `${(p.type === "string" ? JSON.stringify(p.value) : p.value) + propAccess} `;
                } else if (p.type === "func") {
                    const params = [];

                    for (const o of p.params) {
                        let def = 0;
                        if (o.type === "string")
                            def = "";
                        params.push({
                            type: "var",
                            value: def,
                            ...o
                        });
                    }

                    const e = { returnType: obj.declType };
                    const paramNames = p.params.map(p => p.name ?? p);
                    const definedScope = structuredClone([ ...defined, ...currentScope ]);
                    const d = await compileLevel(p.data, params, definedScope, errors, line + 1, e);

                    res += `(${paramNames.join(", ")}) => { \n${d}}`;
                } else {
                    res += `${(p.type === "string" ? JSON.stringify(p.value) : p.value)} `;
                }
            }

            res = res.trim();
            break;
        }

        case "func": {
            upsertSymbol(currentScope, {
                type: "func",
                name: obj.name,
                params: obj.params
            });
            upsertSymbol(defined, {
                type: "func",
                name: obj.name,
                params: obj.params
            });
            const definedScope = structuredClone([ ...defined, ...currentScope ]);
            const paramNames = obj.params.map(p => p.name ?? p);
            const params = [];

            if (obj.declType === "null") {
                errors.push({
                    line,
                    error: `TypeError: Cannot use 'null' as declaration type, use 'void' instead` 
                });
                break;
            }

            for (const p of obj.params) {
                let def = 0;
                if (p.type === "string")
                    def = "";
                params.push({
                    type: "var",
                    value: def,
                    ...p
                });
            }
            const e = { returnType: obj.declType };
            const d = await compileLevel(obj.data, params, definedScope, errors, line + 1, e);
            res += `${e.async ? "async function" : "function"} ${obj.name}(${paramNames.join(", ")}) { \n${d}}`;
            break;
        };

        case "whileStatem":
        case "ifStatem": {

            const condType = parseExpr(
                obj.condition,
                [ ...defined, ...currentScope ],
                errors,
                line
            );
            const t = condType?.type.name;
            if (t !== "bool" && t !== "boolean") {
                errors.push({
                    line,
                    error: `TypeError: ${obj.type.startsWith("if") ? "If" : "While"} statement condition must be 'bool'`
                });
                break;
            }

            const condCode = obj.condition
                .flatMap(t => t.type === "expr" ? t.data : [t])
                .map(compileExpr)
                .join(" ");

            const innerScope = structuredClone([]);
            const innerDefined = structuredClone([...currentScope, ...defined]);

            res += `${obj.type.startsWith("if") ? "if" : "while"} (${condCode}) {\n${await compileLevel(
                obj.data,
                innerScope,
                innerDefined,
                errors,
                line + 1,
                extra
            )}}`;

            break;
        };

        case "funcActivation": {
            const cur = currentScope.find((e) => e.type === "func" && e.name === obj.name);
            const def = defined.find((e) => e.type === "func" && e.name === obj.name);
            if (obj.await) {
                extra.async ||= true;
                res += "await ";
            }
            if (cur || def) {
                const compiledArgs = await compileParams(line, errors, obj.params, cur?.params ?? def?.params, [ ...currentScope, ...defined ]);
                res += `${obj.name}(${compiledArgs.join(", ")})`;
                break;
            } else if (fn) {
                const compiledArgs = await compileParams(
                    line,
                    errors,
                    obj.params,
                    fn.params,
                    [ ...currentScope, ...defined ],
                    fn.variadic
                );
                res += `${obj.object}.${obj.name}(${compiledArgs.join(", ")})`;
                break;
            } else {
                errors.push({ line, error: 
                    `ReferenceError: Function '${obj.name}' not found`
                });
            }
            break;
        }

        case "import": {
            let path = obj.from;
            if (!extra.toplevel) {
                errors.push({
                    line,
                    error: `SyntaxError: Import statement must be on top level`
                });
            }
            const def = imports.find(e => e.path === path);
            if (def) {
                errors.push({ line, error: 
                    `ReferenceError: Cannot import '${path}' twice`
                });
                break;
            }
            if (path.startsWith("~/")) {
                if (!homeDir) {
                    home = Deno.env.get("HOME");
                    homeWin = Deno.env.get("USERPROFILE");
                    homeDir = (home ?? homeWin) + "/";
                }
                path = path.replace("~/", homeDir);
            } else if (!path.startsWith("/")) {
                home = Deno.env.get("HOME");
                homeWin = Deno.env.get("USERPROFILE");
                path = (home ? home : homeWin) + "/huopascript/imports/" + path;
            }
            const raw = await Deno.readTextFile(path);
            const [metaRaw, codeRaw] = raw.split("\n---\n");

            if (!metaRaw || !codeRaw) {
                errors.push({ line, error: "ImportError: Invalid import format (missing ---)" });
                return;
            }

            let meta;
            try {
                meta = JSON.parse(metaRaw);
            } catch (e) {
                errors.push({ line, error: `ImportError: Invalid import JSON: ${e.message}` })
            }
            if (meta) {
                imports.push({
                    module: meta.module,
                    code: codeRaw,
                    customReturn: meta.customReturn,
                    functions: meta.functions.map(fn => ({
                        name: fn.name,
                        params: fn.params,
                        returnType: fn.returns,
                        async: fn.async,
                        variadic: fn.variadic
                    })),
                    properties: (meta.properties || []).map(prop => ({
                        name: prop.name,
                        type: prop.type || "any",
                        value: prop.value
                    }))
                });
            }

            break;
        }

        default: {
            errors.push({ line, error: 
                `SyntaxError: Unrecognized AST token type, token: '${JSON.stringify(obj)}'`
            });
        }
    }
    return res;
}

async function compileLevel(ast, currentScope, defined, errors, line = 0, extra = {}) {
    let res = "";
    for (let i = 0; i < ast.length; i++) {
        const o = ast[i];
        res += await compileLine(o, currentScope, defined, line + i, errors, extra) + "\n";
    }
    return res;
}