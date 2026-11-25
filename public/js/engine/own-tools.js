// The tools of our own: small functions the engine runs for an agent when the model asks for them.
// A tool never runs code of the student or the model: the calculator has its own parser and no eval.

export class ToolError extends Error {
  constructor(message) {
    super(message);
    this.name = "ToolError";
  }
}

// The keys of the tools of our own, in the order the student sees them. engine/tools.js holds what each one is.
export const OWN_TOOL_KEYS = ["calculator", "datetime", "wikipedia", "weather", "text_stats", "document_search", "notes"];
export const validToolKeys = (keys) => Array.isArray(keys) && keys.length <= OWN_TOOL_KEYS.length && keys.every((k) => OWN_TOOL_KEYS.includes(k)) && new Set(keys).size === keys.length;
// The known keys of a list, once each, in the fixed order.
export const cleanToolKeys = (keys) => (Array.isArray(keys) ? OWN_TOOL_KEYS.filter((k) => keys.includes(k)) : []);

const EXPRESSION_MAX = 200;
const DEPTH_MAX = 40;

const FUNCTIONS = {
  sqrt: (x) => Math.sqrt(x),
  abs: (x) => Math.abs(x),
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
  round: (x, digits = 0) => {
    const f = 10 ** Math.max(0, Math.min(10, Math.trunc(digits)));
    return Math.round(x * f) / f;
  },
  min: (...xs) => Math.min(...xs),
  max: (...xs) => Math.max(...xs),
  sin: (x) => Math.sin(x),
  cos: (x) => Math.cos(x),
  tan: (x) => Math.tan(x),
  ln: (x) => Math.log(x),
  log10: (x) => Math.log10(x),
  exp: (x) => Math.exp(x),
};
const CONSTANTS = { pi: Math.PI, e: Math.E };

function tokenize(text) {
  const tokens = [];
  const re = /\s*(?:(\d+(?:\.\d+)?|\.\d+)|([A-Za-z_][A-Za-z0-9_]*)|([-+*/^%(),]))/y;
  let at = 0;
  while (at < text.length) {
    re.lastIndex = at;
    const m = re.exec(text);
    if (!m) {
      if (text.slice(at).trim() === "") break;
      throw new ToolError(`The character "${text.slice(at).trim()[0]}" is not part of an arithmetic expression.`);
    }
    if (m[1] !== undefined) tokens.push({ kind: "num", value: Number(m[1]) });
    else if (m[2] !== undefined) tokens.push({ kind: "name", value: m[2].toLowerCase() });
    else tokens.push({ kind: "op", value: m[3] });
    at = re.lastIndex;
  }
  return tokens;
}

