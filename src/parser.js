let inComment = false;
export function parse(input) {
    const errors = [];
    const ast = [];
    inComment = false;

    const l = tokenize(input, errors);
    parseLevel(ast, l, errors, 0);
    if (errors.length > 0)
        return { ast: [], errors }
    
    return { ast, errors: [] };
}

function parseParams(params, errors, line) {
    const res = [];

    for (const p of params) {
        if (!p.trim()) continue;

        const lastSpace = p.lastIndexOf(" ");
        if (lastSpace === -1) {
            errors.push(`Line ${line + 1}: Invalid parameter '${p}'`);
            continue;
        }

        const typeStr = p.slice(0, lastSpace);
        const name = p.slice(lastSpace + 1);

        let type = parseType(typeStr, errors, line);
        if (!type) continue;

        if ((type.name === "object" || type.name === "array") && type.params.length === 0) {
            type.params = [{ kind: "type", name: "any", params: [] }];
        }

        res.push({ type, name });
    }

    return res;
}

function parseAccessChain(str) {
    let i = 0;
    let base = "";
    const access = [];

    while (i < str.length && /[\p{L}\p{N}_]/u.test(str[i])) {
        base += str[i++];
    }

    while (i < str.length) {
        if (str[i] === ".") {
            i++;
            let prop = "";
            while (i < str.length && /[\p{L}\p{N}_]/u.test(str[i])) {
                prop += str[i++];
            }
            if (!prop) break;
            access.push({ kind: "prop", value: prop });
            continue;
        }

        if (str[i] === "[") {
            i++;
            let depth = 1;
            let inner = "";
            let inString = false;

            while (i < str.length && depth > 0) {
                const c = str[i++];
                if (c === '"' && str[i - 2] !== "\\") inString = !inString;
                if (!inString) {
                    if (c === "[") depth++;
                    if (c === "]") depth--;
                }
                if (depth > 0) inner += c;
            }

            const tempAst = [];
            parseCommand(tempAst, inner.trim(), [], 0, true);

            access.push({
                kind: "index",
                value: tempAst.length === 1 ? tempAst[0] : tempAst
            });
            continue;
        }

        break;
    }

    return {
        type: "variable",
        value: base,
        properties: access
    };
}

//#region tokenizer

function tokenize(input, errors) {
    const l = [];
    let cur = "";
    let blockDepth = 0;
    let inString = false;
    let semicolonUsed = true;
    let codeSinceSemicolon = false;

    for (let i = 0; i < input?.length; i++) {
        const c = input[i];

        if (c === '"' && input[i - 1] !== "\\") {
            inString = !inString;
            cur += c;
            continue;
        }

        
        if (inString) {
            cur += c;
            continue;
        }

        if (c === "{") {
            blockDepth++;
            cur += c;
            continue;
        }

        if (c === "/" && input[i + 1] === "/") {
            while (i < input.length && input[i] !== "\n") i++;
            continue;
        }

        if (c === "/" && input[i + 1] === "*") {
            i += 2;
            while (i < input.length && !(input[i] === "*" && input[i + 1] === "/")) {
                i++;
            }
            i++;
            continue;
        }

        if (c === "}") {
            blockDepth--;
            cur += c;
            if (blockDepth === 0) {
                l.push(cur.trim());
                cur = "";
            }
            semicolonUsed = true;
            continue;
        }

        if (c === "\n" && blockDepth === 0 && !inString) {
            const lineNo = input.substring(0, i).split("\n").length;
            if (!semicolonUsed && codeSinceSemicolon) {
                errors.push(`Line ${lineNo}: SyntaxError: Expected semicolon`);
            }
            codeSinceSemicolon = false;
            semicolonUsed = false; 
            continue;
        }

        if (c === ";" && blockDepth === 0) {
            semicolonUsed = true;
            codeSinceSemicolon = false;
            if (cur.trim().length > 0) {
                l.push(cur.trim());
            }
            cur = "";
            continue;
        }
        if (c && c.trim()?.length > 0)
            codeSinceSemicolon = true;
        cur += c;
    }

    if (cur.trim().length > 0) {
        l.push(cur.trim());
    }

    return l;
}

