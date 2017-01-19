import PegJS from "pegjs";
import IndentAdder from "indent-adder"

const Grammar = `
{
    function makeList(initial, tail, num) {
        for (var i = 0; i < tail.length; i++) {
            initial.push(tail[i][num]);
        }
        return initial;
    }
}

entry
    = _ st:(statement _)* _ { return makeList([], st, 0); }

statement
    = multiline / single

multiline
    = name:atom _ args:args _ ":" _ "_INDENT_" _ body:(statement _)+ "_DEDENT_" {
        return {name:name, args:args, body:makeList([], body, 0)};
    }

single
    = name:atom _ args:args {return {name:name, args:args};}

atom
    = first:[a-z] letters:[0-9a-zA-Z_]* { return first + letters.join(""); }
    / ("'" letters:[^']* "'") { return letters.join(""); }

_
    = [\\t\\n\\r ]* ("#" (!"\\n" .)* "\\n" [\\t\\n\\r ]* )*

args
    = _ m:map {return m;}
    / _ "(" _ head:term tail:(_ "," _ term)* _ ")" { return makeList([head], tail, 3); }
    / _ "(" _ ")" {return null;}

map
    = "(" _ head:kv tail:(_ "," _ kv)* _ ")" { return makeList([head], tail, 3); }

list
    = _ "[" _ head:term tail:(_ "," _ term)* _ "]" { return makeList([head], tail, 3); }
    / _ "[" _ "]" {return [];}

kv
    = k:term _ "=" _ v:term _ {return {key:k, value:v};}

term
    = unumber / logic_op / single / list / string / atom / number

logic_op
    = (string / number) _ ("<=" / ">=" / "<" / ">" / "==") _ (string / number)

string
    = '"' chars:DoubleStringCharacter* '"' { return chars.join(''); }

DoubleStringCharacter
    = !('"' / "\\\\") char:. { return char; }
    / "\\\\" sequence:EscapeSequence { return sequence; }

EscapeSequence
    = "'"
    / '"'
    / "\\\\"
    / "b"  { return "\\b";   }
    / "f"  { return "\\f";   }
    / "n"  { return "\\n";   }
    / "r"  { return "\\r";   }
    / "t"  { return "\\t";   }
    / "v"  { return "\\x0B"; }

number
    = digits:[0-9]+ after:("." [0-9]+)? exp:("e" "-"? [0-9]+)? units:[GKM]? { return digits.join(""); }

unumber
    = v:(number / single) _ u:atom {return {value:v, units:u};}
`;

class BenchChecker {
    constructor() {
        this.parser = PegJS.generate(Grammar);
    }

    check_env(b) {
        let envs = {};
        let errors = [];

        b.env.map((x) => {if (x.name && (x.name in envs)) envs[x.name]++; else envs[x.name] = 1;});

        Object.keys(envs).map((key, index) => {
            if (envs[key] > 1) {
                errors.push({severity: "warning",
                    text: "Duplicated enviroment variable: " + key});
            }
        });
        return errors;
    }

    add_vars(vars, morevars) {
        return Object.keys(morevars).reduce((a, x) => {
            if (morevars[x] || !a[x]) a[x] = morevars[x];
            return a;
        }, vars)
    }

    get_vars(ast, shadowed) {
        if (Array.isArray(ast)) {
            return ast.reduce((a, x) => this.add_vars(a, this.get_vars(x, shadowed)), {});
        }
        if (ast.name && ast.args && (ast.name === "var" || ast.name === "numvar")) {
            let c = {};
            if (!shadowed[ast.args[0]])
                c[ast.args[0]] = ast.args[1];
            return c;
        }
        if (ast.name && ast.args && ast.name === "defaults") {
            return ast.args.reduce((a, x) => {a[x.key] = x.value; return a;}, {});
        }

        let newshadowed = Object.keys(shadowed).reduce((a, x) => {a[x] = true; return a;}, {});
        if (ast.name && ast.name === "loop") {
            newshadowed = ast.args.reduce((a, x) => {
                if (x.key === "iterator") a[x.value] = true;
                return a;
            });
        }

        return ["args", "body", "value"].reduce(
            (a, x) => ast[x] ? this.add_vars(a, this.get_vars(ast[x], newshadowed)) : a ,{});
    }

    analyze(b) {
        let result = {env : b.env, extra: []};
        let ast = null;
        let max = b.env.reduce((a, x) => x.id > a ? x.id : a, 0);

        try {
            ast = this.parse(b.script_body);
        } catch (e) {
            return result; // If script can't be parsed, no further analysis is available
        }

        let vars = this.get_vars(ast, {});

        for (var i in result.env) {
            if (result.env[i].name in vars != (!result.env[i].unused)) {
                result.env[i].unused = !result.env[i].unused;
                result.env[i].id = ++max;
            }
        }

        let usedVars = result.env.reduce((a, x) => {a[x.name] = true; return a;}, {});
        result.extra = Object.keys(vars).reduce(
            (a, x) => usedVars[x] ? a : a.concat([{name: x, value: vars[x], id: ++max}]), []);

        return result;
    }

    parse(text) {
        let script_id = IndentAdder.add_indents(text, "_INDENT_", "_DEDENT_ ",
                            "#", "'\"", "([", ")]");
        return this.parser.parse(script_id);
    }

    check_script(b) {
        // bypass for non-bdl scripts
        if (!b.script_body.startsWith("#!benchDL")) return [];

        let ast = null;
        try {
            ast = this.parse(b.script_body);
        } catch (e) {
            if (e.name  && e.name === "SyntaxError") {
                return [{severity: "danger", text: "Parse error: " + e.message + " Line:" + e.location.start.line + " Column:" + e.location.start.column}];
            } else {
                return [{severity: "danger", text: "Parse error: " + e}];
            }
        }

        if (ast.filter((node) => node.name === "make_install").length === 0) {
            let usedWorkers = {};
            ast.filter((node) => node.name === "pool").map(
                (node) => node.args.filter((n) => n.key === "worker_type").map(
                    (n) => {usedWorkers[n.value] = 1}));
            let usedWorkersList = Object.keys(usedWorkers);

            if (usedWorkersList.length > 0 &&
                (usedWorkersList.length > 1 || usedWorkersList[0] !== "dummy_worker")) {
                return [{severity: "warning", text: "Probably missing make_install for " + usedWorkersList}];
            }
        }

        return [];
    }

    get_errors(b) {
        return this.check_env(b).concat(this.check_script(b));
    }
}

var _BenchChecker = new BenchChecker();
export default _BenchChecker;