function parse(tokens) {
  let i = 0;
  const peek = () => tokens[i];
  const isOp = (v) => peek()?.kind === "op" && peek().value === v;
  const take = () => tokens[i++];
  const expect = (v) => {
    if (!isOp(v)) throw new ToolError(`Expected "${v}".`);
    i++;
  };
  const guard = (depth) => {
    if (depth > DEPTH_MAX) throw new ToolError("The expression is nested too deeply.");
  };
  function expression(depth) {
    guard(depth);
    let left = term(depth + 1);
    while (isOp("+") || isOp("-")) {
      const op = take().value;
      const right = term(depth + 1);
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }
  function term(depth) {
    let left = unary(depth + 1);
    while (isOp("*") || isOp("/") || isOp("%")) {
      const op = take().value;
      const right = unary(depth + 1);
      if ((op === "/" || op === "%") && right === 0) throw new ToolError("Division by zero.");
      left = op === "*" ? left * right : op === "/" ? left / right : left % right;
    }
    return left;
  }
  function unary(depth) {
    guard(depth);
    if (isOp("-")) {
      take();
      return -unary(depth + 1);
    }
    if (isOp("+")) {
      take();
      return unary(depth + 1);
    }
    return power(depth + 1);
  }
  function power(depth) {
    const base = primary(depth + 1);
    if (isOp("^")) {
      take();
      return base ** unary(depth + 1); // a power goes from the right, and may have a minus in its exponent
    }
    return base;
  }
  function primary(depth) {
    guard(depth);
    const token = take();
    if (!token) throw new ToolError("The expression ends too early.");
    if (token.kind === "num") return token.value;
    if (token.kind === "op" && token.value === "(") {
      const value = expression(depth + 1);
      expect(")");
      return value;
    }
    if (token.kind === "name") {
      if (isOp("(")) {
        const fn = FUNCTIONS[token.value];
        if (!fn) throw new ToolError(`Unknown function "${token.value}". Known: ${Object.keys(FUNCTIONS).join(", ")}.`);
        take();
        const args = [];
        if (!isOp(")")) {
          args.push(expression(depth + 1));
          while (isOp(",")) {
            take();
            args.push(expression(depth + 1));
          }
        }
        expect(")");
        if (args.length === 0) throw new ToolError(`The function ${token.value} needs an argument.`);
        return fn(...args);
      }
      if (token.value in CONSTANTS) return CONSTANTS[token.value];
      throw new ToolError(`Unknown name "${token.value}". Known constants: pi, e.`);
    }
    throw new ToolError(`Unexpected "${token.value}".`);
  }
  const value = expression(0);
  if (i < tokens.length) throw new ToolError(`Unexpected "${tokens[i].value}" after the end of the expression.`);
  return value;
}

// A number as short text: twelve significant digits, so 0.1 + 0.2 is 0.3.
const show = (value) => String(Number(value.toPrecision(12)));

export function calculate(expression) {
  if (typeof expression !== "string" || expression.trim() === "") throw new ToolError("Give an arithmetic expression, for example (1250 * 0.21) + 99.");
  if (expression.length > EXPRESSION_MAX) throw new ToolError(`The expression is longer than ${EXPRESSION_MAX} characters.`);
  let text = expression.replace(/×/g, "*").replace(/÷/g, "/");
  // A decimal comma (0,21) is read only when the expression has no point and no function: with a function a comma separates arguments.
  if (!text.includes(".") && !/[A-Za-z_]\s*\(/.test(text)) text = text.replace(/(\d),(\d)/g, "$1.$2");
  const value = parse(tokenize(text));
  if (!Number.isFinite(value)) throw new ToolError("The result is not a real number (check for a root of a negative number or a number that is too large).");
  return show(value);
}

// The date and the time now in a time zone (UTC without one).
export function clockText({ timezone } = {}, now = Date.now()) {
  const zone = typeof timezone === "string" && timezone.trim() !== "" ? timezone.trim() : "UTC";
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now));
  } catch {
    throw new ToolError(`Unknown time zone "${zone}". Use a name such as Europe/Prague or UTC.`);
  }
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const month = new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "numeric" }).format(new Date(now));
  // The ISO week of the date in that zone.
  const day = new Date(Date.UTC(Number(p.year), Number(month) - 1, Number(p.day)));
  const weekday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - weekday + 3);
  const firstThursday = new Date(Date.UTC(day.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((day - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${p.weekday} ${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute}:${p.second} (${zone}), week ${week}`;
}

const TEXT_MAX = 30000;

// Counts a text: characters, words, sentences, lines, the longest word, and (when asked) how many times one letter is in it.
export function countText({ text, letter } = {}) {
  if (typeof text !== "string" || text === "") throw new ToolError("Give the text to count in the argument text.");
  if (text.length > TEXT_MAX) throw new ToolError(`The text is longer than ${TEXT_MAX} characters.`);
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
  const sentences = (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? []).filter((part) => /[\p{L}\p{N}]/u.test(part)).length;
  const longest = words.reduce((best, word) => (word.length > best.length ? word : best), "");
  const parts = [`characters: ${text.length} (without spaces: ${text.replace(/\s/g, "").length})`, `words: ${words.length}`, `sentences: ${sentences}`, `lines: ${text.split("\n").length}`];
  if (longest !== "") parts.push(`longest word: "${longest}" (${longest.length} letters)`);
  if (letter !== undefined && letter !== null && letter !== "") {
    if (typeof letter !== "string" || [...letter].length !== 1) throw new ToolError("The argument letter must be one letter.");
    const wanted = letter.toLowerCase();
    parts.push(`letter "${letter}": ${[...text.toLowerCase()].filter((c) => c === wanted).length}`);
  }
  return parts.join(", ");
}