//#endregion tokenizer

const operators = [
    { data: "==", name: "equals" },
    { data: "!=", name: "notEquals" },
    { data: "<=", name: "lte" },
    { data: ">=", name: "gte" },
    { data: "<", name: "lt" },
    { data: ">", name: "gt" },

    { data: "+=", name: "addAssign" },
    { data: "-=", name: "subAssign" },
    { data: "*=", name: "multiplyAssign" },
    { data: "/=", name: "divideAssign" },

    { data: "+", name: "add" },
    { data: "-", name: "sub" },
    { data: "*", name: "multiply" },
    { data: "/", name: "divide" },
    { data: "=", name: "assign" },

    { data: "!", name: "not" },

    { data: "||", name: "or" },
    { data: "&&", name: "and" }
];

//#region utils

function parseType(str, errors, line) {
    str = str.trim();
    let i = 0;

    function parseSingleType() {
        let name = "";
        while (i < str.length && /[\p{L}\p{N}_]/u.test(str[i])) {
            name += str[i++];
        }

        if (!name) {
            errors.push(`Line ${line + 1}: Expected type name`);
            return null;
        }

        const typeNode = {
            kind: "type",
            name,
            params: []
        };

        if (str[i] === "<") {
            i++;
            while (true) {
                const param = parseSingleType();
                if (!param) return null;
                typeNode.params.push(param);

                if (str[i] === ",") {
                    i++;
                    continue;
                }
                if (str[i] === ">") {
                    i++;
                    break;
                }

                errors.push(`Line ${line + 1}: Expected ',' or '>' in type`);
                return null;
            }
        }

        return typeNode;
    }

    const result = parseSingleType();

    if (i < str.length) {
        errors.push(`Line ${line + 1}: Unexpected token in type`);
        return null;
    }

    return result;
}

function flushTemp(result, temp, state) {
    if (!temp) return;
    if (state === "number") result.push({ type: "number", value: Number(temp) });
    else if (state === "variable") {
        if (isBool(temp)) {
            result.push({ type: "bool", value: temp === "true" });
        } else if (isNull(temp)) {
            result.push({ type: "null", value: "null" })
        } else {
            result.push({ ...parseAccessChain(temp.trim()), propType: "var" });
        }
    }
    else if (state === "string") result.push({ type: "string", value: temp.trim() });
    else if (state === "operator") result.push({ type: "operator", value: temp });
}

function matchOperator(s, i) {
    let op = null;
    for (const p of operators) {
        if (s.startsWith(p.data, i)) {
            if (!op || p.data.length > op.data.length) {
                op = p;
            }
        }
    }
    return op;
}
function isBool(str) {
    return str === "true" || str === "false";
}

function isNull(str) {
    return str === "null"
}

function extractBlock(str) {
    str = str.trim();
    if (str[0] !== '{') return null;

    let depth = 0;
    for (let i = 0; i < str.length; i++) {
        if (str[i] === '{') depth++;
        else if (str[i] === '}') depth--;

        if (depth === 0) {
            return str.slice(1, i); 
        }
    }

    throw new Error("Unmatched braces");
}

function splitArgs(str) {
    const args = [];
    let depth = 0;
    let inString = false;
    let current = "";

    for (let i = 0; i < str.length; i++) {
        const c = str[i];

        if (c === '"' && str[i - 1] !== "\\") inString = !inString;

        if (!inString) {
            if (c === "(") depth++;
            if (c === ")") depth--;
            if (c === "," && depth === 0) {
                args.push(current.trim());
                current = "";
                continue;
            }
        }

        current += c;
    }

    if (current.trim()) args.push(current.trim());
    return args;
}

//#endregion utils

//#region block parser

function parseBlock(type, exprList, ast, errors, line) {
    let ret;

    if (type === "func") {
        ret = exprList[1];
        if (!ret) {
            errors.push(`Line ${line + 1}: SyntaxError: Expected return type`);
            return { result: "error" };
        }
    }
    let rawParams = "";
    let inString = false;
    let inParams = false;
    const rPD = exprList.slice(type === "func" ? 2 : 1).join(" ");
    let i = 0;
    while (i < rPD.length) {
        const c = rPD[i];
        i++;
        if (!inParams && c === "(") {
            inParams = true;
            continue;
        }

        if (inParams && !inString && c === ")") {
            inParams = false;
            break;
        }

        if (!inParams)
            continue;

        if (!inString && c === '"') {
            inString = true;
            rawParams += c;
            continue;
        }

        if (inString && c === '"') {
            inString = false;
            rawParams += c;
            continue;
        }

        rawParams += c;
    }
    if (inParams) {
        errors.push(`Line ${line + 1}: SyntaxError: Expected ')'`);
        return { result: "error" };
    }
    const blockRaw = extractBlock(rPD.slice(i + 1));

    const block = tokenize(blockRaw, errors);
    const params = rawParams.split(",");
    for (let i = 0; i < params.length; i++) {
        params[i] = params[i].trim();
    }
    const tempAst = [];
    const a = {
        type,
        data: tempAst,
    };

    if (type === "func") {
        const parsedReturn = parseType(ret, errors, line);
        if (!parsedReturn) return { result: "error" };
        a.declType = parsedReturn;
        a.name = rPD.split("(")[0];
        a.params = parseParams(params);
    } else {
        const tempAst2 = [];
        parseCommand(tempAst2, rawParams, errors, line, true);
        a.condition = tempAst2;
    }
    parseLevel(tempAst, block, errors, line);
    ast.push(a);

}

//#endregion block parser

//#region cmd parser

function parseCommand(ast, expr, errors, line, p = false, constant = false) {
    const exprList = expr.split(" ");

    const t = exprList[0];

    if (t === "return") {
        if (constant) {
            errors.push(`Line ${line + 1}: SyntaxError: Unexpected expression 'const'`);
            return;
        }
        const tempAst = [];
        const d = exprList.slice(1).join(" ");
        parseCommand(tempAst, d, errors, line, true);
        const a = {
            type: "return",
            data: tempAst
        };
        ast.push(a);
        return;
    }

    if (t === "const") {
        if (constant) {
            errors.push(`Line ${line + 1}: SyntaxError: Unexpected expression 'const'`);
            return;
        }
        const tempAst = [];
        const d = exprList.slice(1).join(" ");
        parseCommand(tempAst, d, errors, line, false, true);
        const a = {
            ...tempAst[0],
            constant: true
        };
        ast.push(a);
        return;
    }

    if (t === "await") {
        const d = exprList.slice(1).join(" ");
        const tempAst = [];
        parseCommand(tempAst, d, errors, line);
        const a = tempAst[0];
        a.await = true;
        ast.push(a);
        return;
    }

    if (t === "import") {
        if (constant) {
            errors.push(`Line ${line + 1}: SyntaxError: Unexpected expression 'const'`);
            return;
        }
        const d = exprList.splice(1).join(" ");
        let i = 0;
        let inString = false;
        let im = "";
        while (i < d.length) {
            const c = d[i];
            i++;
            if (inString && c === '"') {
                inString = false;
                break;
            }
            if (!inString && c === '"') {
                inString = true;
                continue;
            }
            if (inString)
                im += c;
        }
        const a = {
            type: "import",
            from: im
        };
        ast.push(a);
        return;
    }

    if (t === "func") {
        parseBlock("func", exprList, ast, errors, line);
        return;
    }

    if (t === "if") {
        if (constant) {
            errors.push(`Line ${line + 1}: SyntaxError: Unexpected expression 'const'`);
            return;
        }
        parseBlock("ifStatem", exprList, ast, errors, line);
        return;
    }

    if (t === "while") {
        if (constant) {
            errors.push(`Line ${line + 1}: SyntaxError: Unexpected expression 'const'`);
            return;
        }
        parseBlock("whileStatem", exprList, ast, errors, line);
        return;
    }

    const declMatch = expr.match(
        /^([\p{L}_][\p{L}\p{N}_<>]*)\s+([\p{L}_][\p{L}\p{N}_]*)\s*(=|\+=|-=)(?!=)\s*(.+)$/u
    );

    const modMatch = expr.match(
        /^([\p{L}_][\p{L}\p{N}_.\[\]"]*)\s*(=|\+=|-=)(?!=)\s*(.+)$/u
    );

    if (declMatch) {
        const [, typeStr, name, op, rhs] = declMatch;
        const declType = parseType(typeStr, errors, line);
        if (!declType) return;

        const tempAst = [];
        parseCommand(tempAst, rhs, errors, line, true);

        ast.push({
            type: "var",
            name,
            op: operators.find(p => p.data === op),
            declType,
            modif: false,
            data: tempAst
        });
        return;
    }

    if (modMatch) {
        const [, name, op, rhs] = modMatch;
        const tempAst = [];
        parseCommand(tempAst, rhs, errors, line, true);

        const target = parseAccessChain(name);

        ast.push({
            type: "var",
            value: target.value,
            properties: target.properties,
            op: operators.find(p => p.data === op),
            data: tempAst,
            modif: true,
            propType: "var"
        });
        return;
    }


    if (constant) {
        errors.push(`Line ${line + 1}: SyntaxError: Unexpected expression 'const'`);
        return;
    }

    const s = exprList.join(" ");
    let state = "start";
    const result = [];
    let temp = "";
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === " " && state !== "string") {
            continue;
        }
        switch (state) {
            case "start": {
                if (c === "\\") continue;
                if (c === '"') { state = "string"; temp = ""; continue; }
                if (c === '(') {
                    let depth = 1;
                    let j = i + 1;
                    let paramsExpr = "";
                    let inString = false;
                    
                    while (j < s.length && depth > 0) {
                        const ch = s[j++];
                        
                        if (ch === '"' && s[j - 2] !== "\\") inString = !inString;
                        if (!inString) {
                            if (ch === "(") depth++;
                            if (ch === ")") depth--;
                        }
                        
                        if (depth > 0) paramsExpr += ch;
                    }

                    while (j < s.length && s[j] === " ") j++;
                    if (s[j] === "=" && s[j + 1] === ">") {
                        j += 2;
                        while (j < s.length && s[j] === " ") j++;
                        
                        const rawParams = paramsExpr.trim();
                        const paramsList = rawParams ? splitArgs(rawParams) : [];
                        const parsedParams = parseParams(paramsList, errors, line);
                        
                        if (s[j] === "{") {
                            const blockRaw = extractBlock(s.slice(j));
                            const block = tokenize(blockRaw, errors);
                            const tempAst = [];
                            parseLevel(tempAst, block, errors, line);
                            
                            result.push({
                                type: "func",
                                data: tempAst,
                                declType: { kind: "type", name: "any", params: [] },
                                params: parsedParams,
                                arrow: true
                            });
                            
                            let blockDepth = 1;
                            j++;
                            while (j < s.length && blockDepth > 0) {
                                if (s[j] === "{") blockDepth++;
                                if (s[j] === "}") blockDepth--;
                                j++;
                            }
                            i = j - 1;
                            continue;
                        } else {
                            errors.push(`Line ${line + 1}: SyntaxError: Arrow functions must have block body`);
                            return { result: "error" };
                        }
                    }
                    let innerExpr = "";
                    inString = false;
                    depth = 1;
                    j = i + 1;

                    while (j < s.length && depth > 0) {
                        const ch = s[j++];
                        
                        if (ch === '"' && s[j - 2] !== "\\") inString = !inString;
                        if (!inString) {
                            if (ch === "(") depth++;
                            if (ch === ")") depth--;
                        }
                        
                        if (depth > 0) innerExpr += ch;
                    }

                    const tempAst = [];
                    parseCommand(tempAst, innerExpr, errors, line, true);
                    result.push({
                        type: "group",
                        data: tempAst
                    });
                    
                    i = j - 1;
                    continue;
                }

                if (c === "{" || c === "[") {
                    const closeChar = c === "{" ? "}" : "]";
                    let inString = false;
                    let data = c;
                    let depth = 1;
                    let j = i + 1;
                    while (j < s.length && depth > 0) {
                        const ch = s[j++];
                        if (ch === '"' && s[j - 2] !== "\\") inString = !inString;
                        if (!inString) {
                            if (ch === c) depth++;
                            if (ch === closeChar) depth--;
                        }
                        
                        data += ch;
                    }
                    let obj;
                    try {
                        obj = JSON.parse(data);
                    } catch (err) {
                        errors.push(`Line: ${line + 1}: SyntaxError: ${err.message}`);
                        return { result: "error" };
                    } 

                    result.push({
                        type: c === "{" ? "object" : "array",
                        data
                    });

                    i = j - 1;

                    continue;
                }
                
                if (!isNaN(Number(c)) || c === ".") {
                    state = "number";
                    temp = c;
                    continue;
                }

                if (c === "-" && !isNaN(Number(s[i + 1]))) {
                    const lastToken = result[result.length - 1];
                    if (lastToken && (lastToken.type === "funcActivation" || lastToken.type === "variable" || lastToken.type === "number" || lastToken.type === "string")) {
                        const op = matchOperator(s, i);
                        if (op) {
                            result.push({ type: "operator", value: op.data });
                            i += op.data.length - 1;
                            continue;
                        }
                    }
                    state = "number";
                    temp = c;
                    continue;
                }


                const op = matchOperator(s, i);
                if (op) {
                    result.push({ type: "operator", value: op.data });
                    i += op.data.length - 1; 
                    continue;
                }
                state = "variable";
                temp = c;
                break;
            }

            case "number":
            case "variable": {

                if (s[i] === "(") {
                    const prop = parseAccessChain(temp);

                    let depth = 1;
                    let j = i + 1;
                    let paramStr = "";
                    let inString = false;

                    while (j < s.length && depth > 0) {
                        const ch = s[j++];

                        if (ch === '"' && s[j - 2] !== "\\") inString = !inString;
                        if (!inString) {
                            if (ch === "(") depth++;
                            if (ch === ")") depth--;
                        }

                        if (depth > 0) paramStr += ch;
                    }

                    const params = splitArgs(paramStr).map(p => {
                        const tempAst = [];
                        parseCommand(tempAst, p, errors, line, true);
                        return tempAst;
                    });

                    const a = {
                        type: "funcActivation",
                        params,
                        ...prop,
                        propType: "func"
                    };

                    result.push(a);

                    i = j - 1;
                    state = "start";
                    temp = "";
                    continue;
                }

                const op = matchOperator(s, i);
                if (op) {
                    flushTemp(result, temp, state);
                    i += op.data.length - 1;
                    result.push({ type: "operator", value: op.data });
                    temp = "";
                    state = "start";
                    continue;
                }
                if (c === "\\") continue;
                temp += c;
                break;
            }
            case "string":
                if (c === '"' && s[i - 1] !== "\\") {
                    result.push({ type: "string", value: temp });
                    temp = "";
                    state = "start";
                    continue;
                }

                if (c === "\\" && i < s.length - 1) {
                    const next = s[i + 1];
                    if (next === '"' || next === "\\" || next === "n" || next === "t") {
                        if (next === "n") temp += "\n";
                        else if (next === "t") temp += "\t";
                        else temp += next;
                        i++;
                        continue;
                    }
                }
                if (c === "\\") continue;
                temp += c;
                break;

        }
    
    }
    
    if (temp.length > 0) {
        if (state === "number") {
            result.push({ type: "number", value: Number(temp.trim()) });
        } else if (state === "variable") {
            if (isBool(temp)) {
                result.push({ type: "bool", value: temp === "true" });
            } else if (isNull(temp)) {
                result.push({ type: "null", value: "null" })
            } else {
                result.push(parseAccessChain(temp.trim()));
            }
        } else if (state === "string") {
            result.push({ type: "string", value: temp.trim() });
        }
    }
    if (result.length > 0 && result[result.length - 1].type === "operator") {
        errors.push(`Line ${line + 1}: SyntaxError: Unexpected end of expression`);
        return { result: "error" };
    }

    
    if (p)
        ast.push(...result);
    else {
        const a = {
            type: "expr",
            data: result,
        };
        ast.push(a);
    }
    return;

}

function parseLevel(ast, l, errors, line) {
    for (let i = 0; i < l.length; i++) {
        const expr = l[i];
        if (!expr) continue;
        parseCommand(ast, expr, errors, line + i)
    }
}